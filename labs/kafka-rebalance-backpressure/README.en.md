# Kafka: rebalance and backpressure

This isolated local workspace shows how a stopped consumer and a producer burst become lag and a rebalance. It uses only `apache/kafka:4.0.0`, named resources under `sds-kafka-rebalance-backpressure`, and an internal network with no published ports.

## Prediction

Before injecting the fault, write down what will happen to lag, how many consumer-group members will remain, and why adding partitions alone cannot fix a slow consumer.

## Start and healthy check

Docker and Docker Compose are required. From this directory, run:

```sh
./scripts/start.sh
./scripts/check.sh healthy
```

Expect three partitions, two consumers, and zero lag.

## Fault injection and check

```sh
./scripts/inject-failure.sh
./scripts/check.sh failure
```

The scenario stops one consumer, pauses the other, and publishes 3,000 records. The checks expect positive lag and a disrupted group.

## Your turn

Before reading the answer, try a fix yourself. Edit `.state/consumer.properties` — that is the file the consumers mount — and apply it:

```sh
$EDITOR .state/consumer.properties
./scripts/apply-my-changes.sh
./scripts/check.sh solution
```

The checks grade the running group, not your diff, so any configuration that drains the lag and keeps two members counts. Repeat as often as you like.

## Solution and debrief

```sh
./scripts/apply-solution.sh
./scripts/check.sh solution
```

Compare `starter/consumer.properties` with `solution/consumer.properties`. A larger batch helps drain the queue, but a production design also bounds producers, measures processing latency, and sizes partitions for real parallelism. Lag is a rate-mismatch symptom; a rebalance adds temporary unavailability.

## Safe reset

```sh
./scripts/reset.sh
```

Reset passes an explicit compose file and project name, removing only this workspace's containers, network, and volume. It never runs a global prune.
