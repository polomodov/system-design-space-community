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

description=$(group_description || true)
# LAG (column 6) is "-" until a partition commits an offset; awk coerces that
# to 0, so guard the LAG column itself and require every partition to report.
lag=$(printf '%s\n' "$description" | awk -v want="$TOPIC_PARTITIONS" '
  $2 == "lab-events" && $6 ~ /^[0-9]+$/ { total += $6; rows += 1 }
  END { if (rows == want) print total; else print -1 }
')
partitions=$(printf '%s\n' "$description" | awk '$2 == "lab-events" && $3 ~ /^[0-9]+$/ { rows += 1 } END { print rows + 0 }')
members=$(printf '%s\n' "$description" | awk '$2 == "lab-events" && $7 != "-" { seen[$7] = 1 } END { for (id in seen) count += 1; print count + 0 }')

case "$phase" in
  healthy|solution)
    [ "$partitions" -eq "$TOPIC_PARTITIONS" ] && partitions_ok=true || partitions_ok=false
    [ "$members" -eq "$EXPECTED_MEMBERS" ] && members_ok=true || members_ok=false
    [ "$lag" -eq 0 ] && lag_ok=true || lag_ok=false
    report partitions-visible "$partitions_ok" "$TOPIC_PARTITIONS topic partitions are visible (actual: $partitions)"
    report rebalance-stable "$members_ok" "$EXPECTED_MEMBERS consumers own assignments (actual: $members)"
    report lag-recovers "$lag_ok" "consumer lag is zero (actual: $lag)"
    ;;
  failure)
    [ "$lag" -gt 0 ] && lag_ok=true || lag_ok=false
    [ "$members" -lt "$EXPECTED_MEMBERS" ] && members_ok=true || members_ok=false
    report backpressure-observed "$lag_ok" "consumer lag is positive (actual: $lag)"
    report rebalance-disruption-observed "$members_ok" "fewer than two consumers are active (actual: $members)"
    ;;
  *)
    echo "Usage: $0 healthy|failure|solution" >&2
    exit 2
    ;;
esac

[ "$failed" -eq 0 ]
