#!/usr/bin/env python3
import gzip
import http.server
import json
import os
import socketserver

import requests

PORT = int(os.getenv("PORT", "3000"))
ESPEJO_URL = os.getenv("ESPEJO_URL", "http://127.0.0.1:8080").rstrip("/")
CONNECT_TIMEOUT_SEC = float(os.getenv("PROXY_CONNECT_TIMEOUT_SEC", "2.5"))
READ_TIMEOUT_SEC = float(os.getenv("PROXY_READ_TIMEOUT_SEC", "12.0"))
HEALTH_TIMEOUT_SEC = float(os.getenv("PROXY_HEALTH_TIMEOUT_SEC", "3.0"))
PROXY_PREFIXES = ("/api/", "/auth/", "/owner/", "/vault/")


class ThreadingReuseTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "RAULIProxy/2.0"
    upstream = requests.Session()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="static", **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _filter_upstream_headers(self, response: requests.Response) -> dict:
        out = {}
        skip = {"content-length", "transfer-encoding", "content-encoding", "connection"}
        for header, value in response.headers.items():
            if header.lower() in skip:
                continue
            out[header] = value
        return out

    def _write_proxied_response(self, response: requests.Response) -> None:
        body = response.content
        enc = (response.headers.get("content-encoding") or "").lower()
        if enc == "gzip":
            try:
                body = gzip.decompress(body)
            except OSError:
                pass

        self.send_response(response.status_code)
        for header, value in self._filter_upstream_headers(response).items():
            self.send_header(header, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy_headers_from_request(self) -> dict:
        headers = {}
        for header, value in self.headers.items():
            if header.lower() not in ("content-length", "host", "accept-encoding"):
                headers[header] = value
        headers["Accept-Encoding"] = "identity"
        return headers

    def _is_proxy_path(self) -> bool:
        return self.path.startswith(PROXY_PREFIXES)

    def _upstream_url(self) -> str:
        return f"{ESPEJO_URL}{self.path}"

    def _proxy_request(self, method: str) -> None:
        body = None
        if method in {"POST", "PUT", "PATCH"}:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            response = self.upstream.request(
                method=method,
                url=self._upstream_url(),
                data=body,
                headers=self._proxy_headers_from_request(),
                timeout=(CONNECT_TIMEOUT_SEC, READ_TIMEOUT_SEC),
                allow_redirects=False,
            )
            self._write_proxied_response(response)
        except requests.RequestException as exc:
            self.send_error(502, f"Proxy Error: {exc}")

    def _serve_local_health(self) -> None:
        ok = False
        details = "upstream_unreachable"
        try:
            response = self.upstream.get(
                f"{ESPEJO_URL}/api/health",
                headers={"Accept-Encoding": "identity"},
                timeout=(CONNECT_TIMEOUT_SEC, HEALTH_TIMEOUT_SEC),
                allow_redirects=False,
            )
            ok = 200 <= response.status_code < 400
            details = f"upstream_status_{response.status_code}"
        except requests.RequestException:
            ok = False

        payload = {
            "ok": ok,
            "service": "rauli-proxy",
            "espejo_url": ESPEJO_URL,
            "details": details,
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._serve_local_health()
            return
        if self._is_proxy_path():
            self._proxy_request("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self._is_proxy_path():
            self._proxy_request("POST")
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if self._is_proxy_path():
            self._proxy_request("PUT")
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self._is_proxy_path():
            self._proxy_request("DELETE")
            return
        self.send_error(404, "Not Found")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with ThreadingReuseTCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Proxy server running at http://localhost:{PORT}")
        print("Serving static files from ./static")
        print(f"Proxying {PROXY_PREFIXES} to {ESPEJO_URL}")
        httpd.serve_forever()
