#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
mkdir -p "$LAB_DIR/.state"
cp "$LAB_DIR/starter/consumer.properties" "$LAB_DIR/.state/consumer.properties"

compose up -d kafka
wait_for_kafka
compose exec -T kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists \
  --topic lab-events --partitions "$TOPIC_PARTITIONS" --replication-factor 1 >/dev/null
compose up -d consumer-a consumer-b

i=1
while [ "$i" -le 120 ]; do
  printf 'baseline-%04d\n' "$i"
  i=$((i + 1))
done | compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server kafka:9092 --topic lab-events >/dev/null

wait_for_group_members
wait_for_zero_lag
echo "Kafka lab is healthy. Run ./scripts/check.sh healthy."
