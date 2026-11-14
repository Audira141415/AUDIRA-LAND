#!/usr/bin/env python3
"""Server statis dev AUDIRA-LAND: no-cache, supaya edit modul JS/CSS langsung terbaca."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else "web"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    print(f"AUDIRA-LAND dev server (no-cache) di http://localhost:{PORT}  dir={DIRECTORY}")
    ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
