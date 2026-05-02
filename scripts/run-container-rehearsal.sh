#!/usr/bin/env bash
set -euo pipefail

runtime="${CONTAINER_RUNTIME:-}"
if [ -z "$runtime" ]; then
  if command -v docker >/dev/null 2>&1; then
    runtime=docker
  elif command -v podman >/dev/null 2>&1; then
    runtime=podman
  else
    echo "[container] Neither docker nor podman is installed. Install one to run the OpenClaw latest-version rehearsal." >&2
    exit 127
  fi
fi

fixture="${1:-fixtures/openclaw-sanitized}"
package="${OPENCLAW_PACKAGE:-openclaw@latest}"
image="${OPENCLAW_GUARD_IMAGE:-openclaw-upgrade-guard:local}"

if [ ! -d "$fixture" ]; then
  echo "[container] Fixture directory not found: $fixture" >&2
  echo "[container] Create one with: node scripts/export-fixture.js ~/.openclaw $fixture" >&2
  exit 1
fi

echo "[container] Runtime: $runtime"
echo "[container] Fixture: $fixture"
echo "[container] Target OpenClaw package: $package"
echo "[container] Building image: $image"
"$runtime" build \
  --build-arg "OPENCLAW_PACKAGE=$package" \
  -t "$image" \
  -f docker/Dockerfile .

mkdir -p reports/container-rehearsal

echo "[container] Running latest-version rehearsal in isolated container"
echo "[container] Reports: reports/container-rehearsal/run"
run_args=(run --rm)
if [ "$runtime" = "podman" ]; then
  run_args+=(--userns=keep-id)
fi

baseline_args=()
if [ -n "${OPENCLAW_BASELINE_FILE:-}" ]; then
  if [ ! -f "$OPENCLAW_BASELINE_FILE" ]; then
    echo "[container] Baseline file not found: $OPENCLAW_BASELINE_FILE" >&2
    exit 1
  fi
  baseline_abs="$(cd "$(dirname "$OPENCLAW_BASELINE_FILE")" && pwd)/$(basename "$OPENCLAW_BASELINE_FILE")"
  echo "[container] Baseline: $baseline_abs"
  baseline_args=(-e GUARD_BASELINE=/baseline/report.json -v "$baseline_abs:/baseline/report.json:ro")
fi

set +e
"$runtime" "${run_args[@]}" \
  -e GUARD_MODE="${GUARD_MODE:-container-rehearsal}" \
  -e GUARD_GATEWAY_READY_TIMEOUT_SECONDS="${GUARD_GATEWAY_READY_TIMEOUT_SECONDS:-300}" \
  -e GUARD_GATEWAY_READY_INTERVAL_SECONDS="${GUARD_GATEWAY_READY_INTERVAL_SECONDS:-2}" \
  "${baseline_args[@]}" \
  -v "$PWD/$fixture:/fixture:ro" \
  -v "$PWD/reports/container-rehearsal:/reports" \
  "$image"
status="$?"
set -e

echo "[container] Host HTML: $PWD/reports/container-rehearsal/run/report.html"
echo "[container] Host JSON: $PWD/reports/container-rehearsal/run/report.json"
exit "$status"
