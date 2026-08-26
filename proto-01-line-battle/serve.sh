#!/bin/bash
PORT=8080
PID=$(lsof -ti :$PORT 2>/dev/null)

if [ -n "$PID" ]; then
  kill $PID
  echo "Server stopped"
else
  cd "$(dirname "$0")"
  python3 -m http.server $PORT &
  disown
  echo "Server started at http://$(ipconfig getifaddr en0):$PORT"
fi
