# Clawback 0.1.0

Initial public release.

## Highlights

- Container rehearsal and target-vs-baseline comparison for OpenClaw upgrades.
- Guarded host update with rollback plan generation.
- Post-upgrade validation with gateway settle wait.
- Interactive HTML, Markdown, and JSON reports.
- Offline regression suite and GitHub Actions CI.

## Important Caveat

Sanitized container rehearsal is a compatibility gate, not a full live-host replica. Use it before upgrading, then run live post-upgrade validation after the guarded update.
