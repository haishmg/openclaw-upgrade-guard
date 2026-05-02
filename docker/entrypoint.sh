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
  ready_timeout="${GUARD_GATEWAY_READY_TIMEOUT_SECONDS:-90}"
  ready_interval="${GUARD_GATEWAY_READY_INTERVAL_SECONDS:-2}"
  deadline=$(( $(date +%s) + ready_timeout ))
  echo "[container] waiting up to ${ready_timeout}s for gateway readiness" >&2
  gateway_ready=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if ! kill -0 "$gateway_pid" >/dev/null 2>&1; then
      echo "[container] gateway process exited before readiness" >&2
      break
    fi
    if grep -q '\[gateway\] ready' /reports/gateway.log 2>/dev/null; then
      echo "[container] gateway ready from startup log" >&2
      gateway_ready=1
      break
    fi
    if openclaw gateway probe --json > /reports/gateway-probe-last.json 2> /reports/gateway-probe-last.err; then
      if grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' /reports/gateway-probe-last.json; then
        echo "[container] gateway ready" >&2
        gateway_ready=1
        break
      fi
    fi
    sleep "$ready_interval"
  done
  if [ "$gateway_ready" != "1" ]; then
    echo "[container] gateway readiness wait timed out; running guard so failures are captured in the report" >&2
  fi
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
