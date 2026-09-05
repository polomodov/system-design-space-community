\set ON_ERROR_STOP on

-- Install the two controls the chapter separates, then re-run the SAME
-- scenario. Neither control is described in prose here: the retry bound is a
-- trigger that refuses calls, and the duplicate suppression is a primary key.
-- Both refuse work at the database level, so the checks can probe them instead
-- of counting rows somebody inserted.

-- ---------------------------------------------------------------------------
-- Idempotent consumption: an Inbox keyed by the stable event id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inbox (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- True only the first time an event id is seen. The primary key does the work;
-- a redelivery gets false without any comparison written by hand.
CREATE OR REPLACE FUNCTION inbox_admits(p_event_id text) RETURNS boolean AS $$
DECLARE
  admitted text;
BEGIN
  INSERT INTO inbox(event_id) VALUES (p_event_id)
  ON CONFLICT DO NOTHING
  RETURNING event_id INTO admitted;
  RETURN admitted IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- The dependency now applies its effect only for an event the Inbox admits.
CREATE OR REPLACE FUNCTION downstream_call(p_event_id text) RETURNS text AS $$
DECLARE
  reachable text;
BEGIN
  SELECT value INTO reachable FROM lab_state WHERE key = 'downstream';
  IF reachable <> 'healthy' THEN
    RETURN 'downstream-unavailable';
  END IF;
  IF inbox_admits(p_event_id) THEN
    INSERT INTO downstream_effects(event_id, effect_key)
    VALUES (p_event_id, 'email:order-1');
  END IF;
  RETURN 'delivered';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Circuit breaker: a state machine over the attempt stream, not a label.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION breaker_threshold() RETURNS integer AS $$
  SELECT 3;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION move_circuit(p_to text) RETURNS void AS $$
DECLARE
  current text;
BEGIN
  SELECT value INTO current FROM lab_state WHERE key = 'circuit';
  IF current = p_to THEN
    RETURN;
  END IF;
  UPDATE lab_state SET value = p_to WHERE key = 'circuit';
  INSERT INTO circuit_transitions(from_state, to_state) VALUES (current, p_to);
END;
$$ LANGUAGE plpgsql;

-- Refuses the call while the circuit is open. This is what bounds the storm:
-- the worker does not decide to stop, it is stopped.
CREATE OR REPLACE FUNCTION breaker_guard() RETURNS trigger AS $$
DECLARE
  circuit text;
BEGIN
  SELECT value INTO circuit FROM lab_state WHERE key = 'circuit';
  IF circuit = 'open' THEN
    RAISE EXCEPTION 'circuit is open for %', NEW.event_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION breaker_observe() RETURNS trigger AS $$
DECLARE
  failures integer;
BEGIN
  IF NEW.outcome = 'delivered' THEN
    UPDATE lab_state SET value = '0' WHERE key = 'consecutive_failures';
    PERFORM move_circuit('closed');
    RETURN NULL;
  END IF;

  UPDATE lab_state
  SET value = (value::integer + 1)::text
  WHERE key = 'consecutive_failures'
  RETURNING value::integer INTO failures;

  IF failures >= breaker_threshold() THEN
    PERFORM move_circuit('open');
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS breaker_guard_trigger ON delivery_attempts;
CREATE TRIGGER breaker_guard_trigger
  BEFORE INSERT ON delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION breaker_guard();

DROP TRIGGER IF EXISTS breaker_observe_trigger ON delivery_attempts;
CREATE TRIGGER breaker_observe_trigger
  AFTER INSERT ON delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION breaker_observe();

-- One probe is allowed after the cool-down; the breaker itself decides what the
-- probe means when the attempt lands.
CREATE OR REPLACE FUNCTION half_open_circuit() RETURNS void AS $$
BEGIN
  PERFORM move_circuit('half-open');
  UPDATE lab_state SET value = '0' WHERE key = 'consecutive_failures';
END;
$$ LANGUAGE plpgsql;

-- The protected worker retries until the breaker refuses it. The refusal is a
-- real trigger exception, counted here the way a client would log it.
CREATE OR REPLACE FUNCTION run_protected_worker(p_event_id text, p_wall integer)
RETURNS integer AS $$
DECLARE
  made integer := 0;
  result text;
BEGIN
  LOOP
    EXIT WHEN made >= p_wall;
    BEGIN
      result := deliver_once(p_event_id);
    EXCEPTION WHEN check_violation THEN
      UPDATE lab_state SET value = (value::integer + 1)::text WHERE key = 'refusals';
      EXIT;
    END;
    made := made + 1;
    EXIT WHEN result = 'delivered';
  END LOOP;
  RETURN made;
END;
$$ LANGUAGE plpgsql;

-- Probes whether the breaker is refusing right now. Both branches roll the
-- probe row back, so asking the question does not change the answer.
CREATE OR REPLACE FUNCTION breaker_refuses(p_event_id text) RETURNS boolean AS $$
BEGIN
  BEGIN
    INSERT INTO delivery_attempts(event_id, attempt_no, outcome)
    VALUES (p_event_id, -1, 'breaker-probe');
    RAISE EXCEPTION 'breaker let the probe through' USING ERRCODE = 'raise_exception';
  EXCEPTION
    WHEN check_violation THEN RETURN true;
    WHEN raise_exception THEN RETURN false;
  END;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Re-run the identical scenario with the controls in place.
-- ---------------------------------------------------------------------------
TRUNCATE delivery_attempts, downstream_effects, circuit_transitions, inbox;
UPDATE outbox SET delivered = false WHERE event_id = 'event-1';
UPDATE lab_state SET value = 'closed' WHERE key = 'circuit';
UPDATE lab_state SET value = '0' WHERE key = 'consecutive_failures';
INSERT INTO lab_state(key, value) VALUES ('refusals', '0')
ON CONFLICT (key) DO UPDATE SET value = '0';

UPDATE lab_state SET value = 'failed' WHERE key = 'downstream';
-- Same wall as the naive burst. How many attempts are actually made is now the
-- breaker's decision, not the wall's.
SELECT run_protected_worker('event-1', 12) AS attempts_during_outage;

-- While the circuit is open, further attempts are refused outright.
SELECT run_protected_worker('event-1', 12) AS attempts_while_open;

UPDATE lab_state SET value = 'healthy' WHERE key = 'downstream';
SELECT half_open_circuit();
SELECT run_protected_worker('event-1', 1) AS probe_after_cooldown;

-- At-least-once redelivery again. The attempt happens; the effect does not.
SELECT run_protected_worker('event-1', 1) AS redelivery;
