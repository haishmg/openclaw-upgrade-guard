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

fixture="fixtures/openclaw-sanitized"
package="${OPENCLAW_PACKAGE:-openclaw@latest}"
image="${OPENCLAW_GUARD_IMAGE:-clawback:local}"
lock_dir="${OPENCLAW_CONTAINER_LOCK_DIR:-reports/.container-rehearsal.lock}"
keep_image="${OPENCLAW_KEEP_CONTAINER_IMAGE:-0}"
image_built=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep-image)
      keep_image=1
      shift
      ;;
    -h|--help|help)
      echo "Usage: scripts/run-container-rehearsal.sh [fixture] [--keep-image]"
      exit 0
      ;;
    -*)
      echo "[container] Unknown option: $1" >&2
      exit 2
      ;;
    *)
      fixture="$1"
      shift
      ;;
  esac
done

if [ ! -d "$fixture" ]; then
  echo "[container] Fixture directory not found: $fixture" >&2
  echo "[container] Create one with: node scripts/export-fixture.js ~/.openclaw $fixture" >&2
  exit 1
fi

mkdir -p reports
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "[container] Another container rehearsal appears to be running: $lock_dir" >&2
  echo "[container] Wait for it to finish before starting another target rehearsal." >&2
  exit 1
fi

cleanup() {
  local exit_status="$?"
  rm -rf "$lock_dir"
  if [ "$image_built" = "1" ] && [ "$keep_image" != "1" ]; then
    echo "[container] Removing rehearsal image: $image"
    "$runtime" image rm -f "$image" >/dev/null 2>&1 || true
  elif [ "$image_built" = "1" ]; then
    echo "[container] Keeping rehearsal image: $image"
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

echo "[container] Runtime: $runtime"
echo "[container] Fixture: $fixture"
echo "[container] Target OpenClaw package: $package"
echo "[container] Building image: $image"
"$runtime" build \
  --rm=true \
  --build-arg "OPENCLAW_PACKAGE=$package" \
  -t "$image" \
  -f docker/Dockerfile .
image_built=1

mkdir -p reports/container-rehearsal

echo "[container] Running target rehearsal in isolated container"
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
node scripts/print-update-next-step.js "$PWD/reports/container-rehearsal/run/report.json" || true
exit "$status"
