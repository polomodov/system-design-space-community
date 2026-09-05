#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
phase=${1:-healthy}
case "$phase" in
  healthy|failure|solution) ;;
  *)
    echo "Usage: $0 healthy|failure|solution" >&2
    exit 2
    ;;
esac
compose exec -T metrics python /workspace/check_metrics.py "$phase"
