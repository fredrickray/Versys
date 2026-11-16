#!/bin/sh
set -eu

# Instacloud (and similar hosts) run the Dockerfile CMD and often cannot
# override the start command. Set PROCESS per service instead:
#   api | realtime | worker
PROCESS="$(echo "${PROCESS:-api}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

echo "[entrypoint] PROCESS=$PROCESS PORT=${PORT:-} API_PORT=${API_PORT:-} REALTIME_PORT=${REALTIME_PORT:-}"

case "$PROCESS" in
  api)
    exec node dist/main.api.js
    ;;
  realtime|socket)
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
