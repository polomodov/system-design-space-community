#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

# Applies YOUR edits to .state/prometheus.rules.yml — the file Prometheus
# actually mounts. apply-solution.sh overwrites it with the reference rule;
# this one keeps whatever you wrote, so you can try a rule before reading it.
resolve_compose

if [ ! -f "$LAB_DIR/.state/prometheus.rules.yml" ]; then
  echo "No .state/prometheus.rules.yml yet. Run ./scripts/start.sh first." >&2
  exit 1
fi

echo "Applying your alerting rules:"
sed 's/^/  /' "$LAB_DIR/.state/prometheus.rules.yml"

compose restart prometheus
wait_for_prometheus
# Give the rule group a couple of evaluation intervals before grading.
sleep 12
echo "Your rules are live. Run ./scripts/check.sh solution to grade them."
