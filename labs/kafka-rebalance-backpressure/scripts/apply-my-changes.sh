#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

# Applies YOUR edits to .state/consumer.properties — the file the consumers
# actually mount. apply-solution.sh overwrites it with the reference answer;
# this one keeps whatever you wrote, so you can try a fix before reading it.
resolve_compose

if [ ! -f "$LAB_DIR/.state/consumer.properties" ]; then
  echo "No .state/consumer.properties yet. Run ./scripts/start.sh first." >&2
  exit 1
fi

echo "Applying your consumer configuration:"
sed 's/^/  /' "$LAB_DIR/.state/consumer.properties"

compose unpause consumer-b >/dev/null 2>&1 || true
compose up -d --force-recreate consumer-a consumer-b
wait_for_group_members
wait_for_zero_lag
echo "Your configuration is live. Run ./scripts/check.sh solution to grade it."
