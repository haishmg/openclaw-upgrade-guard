#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$OPENCLAW_STATE_DIR" /reports

if [ -d /fixture ]; then
  cp -a /fixture/. "$OPENCLAW_STATE_DIR"/
fi

gateway_pid=""
if [ "${GUARD_START_GATEWAY:-1}" = "1" ]; then
  openclaw gateway run --allow-unconfigured --bind loopback > /reports/gateway.log 2>&1 &
  gateway_pid="$!"
  sleep "${GUARD_GATEWAY_BOOT_SECONDS:-5}"
fi

set +e
node /guard/bin/openclaw-upgrade-guard.js \
  --mode "${GUARD_MODE:-container-rehearsal}" \
  --openclaw "${OPENCLAW_BIN:-openclaw}" \
  --timeout "${GUARD_TIMEOUT:-45}" \
  --out /reports/run
status="$?"
set -e

if [ -n "$gateway_pid" ]; then
  kill "$gateway_pid" >/dev/null 2>&1 || true
  wait "$gateway_pid" >/dev/null 2>&1 || true
fi

exit "$status"
