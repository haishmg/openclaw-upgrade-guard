# Clawback 0.3.3

## Highlights

- Adds a safe OpenClaw/Clawhub helper plugin under `packages/clawback-openclaw-plugin`.
- Exposes `openclaw clawback setup`, `openclaw clawback commands`, and `openclaw clawback links`.
- Keeps the plugin safe by printing exact Clawback commands instead of running shell/container jobs inside OpenClaw's plugin host.
- Updates README install instructions to use the `v0.3.3` release tag.

## Validation

- `npm test`
- `npm run regression:offline`
- `openclaw plugins install packages/clawback-openclaw-plugin --link`
- `openclaw clawback commands --target 2026.4.29 --private-fixture`
