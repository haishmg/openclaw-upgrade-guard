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
  ready_timeout="${GUARD_GATEWAY_READY_TIMEOUT_SECONDS:-300}"
  ready_interval="${GUARD_GATEWAY_READY_INTERVAL_SECONDS:-2}"
  deadline=$(( $(date +%s) + ready_timeout ))
  echo "[container] waiting up to ${ready_timeout}s for gateway readiness" >&2
  gateway_ready=0
  gateway_log_ready=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if ! kill -0 "$gateway_pid" >/dev/null 2>&1; then
      echo "[container] gateway process exited before readiness" >&2
      break
    fi
    if [ "$gateway_log_ready" != "1" ] && grep -q '\[gateway\] ready' /reports/gateway.log 2>/dev/null; then
      echo "[container] gateway startup log reports ready; waiting for probe/auth readiness" >&2
      gateway_log_ready=1
    fi
    if openclaw gateway probe --json > /reports/gateway-probe-last.json 2> /reports/gateway-probe-last.err; then
      if grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' /reports/gateway-probe-last.json; then
        echo "[container] gateway probe ready" >&2
        gateway_ready=1
        break
      fi
    fi
    sleep "$ready_interval"
  done
  if [ "$gateway_ready" != "1" ]; then
    if [ "$gateway_log_ready" = "1" ]; then
      echo "[container] gateway probe readiness timed out after startup ready; running guard so auth/probe failures are captured" >&2
    else
      echo "[container] gateway readiness wait timed out; running guard so failures are captured in the report" >&2
    fi
  fi
fi

set +e
guard_args=(
  /guard/bin/openclaw-upgrade-guard.js
  --mode "${GUARD_MODE:-container-rehearsal}" \
  --openclaw "${OPENCLAW_BIN:-openclaw}" \
  --timeout "${GUARD_TIMEOUT:-45}" \
  --out /reports/run
)
if [ -n "${GUARD_BASELINE:-}" ]; then
  guard_args+=(--baseline "$GUARD_BASELINE")
fi

node "${guard_args[@]}"
status="$?"
set -e

if [ -n "$gateway_pid" ]; then
  kill "$gateway_pid" >/dev/null 2>&1 || true
  wait "$gateway_pid" >/dev/null 2>&1 || true
fi

exit "$status"
