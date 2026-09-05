\set ON_ERROR_STOP on

-- The naive system: a transactional Outbox, and a worker that retries a failed
-- delivery immediately, forever, with no idempotency on the consuming side.
--
-- Nothing here writes the lab's observations by hand. The retry count, the
-- duplicate effect and the circuit-breaker transitions are produced by running
-- this code against a downstream that is up or down, so the checks can assert
-- what the system did rather than what a fixture typed.

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE lab_state (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE orders (
  id text PRIMARY KEY,
  status text NOT NULL
);

CREATE TABLE outbox (
  event_id text PRIMARY KEY,
  aggregate_id text NOT NULL REFERENCES orders(id),
  delivered boolean NOT NULL DEFAULT false
);

CREATE TABLE delivery_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL,
  attempt_no integer NOT NULL,
  outcome text NOT NULL
);

CREATE TABLE downstream_effects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL,
  effect_key text NOT NULL
);

-- Written only by the breaker the solution installs. It stays empty while no
-- breaker exists, which is itself an observation the failure check relies on.
CREATE TABLE circuit_transitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_state text NOT NULL,
  to_state text NOT NULL
);

INSERT INTO lab_state(key, value) VALUES
  ('downstream', 'healthy'),
  ('circuit', 'closed'),
  ('consecutive_failures', '0');

-- The dependency. It succeeds only while it is up, and on success it applies
-- the side effect directly: nothing stands between redelivery and a duplicate.
CREATE FUNCTION downstream_call(p_event_id text) RETURNS text AS $$
DECLARE
  reachable text;
BEGIN
  SELECT value INTO reachable FROM lab_state WHERE key = 'downstream';
  IF reachable <> 'healthy' THEN
    RETURN 'downstream-unavailable';
  END IF;
  INSERT INTO downstream_effects(event_id, effect_key)
  VALUES (p_event_id, 'email:order-1');
  RETURN 'delivered';
END;
$$ LANGUAGE plpgsql;

-- One delivery attempt: numbered from what is already recorded, never passed in.
CREATE FUNCTION deliver_once(p_event_id text) RETURNS text AS $$
DECLARE
  next_no integer;
  result text;
BEGIN
  SELECT coalesce(max(attempt_no), 0) + 1 INTO next_no
  FROM delivery_attempts
  WHERE event_id = p_event_id;

  result := downstream_call(p_event_id);

  INSERT INTO delivery_attempts(event_id, attempt_no, outcome)
  VALUES (p_event_id, next_no, result);

  IF result = 'delivered' THEN
    UPDATE outbox SET delivered = true WHERE event_id = p_event_id;
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- The naive worker. It retries immediately, with no backoff and no budget, and
-- stops only on success or when it hits its own safety wall. p_wall is the size
-- of one burst, not the number of rows anybody expects to see: how many of them
-- are actually written depends on whether the dependency answers.
CREATE FUNCTION run_worker(p_event_id text, p_wall integer) RETURNS integer AS $$
DECLARE
  made integer := 0;
  result text;
BEGIN
  LOOP
    EXIT WHEN made >= p_wall;
    result := deliver_once(p_event_id);
    made := made + 1;
    EXIT WHEN result = 'delivered';
  END LOOP;
  RETURN made;
END;
$$ LANGUAGE plpgsql;

-- The Outbox guarantee: the domain change and the event to publish commit in
-- one transaction, so a crash between them cannot lose the event.
BEGIN;
INSERT INTO orders(id, status) VALUES ('order-1', 'created');
INSERT INTO outbox(event_id, aggregate_id) VALUES ('event-1', 'order-1');
COMMIT;
