#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose up -d db runner
wait_for_database
compose exec -T runner psql -X -v ON_ERROR_STOP=1 -f /workspace/starter/schema.sql >/dev/null
echo "Retry/Outbox lab is healthy. Run ./scripts/check.sh healthy."
