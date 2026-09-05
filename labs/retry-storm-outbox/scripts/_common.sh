#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
LAB_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
LAB_ID=retry-storm-outbox
COMPOSE_PROJECT=sds-retry-storm-outbox
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

wait_for_database() {
  attempts=0
  until compose exec -T db pg_isready -U lab -d lab >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 45 ]; then
      echo "PostgreSQL did not become ready." >&2
      return 1
    fi
    sleep 2
  done
}

sql_value() {
  compose exec -T runner psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"
}
