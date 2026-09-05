#!/bin/sh
set -eu
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/_common.sh"

resolve_compose
phase=${1:-healthy}
failed=0

report() {
  check_id=$1
  result=$2
  detail=$3
  if [ "$result" = true ]; then
    echo "PASS $check_id - $detail"
  else
    echo "FAIL $check_id - $detail"
    failed=1
  fi
}

# Every assertion below reads a consequence of running the workspace, or probes
# a constraint live. An earlier version of this script counted rows that the
# fixture had just inserted literally, so it passed whatever the SQL claimed.

case "$phase" in
  healthy)
    atomic_count=$(sql_value "SELECT (SELECT count(*) FROM orders) + (SELECT count(*) FROM outbox);")
    attempt_count=$(sql_value "SELECT count(*) FROM delivery_attempts;")
    [ "$atomic_count" -eq 2 ] && atomic_ok=true || atomic_ok=false
    [ "$attempt_count" -eq 0 ] && attempts_ok=true || attempts_ok=false
    report outbox-atomic "$atomic_ok" "order and outbox event committed together (rows: $atomic_count)"
    report no-retry-pressure "$attempts_ok" "no delivery attempts before the fault (actual: $attempt_count)"
    ;;
  failure)
    outage_attempts=$(sql_value "SELECT count(*) FROM delivery_attempts WHERE outcome = 'downstream-unavailable';")
    transitions=$(sql_value "SELECT count(*) FROM circuit_transitions;")
    effect_count=$(sql_value "SELECT count(*) FROM downstream_effects WHERE event_id = 'event-1';")
    has_inbox=$(sql_value "SELECT (to_regclass('public.inbox') IS NOT NULL)::text;")
    # The worker was free to keep calling because nothing refused it: an empty
    # transition log is the evidence that no breaker bounded the burst.
    { [ "$outage_attempts" -ge 10 ] && [ "$transitions" -eq 0 ]; } && retry_ok=true || retry_ok=false
    # The duplicate exists because no Inbox stood between redelivery and the
    # effect, not because a second row was inserted by the fixture.
    { [ "$effect_count" -gt 1 ] && [ "$has_inbox" = false ]; } && duplicate_ok=true || duplicate_ok=false
    report retry-amplification-observed "$retry_ok" "immediate retries ran unbounded (failed attempts: $outage_attempts, breaker transitions: $transitions)"
    report duplicate-effect-observed "$duplicate_ok" "redelivery duplicated the effect with no Inbox present (effects: $effect_count, inbox: $has_inbox)"
    ;;
  solution)
    outage_attempts=$(sql_value "SELECT count(*) FROM delivery_attempts WHERE outcome = 'downstream-unavailable';")
    threshold=$(sql_value "SELECT breaker_threshold();")
    refusals=$(sql_value "SELECT value FROM lab_state WHERE key = 'refusals';")
    cycle=$(sql_value "SELECT string_agg(from_state || '->' || to_state, ',' ORDER BY id) FROM circuit_transitions;")
    effect_count=$(sql_value "SELECT count(*) FROM downstream_effects WHERE event_id = 'event-1';")
    # Probing the Inbox with the same event id must be refused by its primary
    # key; a true here would mean the effect could still be applied twice.
    inbox_refuses=$(sql_value "SELECT (NOT inbox_admits('event-1'))::text;")
    delivered=$(sql_value "SELECT delivered::text FROM outbox WHERE event_id = 'event-1';")
    circuit=$(sql_value "SELECT value FROM lab_state WHERE key = 'circuit';")

    { [ "$outage_attempts" -eq "$threshold" ] && [ "$refusals" -gt 0 ]; } && bounded_ok=true || bounded_ok=false
    [ "$cycle" = "closed->open,open->half-open,half-open->closed" ] && cycle_ok=true || cycle_ok=false
    { [ "$effect_count" -eq 1 ] && [ "$inbox_refuses" = true ]; } && duplicate_ok=true || duplicate_ok=false
    { [ "$delivered" = true ] && [ "$circuit" = closed ]; } && delivered_ok=true || delivered_ok=false

    report breaker-bounds-storm "$bounded_ok" "the breaker stopped the burst at its threshold and refused further calls (failed attempts: $outage_attempts of threshold $threshold, refusals: $refusals)"
    report breaker-cycles "$cycle_ok" "the breaker walked open, half-open and closed (observed: ${cycle:-none})"
    report duplicates-suppressed "$duplicate_ok" "Inbox admits one effect for one event and refuses the redelivery (effects: $effect_count, refuses again: $inbox_refuses)"
    report outbox-delivered "$delivered_ok" "outbox is delivered and the circuit is closed"
    ;;
  *)
    echo "Usage: $0 healthy|failure|solution" >&2
    exit 2
    ;;
esac

[ "$failed" -eq 0 ]
