# Publishing Checklist

Use this checklist before making the repository public.

## Repository Hygiene

- Confirm no generated `reports/` directory is committed.
- Review `report.json` files before sharing them externally.
- Keep the license and README in the repository root.
- Add a GitHub Actions workflow once the repo is public and CI permissions are available.

## Release Readiness

- Run `npm test`.
- Run `npm run check`.
- Run a real baseline against a working OpenClaw install.
- Run a post-upgrade comparison against that baseline.
- Confirm optional command failures are understandable warnings.

## Suggested GitHub Description

Preflight and post-upgrade validation for OpenClaw installations.

## Suggested Topics

- `openclaw`
- `upgrade`
- `healthcheck`
- `nodejs`
- `cli`
