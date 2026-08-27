#!/bin/bash
# Start/stop the dev server for this app. Toggle: run it again to stop.
#
# Uses ../shared/tools/serve.py, NOT `python3 -m http.server`. The difference matters:
# serve.py stamps every asset URL with its modification time, and without that your
# phone will happily keep running a cached copy of a file you just edited — the code
# is right, it simply never runs, and nothing tells you.
#
# IT SERVES THE WHOLE WORKSPACE, NOT JUST THIS APP — note the --all below.
# The two prototypes link to each other as siblings (`../MAP/`, `../BATTLE SYSTEM/`),
# which is what they are in the deployed build. A server rooted INSIDE one app puts
# those paths above its own root, so every cross-app link 404s: the map cannot open a
# battle, and the title screen cannot reach the map. Serving the folder that CONTAINS
# both makes local behave the way the upload does, which is the only arrangement worth
# testing against.
PORT=8178
APP="MAP"

PID=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$PID" ]; then
  kill $PID
  echo "Server stopped"
else
  cd "$(dirname "$0")/../shared/tools" || exit 1
  nohup python3 serve.py $PORT --all >/tmp/avui-serve.log 2>&1 &
  disown
  sleep 1
  IP=$(ipconfig getifaddr en0 2>/dev/null || echo localhost)
  echo "Serving the workspace at http://$IP:$PORT  (no-store, mtime-stamped)"
  echo "  this app:   http://$IP:$PORT/$(python3 -c 'import urllib.parse,os,sys;print(urllib.parse.quote(sys.argv[1]))' "$APP")/index.html"
  echo "  start here: http://$IP:$PORT/BATTLE%20SYSTEM/index.html"
fi
