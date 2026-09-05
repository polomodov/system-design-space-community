#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
cp "$LAB_DIR/solution/prometheus.rules.yml" "$LAB_DIR/.state/prometheus.rules.yml"
compose restart prometheus
wait_for_prometheus
sleep 12
echo "Solution applied: Prometheus evaluates paired burn-rate windows."
