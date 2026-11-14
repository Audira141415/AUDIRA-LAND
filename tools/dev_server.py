"""AUDIRA-LAND dev server: static web/ with Cache-Control no-store.

ES module imports are not cache-busted, so the plain `python -m http.server`
lets the browser serve stale modules after an edit. Usage:
    python tools/dev_server.py [port] [host]

Default host 0.0.0.0 so a phone on the same WiFi/LAN can open
http://<PC-IP>:<port>. Pass 127.0.0.1 to keep it local-only.
"""
import http.server
import os
import sys
from functools import partial


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    # PORT env (diisi preview launcher saat 8417 dipakai sesi lain) didahulukan
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8417))
    host = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
    handler = partial(NoCacheHandler, directory=os.path.normpath(root))
    with http.server.ThreadingHTTPServer((host, port), handler) as httpd:
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("10.255.255.255", 1))
            lan = s.getsockname()[0]
            s.close()
        except OSError:
            lan = "<IP-PC>"
        print(f"AUDIRA-LAND dev server: http://localhost:{port}  |  HP (WiFi sama): http://{lan}:{port}")
        httpd.serve_forever()
