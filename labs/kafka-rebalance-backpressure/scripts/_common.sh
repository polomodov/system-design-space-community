#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
LAB_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
LAB_ID=kafka-rebalance-backpressure
COMPOSE_PROJECT=sds-kafka-rebalance-backpressure
COMPOSE_FILE=$LAB_DIR/compose.yaml

if [ "$(basename -- "$LAB_DIR")" != "$LAB_ID" ] || [ "$(basename -- "$(dirname -- "$LAB_DIR")")" != "labs" ]; then
  echo "Refusing to run outside labs/$LAB_ID" >&2
  exit 2
fi

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_STYLE=plugin
  elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    COMPOSE_STYLE=standalone
  else
    echo "Docker Compose is required (docker compose or docker-compose)." >&2
    return 1
  fi
  export COMPOSE_STYLE
}

compose() {
  : "${COMPOSE_STYLE:?call resolve_compose first}"
  if [ "$COMPOSE_STYLE" = plugin ]; then
    docker compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" "$@"
  else
    docker-compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" "$@"
  fi
}

wait_for_kafka() {
  attempts=0
  until compose exec -T kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:9092 >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 45 ]; then
      echo "Kafka did not become ready." >&2
      return 1
    fi
    sleep 2
  done
}

group_description() {
  compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh \
    --bootstrap-server kafka:9092 \
    --group sds-lab-consumers \
    --describe 2>/dev/null
}

TOPIC_PARTITIONS=3
EXPECTED_MEMBERS=2

# kafka-consumer-groups prints "-" in CURRENT-OFFSET and LAG for a partition
# that has no committed offset yet, which is normal for up to
# auto.commit.interval.ms after a join or rebalance. Guarding only the numeric
# PARTITION column let awk coerce that "-" to 0, so the sum read as "lag 0"
# while the real lag was simply unknown. Guard the LAG column instead, and
# require every partition to report before trusting the total.
group_lag() {
  group_description | awk -v want="$TOPIC_PARTITIONS" '
    $2 == "lab-events" && $6 ~ /^[0-9]+$/ { total += $6; rows += 1 }
    END { if (rows == want) print total; else print -1 }
  '
}

group_members() {
  group_description | awk '$2 == "lab-events" && $7 != "-" { seen[$7] = 1 } END { for (id in seen) count += 1; print count + 0 }'
}

# Zero lag is satisfiable by a single consumer: with one member joined it owns
# all three partitions and drains them, so waiting on lag alone returned while
# the second consumer was still completing JoinGroup. check.sh then asserted
# two members and failed intermittently — the "transient" rebalance-stable
# miss recorded in the acceptance evidence.
wait_for_group_members() {
  attempts=0
  while :; do
    members=$(group_members || printf '%s\n' 0)
    if [ "$members" -eq "$EXPECTED_MEMBERS" ] 2>/dev/null; then
      return 0
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 45 ]; then
      echo "Consumer group did not stabilize; members: $members (expected $EXPECTED_MEMBERS)" >&2
      return 1
    fi
    sleep 2
  done
}

wait_for_zero_lag() {
  attempts=0
  while :; do
    lag=$(group_lag || printf '%s\n' -1)
    if [ "$lag" -eq 0 ] 2>/dev/null; then
      return 0
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 45 ]; then
      echo "Consumer lag did not drain; last value: $lag" >&2
      return 1
    fi
    sleep 2
  done
}
