#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
compose down --volumes --remove-orphans --timeout 10
echo "Reset complete for Compose project $COMPOSE_PROJECT."
