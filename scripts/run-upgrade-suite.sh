#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi
fixture="${OPENCLAW_FIXTURE_DIR:-fixtures/openclaw-sanitized}"
before_dir="${OPENCLAW_BEFORE_DIR:-reports/before-upgrade}"
after_dir="${OPENCLAW_AFTER_DIR:-reports/after-upgrade}"
baseline_file="${OPENCLAW_BASELINE_FILE:-$before_dir/report.json}"
target_package="${OPENCLAW_PACKAGE:-openclaw@latest}"
lock_dir="${OPENCLAW_SUITE_LOCK_DIR:-reports/.suite-pre.lock}"
include_workspaces="${OPENCLAW_INCLUDE_WORKSPACES:-0}"
include_plugin_runtime_deps="${OPENCLAW_INCLUDE_PLUGIN_RUNTIME_DEPS:-0}"
keep_container_image="${OPENCLAW_KEEP_CONTAINER_IMAGE:-0}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/run-upgrade-suite.sh pre [--target <version|tag|package>] [options]
  scripts/run-upgrade-suite.sh post

Modes:
  pre   Export a sanitized fixture, then run local baseline and container rehearsal in parallel.
  post  Run local post-upgrade comparison using reports/before-upgrade/report.json.

Options:
  --target <value>       OpenClaw version, dist-tag, or package for pre mode.
                         Examples: 2026.4.26, beta, openclaw@2026.4.26.
  --package <value>      Exact npm package spec for pre mode.
  --private-fixture      Include workspace files and plugin runtime deps in the fixture.
  --include-workspaces   Include ~/.openclaw/workspace in the fixture.
  --include-plugin-runtime-deps
                         Include ~/.openclaw/plugin-runtime-deps in the fixture.
  --keep-image           Keep the built rehearsal image instead of deleting it after verification.

Environment:
  OPENCLAW_PACKAGE       Package/version for container rehearsal (default: openclaw@latest).
  OPENCLAW_FIXTURE_DIR   Sanitized fixture directory (default: fixtures/openclaw-sanitized).
  OPENCLAW_BEFORE_DIR    Local baseline output directory (default: reports/before-upgrade).
  OPENCLAW_AFTER_DIR     Post-upgrade output directory (default: reports/after-upgrade).
  OPENCLAW_BASELINE_FILE Baseline JSON for post mode (default: reports/before-upgrade/report.json).
USAGE
}

normalize_target_package() {
  case "$1" in
    *@*) printf '%s\n' "$1" ;;
    *) printf 'openclaw@%s\n' "$1" ;;
  esac
}

safe_name() {
  printf '%s' "$1" | tr -c '[:alnum:]._.-' '-'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --target" >&2
        exit 2
      fi
      target_package="$(normalize_target_package "$2")"
      shift 2
      ;;
    --package)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --package" >&2
        exit 2
      fi
      target_package="$2"
      shift 2
      ;;
    --private-fixture)
      include_workspaces=1
      include_plugin_runtime_deps=1
      shift
      ;;
    --include-workspaces)
      include_workspaces=1
      shift
      ;;
    --include-plugin-runtime-deps)
      include_plugin_runtime_deps=1
      shift
      ;;
    --keep-image)
      keep_container_image=1
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      target_package="$(normalize_target_package "$1")"
      shift
      ;;
  esac
done

case "$mode" in
  pre)
    mkdir -p reports
    if ! mkdir "$lock_dir" 2>/dev/null; then
      echo "[suite] Another pre-upgrade suite appears to be running: $lock_dir" >&2
      echo "[suite] Wait for it to finish before starting another target rehearsal." >&2
      exit 1
    fi
    trap 'rm -rf "$lock_dir"' EXIT INT TERM

    export_args=("$HOME/.openclaw" "$fixture")
    if [ "$include_workspaces" = "1" ]; then
      export_args+=(--include-workspaces)
    fi
    if [ "$include_plugin_runtime_deps" = "1" ]; then
      export_args+=(--include-plugin-runtime-deps)
    fi

    echo "[suite] Exporting sanitized OpenClaw fixture from ~/.openclaw to $fixture"
    npm run container:export -- "${export_args[@]}"

    mkdir -p "$before_dir" reports/container-rehearsal
    target_name="$(safe_name "$target_package")"
    baseline_log="$before_dir/run.log"
    container_log="reports/container-rehearsal/run.log"
    container_image="clawback:${target_name}"

    echo "[suite] Starting local baseline"
    echo "[suite] Local baseline reports: $before_dir"
    node bin/clawback.js \
      --mode baseline \
      --out "$before_dir" \
      > "$baseline_log" 2>&1 &
    baseline_pid="$!"

    echo "[suite] Starting container rehearsal"
    echo "[suite] Container target: $target_package"
    echo "[suite] Container image: $container_image"
    echo "[suite] Container output: $container_log"
    OPENCLAW_PACKAGE="$target_package" \
    OPENCLAW_GUARD_IMAGE="$container_image" \
    OPENCLAW_KEEP_CONTAINER_IMAGE="$keep_container_image" \
      npm run container:rehearse -- "$fixture" \
      > "$container_log" 2>&1 &
    container_pid="$!"

    baseline_status=0
    container_status=0
    wait "$baseline_pid" || baseline_status="$?"
    wait "$container_pid" || container_status="$?"

    if [ "$baseline_status" -ne 0 ] || [ "$container_status" -ne 0 ]; then
      echo "pre suite failed: baseline=$baseline_status container=$container_status" >&2
      echo "[suite] Local baseline output:" >&2
      cat "$baseline_log" >&2
      echo "[suite] Container output:" >&2
      cat "$container_log" >&2
      exit 1
    fi
    echo "[suite] Pre-upgrade suite complete"
    echo "[suite] Local HTML: $before_dir/report.html"
    echo "[suite] Container HTML: reports/container-rehearsal/run/report.html"
    echo ""
    echo "[suite] Local baseline output:"
    cat "$baseline_log"
    echo ""
    echo "[suite] Container output:"
    cat "$container_log"
    ;;
  post)
    if [ ! -f "$baseline_file" ]; then
      echo "Baseline not found: $baseline_file" >&2
      echo "Run scripts/run-upgrade-suite.sh pre before upgrading, or set OPENCLAW_BASELINE_FILE." >&2
      exit 1
    fi

    echo "[suite] Running post-upgrade comparison"
    echo "[suite] Baseline: $baseline_file"
    echo "[suite] Output: $after_dir"
    node bin/clawback.js \
      --mode post-upgrade \
      --baseline "$baseline_file" \
      --out "$after_dir"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown mode: $mode" >&2
    usage >&2
    exit 2
    ;;
esac
