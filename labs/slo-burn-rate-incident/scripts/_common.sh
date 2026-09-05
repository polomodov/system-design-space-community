#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
LAB_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
LAB_ID=slo-burn-rate-incident
COMPOSE_PROJECT=sds-slo-burn-rate-incident
COMPOSE_FILE=$LAB_DIR/compose.yaml

if [ "$(basename -- "$LAB_DIR")" != "$LAB_ID" ] || [ "$(basename -- "$(dirname -- "$LAB_DIR")")" != "labs" ]; then
  echo "Refusing to run outside labs/$LAB_ID" >&2
  exit 2
fi

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_STYLE=plugin
  elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    COMPOSE_STYLE=standalone
  else
    echo "Docker Compose is required (docker compose or docker-compose)." >&2
    return 1
  fi
  export COMPOSE_STYLE
}

compose() {
  : "${COMPOSE_STYLE:?call resolve_compose first}"
  if [ "$COMPOSE_STYLE" = plugin ]; then
    docker compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" "$@"
  else
    docker-compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" "$@"
  fi
}

wait_for_prometheus() {
  attempts=0
  until compose exec -T metrics python -c "import urllib.request; urllib.request.urlopen('http://prometheus:9090/-/ready', timeout=2)" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 45 ]; then
      echo "Prometheus did not become ready." >&2
      return 1
    fi
    sleep 2
  done
}
