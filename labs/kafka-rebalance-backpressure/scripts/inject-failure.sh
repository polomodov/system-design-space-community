#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose stop -t 5 consumer-a
compose pause consumer-b

i=1
while [ "$i" -le 3000 ]; do
  printf 'burst-%05d\n' "$i"
  i=$((i + 1))
done | compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server kafka:9092 --topic lab-events >/dev/null

sleep 12
echo "Failure injected: one consumer stopped, one paused, producer burst queued."
