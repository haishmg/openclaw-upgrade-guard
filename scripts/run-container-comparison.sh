#!/usr/bin/env bash
set -euo pipefail

fixture="${1:-fixtures/openclaw-sanitized}"
target_package="${OPENCLAW_PACKAGE:-openclaw@latest}"
baseline_package="${OPENCLAW_BASELINE_PACKAGE:-}"

if [ -z "$baseline_package" ]; then
  if command -v openclaw >/dev/null 2>&1; then
    installed_version="$(openclaw --version 2>/dev/null | grep -Eo '[0-9]{4}\.[0-9]+\.[0-9]+' | head -n 1 || true)"
    if [ -n "$installed_version" ]; then
      baseline_package="openclaw@$installed_version"
    fi
  fi
fi

if [ -z "$baseline_package" ]; then
  echo "[compare] Could not detect the current OpenClaw package version." >&2
  echo "[compare] Set OPENCLAW_BASELINE_PACKAGE, for example: OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.23" >&2
  exit 1
fi

baseline_version="${baseline_package#openclaw@}"
baseline_dir="reports/container-baselines/$baseline_version"
baseline_report="$baseline_dir/report.json"

echo "[compare] Fixture: $fixture"
echo "[compare] Baseline package: $baseline_package"
echo "[compare] Target package: $target_package"

OPENCLAW_PACKAGE="$baseline_package" bash scripts/run-container-rehearsal.sh "$fixture"

mkdir -p "$baseline_dir"
cp reports/container-rehearsal/run/report.json "$baseline_report"
cp reports/container-rehearsal/run/report.html "$baseline_dir/report.html"
cp reports/container-rehearsal/run/summary.md "$baseline_dir/summary.md"
echo "[compare] Saved container baseline: $baseline_report"

OPENCLAW_BASELINE_FILE="$baseline_report" OPENCLAW_PACKAGE="$target_package" bash scripts/run-container-rehearsal.sh "$fixture"
