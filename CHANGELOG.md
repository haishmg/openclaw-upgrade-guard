# Changelog

All notable Clawback changes are tracked here.

Clawback uses semantic versioning:

- `MAJOR`: breaking CLI/report/workflow changes.
- `MINOR`: new checks, workflows, or report features.
- `PATCH`: bug fixes, docs, and regression coverage.

## Unreleased

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
