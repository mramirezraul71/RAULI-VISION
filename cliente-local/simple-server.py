#!/usr/bin/env python3
import http.server
import socketserver
import os
import gzip
import requests


class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
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

    def do_POST(self):
        if self.path.startswith("/api/") or self.path.startswith("/auth/"):
            try:
                content_length = int(self.headers["Content-Length"])
                post_data = self.rfile.read(content_length)
                espejo_url = f"http://localhost:8080{self.path}"
                response = requests.post(
                    espejo_url,
                    data=post_data,
                    headers=self._proxy_headers_from_request(),
                    timeout=30,
                )
                self._write_proxied_response(response)
            except Exception as e:
                self.send_error(502, f"Proxy Error: {str(e)}")
        else:
            self.send_error(404, "Not Found")

    def do_GET(self):
        if self.path.startswith("/api/") or self.path.startswith("/auth/"):
            try:
                espejo_url = f"http://localhost:8080{self.path}"
                response = requests.get(
                    espejo_url,
                    headers=self._proxy_headers_from_request(),
                    timeout=30,
                )
                self._write_proxied_response(response)
            except Exception as e:
                self.send_error(502, f"Proxy Error: {str(e)}")
        else:
            super().do_GET()


if __name__ == "__main__":
    PORT = 3000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with ReuseTCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Proxy server running at http://localhost:{PORT}")
        print("Serving static files from ./static")
        print("Proxying /api/* and /auth/* to http://localhost:8080")
        httpd.serve_forever()
