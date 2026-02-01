#!/usr/bin/env python3
import http.server
import socketserver
import os
import urllib.parse
import requests
import gzip
from urllib.parse import urlparse

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="static", **kwargs)
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_POST(self):
        if self.path.startswith('/api/') or self.path.startswith('/auth/'):
            # Proxy POST requests to espejo server
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                espejo_url = f"http://localhost:8080{self.path}"
                headers = {}
                for header, value in self.headers.items():
                    if header.lower() not in ['content-length', 'host', 'accept-encoding']:
                        headers[header] = value
                # Force no compression
                headers['Accept-Encoding'] = 'identity'
                
                response = requests.post(espejo_url, data=post_data, headers=headers, timeout=10)
                
                self.send_response(response.status_code)
                for header, value in response.headers.items():
                    if header.lower() not in ['content-length', 'transfer-encoding']:
                        self.send_header(header, value)
                self.end_headers()
                
                # Handle gzip compression
                content = response.content
                if response.headers.get('content-encoding') == 'gzip':
                    try:
                        content = gzip.decompress(content)
                        # Remove content-encoding header since we decompressed
                        self.send_header('content-encoding', 'identity')
                    except:
                        pass
                
                self.wfile.write(content)
            except Exception as e:
                self.send_error(502, f"Proxy Error: {str(e)}")
        else:
            self.send_error(404, "Not Found")
    
    def do_GET(self):
        if self.path.startswith('/api/') or self.path.startswith('/auth/'):
            # Proxy to espejo server
            try:
                espejo_url = f"http://localhost:8080{self.path}"
                headers = {}
                for header, value in self.headers.items():
                    if header.lower() not in ['content-length', 'host', 'accept-encoding']:
                        headers[header] = value
                # Force no compression
                headers['Accept-Encoding'] = 'identity'
                
                response = requests.get(espejo_url, headers=headers, timeout=10)
                
                self.send_response(response.status_code)
                for header, value in response.headers.items():
                    if header.lower() not in ['content-length', 'transfer-encoding']:
                        self.send_header(header, value)
                self.end_headers()
                
                # Handle gzip compression
                content = response.content
                if response.headers.get('content-encoding') == 'gzip':
                    try:
                        content = gzip.decompress(content)
                        # Remove content-encoding header since we decompressed
                        self.send_header('content-encoding', 'identity')
                    except:
                        pass
                
                self.wfile.write(content)
            except Exception as e:
                self.send_error(502, f"Proxy Error: {str(e)}")
        else:
            # Serve static files
            super().do_GET()

if __name__ == "__main__":
    PORT = 3000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Proxy server running at http://localhost:{PORT}")
        print("Serving static files from ./static")
        print("Proxying /api/* and /auth/* to http://localhost:8080")
        httpd.serve_forever()
