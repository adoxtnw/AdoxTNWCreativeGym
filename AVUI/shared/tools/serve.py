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
from urllib.parse import unquote
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _paths import app_root, AVUI

"""`--all` serves the WHOLE WORKSPACE rather than one app.

That is what production looks like: both apps sit as sibling folders under one
root, so `../MAP/index.html` and `../BATTLE SYSTEM/index.html` resolve. Serving
one app per port made those relative paths unreachable locally — the bridge
between the two prototypes worked deployed and 404'd while being built, which is
the worst way round. Per-app mode is still there and still the default."""
ALL = "--all" in sys.argv
if ALL: sys.argv.remove("--all")
ROOT = AVUI if ALL else app_root()

ASSET = re.compile(rb'(src|href)="((?:src|styles)/[^"?]+)"')

class NoCache(SimpleHTTPRequestHandler):
    """Python's table calls a .m4a `audio/mp4a-latm`, which is the raw-stream
    type, not the container. Some browsers refuse to decode audio served under
    it. GitHub Pages gets this right on its own; the dev server has to be
    told, or music works when deployed and not while it is being built."""
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map,
                          **{".m4a": "audio/mp4", ".mp4": "video/mp4",
                             ".mp3": "audio/mpeg", ".wav": "audio/wav",
                             ".ogg": "audio/ogg"})

    def case_error(self):
        """Answer the way LINUX would, not the way macOS does.

        macOS filesystems are case-INSENSITIVE, so `/map/index.html` and
        `/Map/Index.html` are served here exactly as happily as the real
        `/MAP/index.html`. GitHub Pages runs Linux and refuses all but the true
        spelling — so a wrong-case URL works on the machine it was written on
        and 404s the moment it is uploaded. That is how a stray lowercase gets
        into a link, a bookmark or a note and survives: nothing local ever
        objects.

        This makes the dev server object. Returns the correct spelling when the
        request only differs by case, or None when the path is fine.
        """
        rel = unquote(self.path.split("?")[0]).lstrip("/")
        if not rel:
            return None
        root = os.path.abspath(ROOT)
        cur, fixed = root, []
        for part in rel.split("/"):
            if part in ("", "."):
                continue
            if not os.path.isdir(cur):
                return None                     # not a path question any more
            names = os.listdir(cur)
            if part in names:
                fixed.append(part)
            else:
                match = [n for n in names if n.lower() == part.lower()]
                if not match:
                    return None                 # genuinely missing: a plain 404
                fixed.append(match[0])
            cur = os.path.join(cur, fixed[-1])
        return "/" + "/".join(fixed) if fixed != rel.split("/") else None

    def do_GET(self):
        wrong = self.case_error()
        if wrong:
            msg = ("404 — wrong case.\n\n"
                   "  you asked for : %s\n"
                   "  the real path : %s\n\n"
                   "This machine would have served it anyway: macOS ignores case, "
                   "Linux does not, and GitHub Pages is Linux. Fixing the spelling "
                   "here is fixing it for the upload.\n" % (self.path.split("?")[0], wrong))
            body = msg.encode("utf-8")
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print("! wrong case: %s  ->  %s" % (self.path.split("?")[0], wrong))
            return
        return self._do_GET_inner()

    def _do_GET_inner(self):
        """index.html is rewritten on the fly so every local asset URL carries
        its own modification time. A no-store header only governs responses the
        browser is about to make; an entry already cached under older headers
        can still be reused, which silently serves a stale module. A changing
        URL cannot be. The file on disk is never touched."""
        path = self.path.split("?")[0]
        """Any index.html gets stamped, not just the root one — under `--all`
        the app entry points are /MAP/index.html and /BATTLE SYSTEM/index.html,
        and an unstamped one is exactly the stale-module trap this exists to
        avoid. Assets are resolved relative to the FILE, since each app names
        its own `src/` and `styles/`."""
        if path == "/" or path.endswith("/index.html") or path == "/index.html":
            rel = path.lstrip("/") or "index.html"
            if rel.endswith("/"): rel += "index.html"
            rel = unquote(rel)
            base = os.path.dirname(os.path.join(os.path.abspath(ROOT), rel))
            full = os.path.join(os.path.abspath(ROOT), rel)
            try:
                body = open(full, "rb").read()
            except OSError:
                return super().do_GET()
            def stamp(m, base=base):
                attr, rel = m.group(1), m.group(2).decode()
                try: v = int(os.path.getmtime(os.path.join(base, rel)))
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
    if ALL:
        print("  whole workspace: /MAP/  and  /BATTLE%20SYSTEM/  — sibling paths resolve")
    ThreadingHTTPServer(("", port), handler).serve_forever()
