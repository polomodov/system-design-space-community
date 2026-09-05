#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose down --volumes --remove-orphans --timeout 10
rm -f -- \
  "$LAB_DIR/.state/mode" \
  "$LAB_DIR/.state/prometheus.yml" \
  "$LAB_DIR/.state/prometheus.rules.yml"
rmdir "$LAB_DIR/.state" 2>/dev/null || true
echo "Reset complete for Compose project $COMPOSE_PROJECT."
