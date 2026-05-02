# Publishing Checklist

Use this checklist before making the repository public.

## Repository Hygiene

- Confirm no generated `reports/` directory is committed.
- Review `report.json` files before sharing them externally.
- Keep the license and README in the repository root.
- Confirm GitHub Actions workflows are enabled.
- Confirm branch protection requires the `CI` workflow before merge.
- Enable private vulnerability reporting if available.

## Release Readiness

- Run `npm test`.
- Run `npm run check`.
- Run `npm run regression:offline`.
- Run a real baseline against a working OpenClaw install.
- Run a post-upgrade comparison against that baseline.
- Confirm optional command failures are understandable warnings.
- Clearly label the current release as Linux/POSIX-first.

## Suggested GitHub Description

Clawback: container rehearsal, guarded update, and rollback safety for OpenClaw upgrades.

## Suggested Topics

- `openclaw`
- `clawback`
- `upgrade`
- `rollback`
- `healthcheck`
- `nodejs`
- `cli`
