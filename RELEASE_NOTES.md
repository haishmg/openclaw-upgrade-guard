# Clawback 0.3.5

## Highlights

- Fixes sanitized fixture exports when the live OpenClaw config includes path-installed plugins.
- Removes host-only plugin load paths and install records from the exported `openclaw.json`.
- Allows same-harness current-version container baselines to pass when the host has local development plugins installed.
- Updates README install instructions to use the `v0.3.5` release tag.

## Validation

- `npm run check`
- `node scripts/regression-offline.js`
- `npm run suite:pre -- --target 2026.5.4`
- `npm pack --dry-run`
