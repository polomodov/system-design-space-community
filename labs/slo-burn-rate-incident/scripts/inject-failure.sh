#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
printf '%s\n' failure > "$LAB_DIR/.state/mode"
sleep 12
echo "Failure injected: the synthetic service now returns a 20% error ratio."
