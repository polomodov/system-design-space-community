#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose exec -T runner psql -X -v ON_ERROR_STOP=1 -f /workspace/solution/apply.sql >/dev/null
echo "Solution applied: a breaker trigger refuses calls while open and the Inbox primary key suppresses redelivery. Run ./scripts/check.sh solution."
