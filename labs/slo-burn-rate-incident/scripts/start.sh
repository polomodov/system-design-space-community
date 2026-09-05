#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
mkdir -p "$LAB_DIR/.state"
printf '%s\n' healthy > "$LAB_DIR/.state/mode"
cp "$LAB_DIR/starter/prometheus.yml" "$LAB_DIR/.state/prometheus.yml"
cp "$LAB_DIR/starter/prometheus.rules.yml" "$LAB_DIR/.state/prometheus.rules.yml"
compose up -d metrics prometheus
wait_for_prometheus
sleep 7
echo "SLO lab is healthy. Run ./scripts/check.sh healthy."
