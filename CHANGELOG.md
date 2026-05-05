# Changelog

All notable Clawback changes are tracked here.

Clawback uses semantic versioning:

- `MAJOR`: breaking CLI/report/workflow changes.
- `MINOR`: new checks, workflows, or report features.
- `PATCH`: bug fixes, docs, and regression coverage.

## Unreleased

## [0.3.5] - 2026-05-05

### Fixed

- Strip path-installed host plugins from exported sanitized fixtures so current-version container baselines do not fail config validation on absolute host paths.

## [0.3.4] - 2026-05-05

### Fixed

- Treat empty or dead-PID pre-upgrade suite and container rehearsal locks as stale, while still blocking when the owning process is alive.

## [0.3.3] - 2026-05-03

### Added

- Add a safe OpenClaw/Clawhub helper plugin that exposes `openclaw clawback` command guidance without running shell commands inside the plugin host.

## [0.3.2] - 2026-05-03

### Fixed

- Clarify pre-upgrade suite failures that happen before the target container runs as environment blocks, not target OpenClaw version validation failures.

## [0.3.1] - 2026-05-03

### Fixed

- Make `suite:pre` compare the target container against a same-harness current-version container baseline, so target regressions such as lost gateway identity or missing scopes become hard failures instead of standalone container warnings.

## [0.3.0] - 2026-05-03

### Added

- `--private-fixture` for pre-upgrade suites to include workspace files and plugin runtime deps in private container rehearsals.
- `--include-plugin-runtime-deps` for direct fixture exports.
- `--keep-image` for preserving a rehearsal image when debugging.

### Changed

- Container rehearsals remove the built rehearsal image after verification by default.
- `npm test` now targets project tests only, so generated private fixture files are not discovered as tests.

### Fixed

- Prevent overlapping pre-upgrade suite or container rehearsal runs from corrupting shared logs, reports, and container images.

## [0.2.1] - 2026-05-02

### Added

- `npm run suite:pre -- --target <version>` shortcut for selecting the OpenClaw target package without setting `OPENCLAW_PACKAGE`.

## [0.2.0] - 2026-05-02

### Added

- `--debug` flag for exhaustive validation probe output.
- README guidance explaining why local baseline and container rehearsal checks intentionally overlap.

### Changed

- Default CLI progress now shows important checkpoints only: phases, failed probes, warning probes, and retries.
- Pre-upgrade suite runs the local baseline and container rehearsal in parallel, captures both logs, and prints results only after both checks finish.
- README is shorter and focused on the main upgrade workflow.
- Container build output no longer shows a misleading `openclaw@latest` default when a specific target package is passed.

## [0.1.0] - 2026-05-02

Initial public release.

### Added

- `clawback` CLI for baseline, container rehearsal, and post-upgrade validation.
- Container comparison workflow for testing target OpenClaw packages against a known-good package in the same harness.
- Guarded update and rollback commands.
- Interactive HTML, Markdown, and JSON reports.
- Gateway readiness, identity, RPC, scope, service, channel, agent, cron, task, config, update metadata, and resource pressure checks.
- Low-fidelity warning for sanitized container reports.
- CI, offline regression workflow, manual container rehearsal workflow, release workflow, Dependabot, and contributor templates.

### Known Limitations

- Linux/POSIX-first.
- Sanitized container rehearsal is not a full live-host replica.
- Live channel message sending is not performed by default.
