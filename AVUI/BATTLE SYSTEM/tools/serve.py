#!/usr/bin/env python3
"""
Local dev server that never caches.

    python3 tools/serve.py [port]        # default 8177

Use this rather than `python3 -m http.server`. Now that behaviour is split
across a dozen files, a cached module means an edit that silently does nothing
— which is exactly the trap this avoids. Browsers hold onto .js and .css
aggressively over plain http.server; here every response says no-store.
"""
import sys, os, re, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

ASSET = re.compile(rb'(src|href)="((?:src|styles)/[^"?]+)"')

class NoCache(SimpleHTTPRequestHandler):
    def do_GET(self):
        """index.html is rewritten on the fly so every local asset URL carries
        its own modification time. A no-store header only governs responses the
        browser is about to make; an entry already cached under older headers
        can still be reused, which silently serves a stale module. A changing
        URL cannot be. The file on disk is never touched."""
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            full = os.path.join(os.path.abspath(ROOT), "index.html")
            try:
                body = open(full, "rb").read()
            except OSError:
                return super().do_GET()
            def stamp(m):
                attr, rel = m.group(1), m.group(2).decode()
                try: v = int(os.path.getmtime(os.path.join(os.path.abspath(ROOT), rel)))
                except OSError: v = 0
                return attr + b'="' + m.group(2) + f'?v={v}'.encode() + b'"'
            body = ASSET.sub(stamp, body)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, fmt, *args):      # quiet; errors still surface
        if not args or "200" not in str(args): super().log_message(fmt, *args)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8177
    handler = functools.partial(NoCache, directory=os.path.abspath(ROOT))
    print(f"serving {os.path.abspath(ROOT)} at http://localhost:{port}  (no-store)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
