# Contributing to Clawback

Thanks for helping make OpenClaw upgrades safer.

## Development Setup

```sh
npm install
npm run ci
```

The default CI path is offline and does not require a live OpenClaw install, Docker, Podman, or private channel credentials.

## Pull Request Expectations

- Keep changes scoped to one behavior or workflow.
- Add tests for check/evaluator changes.
- Add offline regression coverage when fixing an upgrade bug or false positive.
- Update docs when user-facing commands, reports, recommendations, or safety semantics change.
- Do not commit `reports/`, private `fixtures/`, credentials, logs, or local OpenClaw state.

## Regression Cases

Clawback is most useful when it learns from real upgrade failures. Good regression reports include:

- working OpenClaw version
- target OpenClaw version
- what broke
- whether the failure happened in container rehearsal, guarded update, or post-upgrade validation
- redacted report snippets or sanitized fixtures when safe

Use the "Upgrade regression case" issue template for these.

## Container Rehearsal Changes

Container checks are intentionally low-fidelity by default. If a PR changes container behavior, be explicit about what the container can and cannot prove. Do not imply that sanitized container success proves the live host upgrade is safe.

## Running Live Checks

Only run live checks against a setup you control:

```sh
node bin/clawback.js --mode baseline --out reports/local-baseline
npm run container:compare -- fixtures/openclaw-sanitized
node bin/clawback.js --mode post-upgrade --baseline reports/local-baseline/report.json
```

Review generated reports before sharing them.
