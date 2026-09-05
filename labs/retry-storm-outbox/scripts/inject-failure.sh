#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose exec -T runner psql -X -v ON_ERROR_STOP=1 -f /workspace/starter/inject-failure.sql >/dev/null
echo "Failure injected: the naive worker ran one burst against a dead dependency, then the event was redelivered. Run ./scripts/check.sh failure."
