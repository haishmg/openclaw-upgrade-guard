#!/usr/bin/env bash
set -euo pipefail

runtime="${CONTAINER_RUNTIME:-}"
if [ -z "$runtime" ]; then
  if command -v docker >/dev/null 2>&1; then
    runtime=docker
  elif command -v podman >/dev/null 2>&1; then
    runtime=podman
  else
    echo "Neither docker nor podman is installed." >&2
    exit 127
  fi
fi

fixture="${1:-fixtures/openclaw-sanitized}"
package="${OPENCLAW_PACKAGE:-openclaw@latest}"
image="${OPENCLAW_GUARD_IMAGE:-openclaw-upgrade-guard:local}"

if [ ! -d "$fixture" ]; then
  echo "Fixture directory not found: $fixture" >&2
  echo "Create one with: node scripts/export-fixture.js ~/.openclaw $fixture" >&2
  exit 1
fi

"$runtime" build \
  --build-arg "OPENCLAW_PACKAGE=$package" \
  -t "$image" \
  -f docker/Dockerfile .

mkdir -p reports/container-rehearsal

"$runtime" run --rm \
  -e GUARD_MODE="${GUARD_MODE:-baseline}" \
  -v "$PWD/$fixture:/fixture:ro" \
  -v "$PWD/reports/container-rehearsal:/reports" \
  "$image"
