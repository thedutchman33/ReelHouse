#!/bin/sh
set -eu

PO_TOKEN_PROVIDER_PORT="${PO_TOKEN_PROVIDER_PORT:-4416}"
export PO_TOKEN_PROVIDER_URL="${PO_TOKEN_PROVIDER_URL:-http://127.0.0.1:${PO_TOKEN_PROVIDER_PORT}}"

/app/bgutil-pot server --host 127.0.0.1 --port "${PO_TOKEN_PROVIDER_PORT}" >>/tmp/bgutil-pot.log 2>&1 &
sidecar_pid=$!

backend_pid=""
cleanup() {
  if [ -n "${backend_pid}" ]; then
    kill -TERM "${backend_pid}" 2>/dev/null || true
  fi
  kill -TERM "${sidecar_pid}" 2>/dev/null || true
}
trap cleanup INT TERM

# Wait briefly for the loopback sidecar. The provider fails closed and the
# backend retains its tokenless fallback, so a slow start must not block the
# web server indefinitely.
ready=0
attempt=0
while [ "${attempt}" -lt 30 ]; do
  if curl -fsS "http://127.0.0.1:${PO_TOKEN_PROVIDER_PORT}/ping" >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.5
done
if [ "${ready}" -ne 1 ]; then
  echo "bgutil PO-token sidecar did not become ready; starting with fallback clients" >&2
fi

/app/bin/reelhouse-music-backend ${JAVA_OPTS} &
backend_pid=$!
status=0
wait "${backend_pid}" || status=$?

cleanup
exit "${status}"
