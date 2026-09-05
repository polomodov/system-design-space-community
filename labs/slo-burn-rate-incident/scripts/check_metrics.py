import json
import sys
import urllib.parse
import urllib.request

PROMETHEUS = "http://prometheus:9090"


def query(expression: str) -> float:
    url = f"{PROMETHEUS}/api/v1/query?{urllib.parse.urlencode({'query': expression})}"
    with urllib.request.urlopen(url, timeout=5) as response:
        payload = json.load(response)
    results = payload["data"]["result"]
    if not results:
        return 0.0
    return float(results[0]["value"][1])


failed = False


def report(check_id: str, passed: bool, detail: str) -> None:
    global failed
    print(f"{'PASS' if passed else 'FAIL'} {check_id} - {detail}")
    failed = failed or not passed


phase = sys.argv[1] if len(sys.argv) > 1 else "healthy"
target_up = query('up{job="lab-service"}')
error_ratio = query(
    'sum(rate(lab_http_requests_total{status="500"}[5s])) '
    '/ clamp_min(sum(rate(lab_http_requests_total[5s])), 0.000001)'
)
burn_rate = error_ratio / 0.001
multi_window_alert = query(
    'count(ALERTS{alertname="SLOMultiWindowBurnRate",alertstate="firing"})'
)

if phase == "healthy":
    report("prometheus-target-up", target_up == 1, f"target up={target_up:g}")
    report("healthy-error-budget", burn_rate < 1, f"burn rate={burn_rate:.2f}x")
elif phase == "failure":
    report("error-rate-spike-observed", burn_rate > 14, f"burn rate={burn_rate:.2f}x")
    report(
        "starter-misses-multi-window-alert",
        multi_window_alert == 0,
        f"multi-window alerts firing={multi_window_alert:g}",
    )
elif phase == "solution":
    report("prometheus-target-up", target_up == 1, f"target up={target_up:g}")
    report(
        "multi-window-alert-fires",
        multi_window_alert >= 1,
        f"multi-window alerts firing={multi_window_alert:g}",
    )
else:
    print("Usage: check_metrics.py healthy|failure|solution", file=sys.stderr)
    sys.exit(2)

sys.exit(1 if failed else 0)
