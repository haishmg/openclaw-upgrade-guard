# Regression Workflow

Clawback has two regression layers.

## Offline Regression

Offline regression is deterministic and safe for pull requests from forks:

```sh
npm run regression:offline
```

It uses synthetic reports and evaluator inputs. It does not require:

- OpenClaw installed
- Docker or Podman
- network access
- private fixtures
- live channel credentials

Use offline regression for:

- check/evaluator changes
- recommendation changes
- report rendering
- guarded update acceptance logic
- known false positives and false negatives that can be represented as report JSON

## Container Regression

Container regression is a higher-fidelity compatibility check. It installs OpenClaw packages in a container and runs the real guard against a fixture.

Run manually:

```sh
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.24 OPENCLAW_PACKAGE=openclaw@2026.4.25 npm run container:compare -- fixtures/openclaw-sanitized
```

GitHub Actions also includes a manual "Container Rehearsal" workflow. Maintainers should use it for targeted version checks once a safe public fixture is available or restored for the workflow.

Container regression is not run on every PR because it may:

- download OpenClaw packages
- take several minutes per version
- require Docker/Podman behavior that differs by host
- depend on fixture fidelity

## Adding a Regression Case

For every real upgrade failure, try to capture:

- working version
- target version
- mode that caught or missed the problem
- expected decision
- actual decision
- redacted command output or report JSON

Prefer adding an offline regression first. Add container regression coverage when the bug only appears in real OpenClaw package behavior.
