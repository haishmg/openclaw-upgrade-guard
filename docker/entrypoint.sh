#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$OPENCLAW_STATE_DIR" /reports

if [ -d /fixture ]; then
  cp -a /fixture/. "$OPENCLAW_STATE_DIR"/
fi

exec node /guard/bin/openclaw-upgrade-guard.js \
  --mode "${GUARD_MODE:-baseline}" \
  --openclaw "${OPENCLAW_BIN:-openclaw}" \
  --timeout "${GUARD_TIMEOUT:-45}" \
  --out /reports/run
