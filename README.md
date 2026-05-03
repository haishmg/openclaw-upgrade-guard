# Clawback

Clawback is an upgrade safety tool for OpenClaw installs. It captures a local baseline, rehearses a target OpenClaw version in a sanitized container, writes redacted reports, and provides guarded update/rollback commands.

It is Linux/POSIX-first today. The CLI may work elsewhere, but the helper scripts assume `bash`, and container rehearsal expects Docker or Podman.

## Install

Use the latest release tag for a stable checkout:

```sh
git clone --depth 1 --branch v0.2.1 https://github.com/haishmg/Clawback.git clawback
cd clawback
npm install --ignore-scripts
node bin/clawback.js --help
```

To make `clawback` available globally from the checkout:

```sh
npm link
clawback --help
```

Replace `v0.2.1` with the newest tag from `https://github.com/haishmg/Clawback/releases/latest` when a newer release exists.

## Upgrade Workflow

Run the pre-upgrade suite before changing OpenClaw:

```sh
npm run suite:pre
```

This exports a sanitized fixture, starts the local baseline and container rehearsal in parallel, captures both outputs, and prints the results only after all pre-upgrade checks finish.

The two checks overlap on purpose. The baseline records what is already true on the live host before upgrading, while the container rehearsal tests whether the target OpenClaw package can install and run against sanitized state. The baseline gives context for deciding whether a warning is old known state or new upgrade risk; container-only checks are useful smoke tests, but they are not enough for a full upgrade decision.

The first container run can take several minutes because it builds a fresh image and installs OpenClaw inside it. On small hosts, expect the report to take around 10 minutes.

Review both summaries:

```sh
less reports/before-upgrade/summary.md
less reports/container-rehearsal/run/summary.md
```

To rehearse a specific OpenClaw target:

```sh
npm run suite:pre -- --target 2026.4.29
```

If the container rehearsal fails, do not upgrade. If it passes, start with the guarded update dry run printed by the rehearsal output.

Run the post-upgrade comparison after upgrading:

```sh
npm run suite:post
```

Post-upgrade mode waits up to 120 seconds for the gateway to settle, then compares live health, channels, agents, and baseline drift. If it reports errors, fix them before trusting the upgraded install or roll back with the recorded rollback plan.

## Guarded Update

Dry-run the host update first:

```sh
npm run upgrade:apply -- --target 2026.4.29 --report reports/container-rehearsal/run/report.json
```

Apply only after reviewing the dry run:

```sh
npm run upgrade:apply -- --target 2026.4.29 --report reports/container-rehearsal/run/report.json --accept-low-fidelity --yes
```

If post-upgrade validation fails, roll back:

```sh
npm run upgrade:rollback -- --plan reports/updates/<run>/rollback.json --yes
npm run suite:post
```

The updater refuses to change the host unless the report matches the requested target and has zero hard errors. Reports marked with `container.fidelity.host_replica` require `--accept-low-fidelity` because a sanitized container is not a full live-host replica.

## Direct Commands

Run only the local guard:

```sh
node bin/clawback.js --mode baseline
```

Run only a container rehearsal:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_PACKAGE=openclaw@latest npm run container:rehearse -- fixtures/openclaw-sanitized
```

For private high-fidelity rehearsals, opt into bulky local state explicitly:

```sh
npm run suite:pre -- --target 2026.4.29 --private-fixture
```

The target package installed in the container includes its own bundled plugins. `--private-fixture` is only for testing how the target behaves with this host's workspace files and existing generated `~/.openclaw/plugin-runtime-deps` cache.

The rehearsal container and built rehearsal image are removed after verification by default. Add `--keep-image` only when you need to inspect the image after a run.

Compare a target against a same-harness container baseline:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.23 OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:compare -- fixtures/openclaw-sanitized
```

See [docs/container-rehearsal.md](docs/container-rehearsal.md) for container details, limitations, and Docker/Podman disk usage notes.

## Reports

Each run writes:

- `report.json`: machine-readable command results and checks with common secrets redacted.
- `summary.md`: human-readable findings and next steps.
- `report.html`: interactive dashboard with severity filters, search, expandable details, timing bars, and resource cards.

By default, CLI progress shows only important checkpoints: phases plus failed, warning, or retried probes. Use `--debug` to print every validation probe and command result. Use `--quiet` to suppress progress output.

Exit codes:

- `0`: no hard errors.
- `1`: errors were found, or warnings were found with `--strict-warnings`.
- `2`: the guard itself failed, for example due to invalid arguments.

## What It Checks

Clawback checks OpenClaw CLI availability, runtime/update metadata, gateway reachability, service state, configured channels, agents, workspace/session paths, cron/task commands, config validation, baseline drift, and host resource pressure.

Immediate runtime failures are errors. Historical task failures, old lost tasks, bootstrap-pending agents, unavailable optional commands, and container-only host fidelity gaps are warnings unless they represent a new baseline regression.

## Limitations

- Container rehearsal is a compatibility smoke test, not a full live-host clone.
- It does not exercise live channel auth/device stores, external workspace directories, task history, locks, logs, media, memory, or runtime caches unless you deliberately mount/copy more state.
- It does not send live test messages to chat channels.
- Platform coverage outside Linux/POSIX is experimental.

## Development

Run tests and smoke checks:

```sh
npm test
npm run check
npm run regression:offline
npm run ci
```

Run against a non-default OpenClaw executable:

```sh
node bin/clawback.js --openclaw /path/to/openclaw --mode baseline
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/regression.md](docs/regression.md), [docs/releases.md](docs/releases.md), and [CHANGELOG.md](CHANGELOG.md).
