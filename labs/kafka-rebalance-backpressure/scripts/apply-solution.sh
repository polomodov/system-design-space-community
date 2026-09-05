#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
cp "$LAB_DIR/solution/consumer.properties" "$LAB_DIR/.state/consumer.properties"
compose unpause consumer-b >/dev/null 2>&1 || true
compose up -d --force-recreate consumer-a consumer-b
wait_for_group_members
wait_for_zero_lag
echo "Solution applied: both consumers restarted with the recovery configuration."
