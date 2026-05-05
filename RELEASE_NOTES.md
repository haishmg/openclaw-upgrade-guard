# Clawback 0.3.4

## Highlights

- Fixes stale lock recovery for pre-upgrade suites and container rehearsals.
- Records lock owner metadata (`pid`, `started_at`, and command) when a suite or rehearsal starts.
- Keeps active-run protection intact by blocking when the recorded process is still alive.
- Updates README install instructions to use the `v0.3.4` release tag.

## Validation

- `npm test`
- `npm run regression:offline`
- stale-lock smoke test for `scripts/run-upgrade-suite.sh`
- `npm pack --dry-run`
