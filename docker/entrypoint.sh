#!/bin/sh
set -eu

# Instacloud (and similar hosts) run the Dockerfile CMD and often cannot
# override the start command. Set PROCESS per service instead:
#   api | realtime | worker
PROCESS="${PROCESS:-api}"

case "$PROCESS" in
  api)
    exec node dist/main.api.js
    ;;
  realtime)
    exec node dist/main.realtime.js
    ;;
  worker)
    exec node dist/main.worker.js
    ;;
  *)
    echo "Unknown PROCESS='$PROCESS'. Use api, realtime, or worker." >&2
    exit 1
    ;;
esac
