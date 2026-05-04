# Clawback

Clawback is an upgrade safety tool for OpenClaw installs. It captures a local baseline, rehearses a target OpenClaw version in a sanitized container, writes redacted reports, and provides guarded update/rollback commands.

It is Linux/POSIX-first today. The CLI may work elsewhere, but the helper scripts assume `bash`, and container rehearsal expects Docker or Podman.

## Quick Look

These short playable demos show the command flow, terminal result, and generated HTML report.

**Passing rehearsal: OpenClaw `2026.4.23`**

<video src="docs/media/clawback-2026.4.23-pass-demo.mp4" controls preload="metadata" width="520"></video>

[Open the passing rehearsal video](docs/media/clawback-2026.4.23-pass-demo.mp4). This shows a target image passing the container gate with warnings to review.

**Blocked rehearsal: OpenClaw `2026.4.29`**

<video src="docs/media/clawback-2026.4.29-failure-demo.mp4" controls preload="metadata" width="520"></video>

[Open the blocked rehearsal video](docs/media/clawback-2026.4.29-failure-demo.mp4). This shows Clawback refusing to proceed after gateway/config validation errors.

Both demos use sanitized container reports. A container pass is still only the pre-upgrade gate; run the post-upgrade host validation before trusting a changed live install.

## Why This Exists

Clawback started after a real OpenClaw upgrade path hurt more than it should have. A working install moved from `2026.4.26` toward `2026.4.29`, hit upgrade issues, then even `2026.4.26` stopped being a good recovery point. The setup eventually had to be manually rolled back to `2026.4.23`, where OpenClaw was performant and stable again.

That experience exposed the core problem this project tries to solve: every OpenClaw install can be different. Agents, channels, gateway auth, task history, workspace paths, systemd state, device links, and host resources all matter. A version that looks fine in a generic smoke test can still break a specific personal setup. Clawback gives users a repeatable way to capture their own baseline, rehearse a target version in a container, compare behavior, and keep a rollback path ready before touching the live install.

## Install

Use the latest release tag for a stable checkout:

```sh
git clone --depth 1 --branch v0.3.3 https://github.com/haishmg/Clawback.git clawback
cd clawback
npm install --ignore-scripts
node bin/clawback.js --help
```

To make `clawback` available globally from the checkout:

```sh
npm link
clawback --help
```

Replace `v0.3.3` with the newest tag from `https://github.com/haishmg/Clawback/releases/latest` when a newer release exists.

## Upgrade Workflow

Run the pre-upgrade suite before changing OpenClaw:

```sh
npm run suite:pre
```

This exports a sanitized fixture, captures a local baseline, runs a same-harness container baseline for the currently installed OpenClaw version, then runs the target container rehearsal against that container baseline.

The checks overlap on purpose. The local baseline records what is already true on the live host before upgrading. The container baseline records what the current OpenClaw package can do in the same isolated harness. The target container is then compared against that same-harness baseline, so a target that loses gateway identity, scopes, command JSON behavior, configured channels, or other baseline behavior becomes a hard failure instead of a generic container warning.

The first container runs can take several minutes because the suite builds images and installs OpenClaw inside them. On small hosts, expect the report to take around 10 minutes or more.

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

## Clawhub Helper

The repo includes a small Clawhub helper plugin in `packages/clawback-openclaw-plugin`. It only prints setup/rehearsal commands; the real Clawback CLI remains the useful path because upgrade rehearsals need shell and container access.

From a checkout:

```sh
openclaw plugins install packages/clawback-openclaw-plugin --link
openclaw plugins enable clawback
openclaw clawback commands --target 2026.4.29 --private-fixture
```

Once published through Clawhub, the install path should be:

```sh
openclaw plugins install clawhub:clawback
openclaw plugins enable clawback
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/regression.md](docs/regression.md), [docs/releases.md](docs/releases.md), and [CHANGELOG.md](CHANGELOG.md).
