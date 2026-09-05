# Retry storm, Circuit Breaker, idempotency, and Outbox

This `postgres:17.5-alpine3.21` workspace reproduces a downstream outage without external services: a transactional Outbox preserves the event, immediate retries amplify load, and at-least-once redelivery duplicates the effect.

## Prediction

Before the fault, estimate the load from 12 immediate retries and decide which mechanism protects capacity and which protects the business effect. Backoff/Circuit Breaker and idempotency solve different problems.

## Start and healthy check

```sh
./scripts/start.sh
./scripts/check.sh healthy
```

The order and Outbox event should appear in one transaction, with no delivery attempts yet.

## Fault injection and check

```sh
./scripts/inject-failure.sh
./scripts/check.sh failure
```

The naive worker makes the attempts itself: while the dependency is silent it retries immediately with no budget, and once it recovers the broker delivers the same event a second time. Neither the attempt count nor the duplicate effect is written by hand — the check reads what actually happened.

## Solution and debrief

```sh
./scripts/apply-solution.sh
./scripts/check.sh solution
```

Inspect `solution/apply.sql`. Both controls refuse work at the database level rather than describing it: a `BEFORE INSERT` trigger raises while the breaker is open, and that is what bounds the storm — the worker does not decide to stop, it is stopped. The duplicate is removed by the `inbox` primary key: redelivery gets `false` from `ON CONFLICT DO NOTHING` and the effect is never applied. The `closed → open → half-open → closed` transitions are written by the trigger itself into `circuit_transitions`.

Outbox makes publication atomic with the domain change; Inbox makes consumption idempotent. Drop the trigger and `breaker-bounds-storm` fails; drop the primary key and `duplicates-suppressed` fails.

## Safe reset

```sh
./scripts/reset.sh
```

The command removes only the named resources of `sds-retry-storm-outbox` through its explicit compose file. It performs no global cleanup.
