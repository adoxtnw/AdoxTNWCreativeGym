#!/bin/bash
# Start/stop the dev server for this app. Toggle: run it again to stop.
#
# Uses ../shared/tools/serve.py, NOT `python3 -m http.server`. The difference matters:
# serve.py stamps every asset URL with its modification time, and without that your
# phone will happily keep running a cached copy of a file you just edited — the code
# is right, it simply never runs, and nothing tells you.
PORT=8178
APP="MAP"

PID=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$PID" ]; then
  kill $PID
  echo "Server stopped"
else
  cd "$(dirname "$0")/../shared/tools" || exit 1
  nohup python3 serve.py $PORT --app "$APP" >/tmp/avui-serve.log 2>&1 &
  disown
  sleep 1
  IP=$(ipconfig getifaddr en0 2>/dev/null || echo localhost)
  echo "Serving \"$APP\" at http://$IP:$PORT  (no-store, mtime-stamped)"
fi
