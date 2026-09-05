# SLO burn rate and incident response

This local workspace uses `python:3.13.5-alpine3.22` and `prom/prometheus:v3.5.0`. A synthetic service exports request/error counters; Prometheus first uses a noisy single-window alert and then a correct multi-window burn-rate alert for a 99.9% SLO.

## Prediction

Before the fault, calculate the burn rate for a 20% error ratio with a 0.1% error budget. Predict how one short-window signal differs from paired short/long windows.

## Start and healthy check

```sh
./scripts/start.sh
./scripts/check.sh healthy
```

The target should be `up` and burn rate should remain below 1x.

## Fault injection and check

```sh
./scripts/inject-failure.sh
./scripts/check.sh failure
```

The service begins reporting a 20% error ratio. The starter confirms high burn but has no required `SLOMultiWindowBurnRate` alert.

## Your turn

Before reading the answer, write the alert yourself. Edit `.state/prometheus.rules.yml` — that is the file Prometheus mounts — and apply it:

```sh
$EDITOR .state/prometheus.rules.yml
./scripts/apply-my-changes.sh
./scripts/check.sh solution
```

The check grades what Prometheus actually evaluates, so any rule that fires on this burn rate counts. The alert must be named `SLOMultiWindowBurnRate`.

## Solution and debrief

```sh
./scripts/apply-solution.sh
./scripts/check.sh solution
```

Compare the rule files in `starter/` and `solution/`. The solution requires high burn in both 5s and 10s windows (an accelerated teaching equivalent of production windows). The fast window adds sensitivity; the long window rejects brief noise. A real incident still needs ownership, a runbook, communication, and a post-incident review.

## Safe reset

```sh
./scripts/reset.sh
```

Reset removes only the containers, network, volume, and three runtime files owned by `sds-slo-burn-rate-incident`; it never uses a global prune.
