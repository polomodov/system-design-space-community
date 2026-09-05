\set ON_ERROR_STOP on

-- Take the dependency down and let the naive worker run one burst against it.
-- Every attempt it records is an attempt it actually made: the storm is the
-- consequence of retrying immediately against something that is not answering.
UPDATE lab_state SET value = 'failed' WHERE key = 'downstream';
SELECT run_worker('event-1', 12) AS attempts_during_outage;

-- The dependency comes back and the delivery finally succeeds.
UPDATE lab_state SET value = 'healthy' WHERE key = 'downstream';
SELECT run_worker('event-1', 1) AS attempts_after_recovery;

-- At-least-once delivery: the broker cannot know the first ack was lost, so it
-- redelivers the same event_id. There is no Inbox, so downstream_call applies
-- the effect a second time. Nobody writes the duplicate row — the missing
-- idempotency check does.
SELECT run_worker('event-1', 1) AS redelivery;
