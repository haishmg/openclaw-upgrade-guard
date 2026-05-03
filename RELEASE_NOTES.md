# Clawback 0.3.2

## Highlights

- Clarifies `npm run suite:pre` failures that happen before the target container runs.
- Labels local host baseline failures as environment blocks, not target OpenClaw version validation failures.
- Updates README install instructions to use the `v0.3.2` release tag.

## Validation

- `npm test`
- `npm run regression:offline`
- Live baseline smoke run confirmed the corrected environment wording.
