# Clawback 0.2.1

## Highlights

- Adds `npm run suite:pre -- --target <version>` for selecting the OpenClaw target package without setting `OPENCLAW_PACKAGE`.
- Supports version, dist-tag, and full package specs, for example `2026.4.26`, `beta`, or `openclaw@2026.4.26`.
- Keeps `OPENCLAW_PACKAGE` support for automation and backward compatibility.

## Validation

- `npm run ci`
- `npm pack --dry-run`
