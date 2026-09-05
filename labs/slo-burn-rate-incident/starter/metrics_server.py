from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
import threading

MODE_PATH = os.environ.get("LAB_MODE_PATH", "/state/mode")
lock = threading.Lock()
successful_requests = 0
failed_requests = 0


def current_mode() -> str:
    try:
        with open(MODE_PATH, encoding="utf-8") as mode_file:
            return mode_file.read().strip()
    except OSError:
        return "healthy"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        global successful_requests, failed_requests
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok\n")
            return
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return

        with lock:
            if current_mode() == "failure":
                successful_requests += 80
                failed_requests += 20
            else:
                successful_requests += 100
            body = (
                "# HELP lab_http_requests_total Synthetic user requests.\n"
                "# TYPE lab_http_requests_total counter\n"
                f'lab_http_requests_total{{status="200"}} {successful_requests}\n'
                f'lab_http_requests_total{{status="500"}} {failed_requests}\n'
            ).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
