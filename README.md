# Clawback

Clawback is a preflight, container rehearsal, guarded update, and rollback safety tool for OpenClaw installs.
It captures the current setup, checks the parts most likely to bite during an upgrade, redacts sensitive values, and writes a report that can be compared after installing a newer OpenClaw version.

The project is designed for personal setups first, but the checks are generic enough to share with other OpenClaw users.

## Why This Exists

Clawback started after a real OpenClaw upgrade path hurt more than it should have. A working install moved from `2026.4.26` toward `2026.4.29`, hit upgrade issues, then even `2026.4.26` stopped being a good recovery point. The setup eventually had to be manually rolled back to `2026.4.23`, where OpenClaw was performant and stable again.

That experience exposed the core problem this project tries to solve: every OpenClaw install can be different. Agents, channels, gateway auth, task history, workspace paths, systemd state, device links, and host resources all matter. A version that looks fine in a generic smoke test can still break a specific personal setup. Clawback gives users a repeatable way to capture their own baseline, rehearse a target version in a container, compare behavior, and keep a rollback path ready before touching the live install.

## Platform Support

Clawback is currently Linux/POSIX-first.

- The Node.js CLI is intended to be portable, but it has only been validated on Linux.
- The helper scripts use `bash` and POSIX shell behavior.
- The container rehearsal expects Docker or Podman on a Linux-compatible host.
- The local baseline checks are most complete for Linux installs that use user-level `systemd` for the OpenClaw gateway.

macOS, Windows, WSL, and non-systemd Linux may work for parts of the CLI, but they are not validated yet. Treat results on those platforms as experimental until platform-specific checks are added.

## What It Checks

- OpenClaw CLI availability and runtime version.
- Gateway reachability and system service state.
- Gateway misconfiguration signals.
- Channel health for configured Telegram, WhatsApp, and other supported channels.
- Agent definitions, workspace paths, and sessions files.
- Cron scheduler/list commands when available.
- Durable task audit/list commands when available.
- Config validation when available.
- Update metadata, including installed version versus registry latest.
- Baseline drift after upgrade, such as missing agents or channels that were configured before.
- Resource pressure during validation, including load average, available memory, and OpenClaw/Node process RSS.

The tool treats immediate runtime failures as errors. Historical task failures, old lost tasks, bootstrap-pending agents, and dependency marker oddities are warnings because those can exist before an upgrade and should not automatically block every user.

## Install

### Use The Latest Released Tag

For a stable checkout, install from the latest GitHub release tag instead of cloning whatever is on `main`.

Current release tag:

```sh
git clone --depth 1 --branch v0.1.0 https://github.com/haishmg/Clawback.git clawback
cd clawback
npm install --ignore-scripts
node bin/clawback.js --help
```

When a newer release exists, replace `v0.1.0` with the newest tag from:

```text
https://github.com/haishmg/Clawback/releases/latest
```

If you want the command available globally from that tagged checkout:

```sh
npm link
clawback --help
```

From a checkout:

```sh
cd /path/to/clawback
npm install
npm link
```

After `npm link`, run it from anywhere:

```sh
clawback --help
```

Or run directly from inside the checkout:

```sh
cd /path/to/clawback
node bin/clawback.js --help
```

If you are outside the checkout, use the full path:

```sh
node /path/to/clawback/bin/clawback.js --help
```

For example, on this host:

```sh
node /home/pii/Clawback/bin/clawback.js --help
```

## Recommended Upgrade Workflow

Use the guard as a staged upgrade gate:

1. Run a local baseline on the current working install.
2. Run a container-level target check against a sanitized fixture.
3. If the container check passes, use the guarded updater.
4. Run post-upgrade validation on the live host after the gateway settles.

The container check is intentionally first because it is non-mutating and catches package/config/gateway compatibility problems before the host is touched. It is not a complete host replica, so it cannot be the only gate.

Run the pre-upgrade suite before changing OpenClaw:

```sh
npm run suite:pre
```

This exports a sanitized fixture, then runs the local baseline and container rehearsal in parallel. Review both generated files:

```sh
less reports/before-upgrade/summary.md
less reports/container-rehearsal/run/summary.md
```

If the container rehearsal fails, do not upgrade. If it passes, use the guarded update command printed by the rehearsal output.

Run the post-upgrade comparison:

```sh
npm run suite:post
```

Post-upgrade mode waits up to 120 seconds for the gateway to settle before it starts judging health, channels, and baseline drift. Use `--settle <seconds>` when running the CLI directly if a host needs a longer or shorter restart window.

If the post-upgrade run reports errors, fix those before trusting the upgraded install or roll back with the recorded rollback plan. If it reports warnings, decide whether they match known historical state or represent new risk.

Running `node bin/clawback.js` directly only runs the local guard. It does not start Docker or Podman. Use `npm run suite:pre` when you want the local baseline and latest-version container rehearsal together. Container rehearsal uses `container-rehearsal` mode, which checks the sanitized config/state with latest OpenClaw, starts a foreground gateway inside the container, and treats failed gateway RPC/probe results as hard errors. Host-only features such as systemd service installation and absolute host workspace paths remain warnings.

## Container-Level Checks

Container rehearsal is the project’s main non-mutating upgrade check. It builds a clean Linux image, installs the requested OpenClaw package, loads a sanitized copy of your OpenClaw state, starts a foreground gateway, waits for readiness, and then runs the same validation probes used by the local guard.

Run a plain container rehearsal:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_PACKAGE=openclaw@latest npm run container:rehearse -- fixtures/openclaw-sanitized
```

For the most useful version decision, compare the target against a same-harness container baseline from your currently working version:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.23 OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:compare -- fixtures/openclaw-sanitized
```

This first runs the baseline package against the exported fixture and saves it under `reports/container-baselines/`. It then runs the target package with `--baseline` against that control report, so warnings already present in the current version do not become false blockers, but new capability regressions do.

Container-level checks can catch:

- Target package install failures.
- Config/schema incompatibility with the sanitized state.
- Gateway startup, readiness, RPC, identity, and scope regressions.
- Command output changes, including commands that stop returning parseable JSON.
- Agent/channel metadata drift that is visible in the fixture.
- CPU, memory, and process RSS pressure during the rehearsal.

Important: the sanitized container is not a full clone of the live host. It does not exercise the user systemd service, live channel auth/device stores, external workspace directories, task history, locks, logs, media, memory, or runtime caches. Treat it as a compatibility smoke test. A real upgrade decision still needs the local baseline and post-upgrade validation.

When a container rehearsal passes, the tool prints the guarded update commands to run next. Start with the dry-run command. If the report is low-fidelity, the guarded updater requires `--accept-low-fidelity` before it will apply the host update.

See [docs/container-rehearsal.md](docs/container-rehearsal.md) for details and limitations.

Container images can consume multiple GB on small hosts after repeated rebuilds. See the Podman/Docker disk usage notes in [docs/container-rehearsal.md](docs/container-rehearsal.md#podman-and-docker-disk-usage).

## Parallel Suite

The pre-upgrade baseline and container rehearsal are independent, so the suite runs them at the same time:

```sh
npm run suite:pre
```

The suite prints `[suite]` and `[container]` progress lines when it exports the fixture, starts the local baseline, builds the Docker/Podman image, and runs the isolated latest-version rehearsal.

The post-upgrade comparison intentionally runs later, after you have upgraded OpenClaw:

```sh
npm run suite:post
```

Use `OPENCLAW_PACKAGE` to rehearse a specific OpenClaw target:

```sh
OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run suite:pre
```

## Guarded Update And Rollback

After a target version has a passing container rehearsal, the guard can moderate the host update. It refuses to update unless the report is for the same target version and has zero hard errors. Reports marked with the `container.fidelity.host_replica` warning also require explicit `--accept-low-fidelity` acknowledgement before the host is changed.

Dry-run the host update first:

```sh
npm run upgrade:apply -- --target 2026.4.24 --report reports/container-rehearsal/run/report.json
```

Apply the update only after reviewing the dry-run:

```sh
npm run upgrade:apply -- --target 2026.4.24 --report reports/container-rehearsal/run/report.json --accept-low-fidelity --yes
```

The command writes a rollback plan under `reports/updates/`. If post-upgrade validation fails, roll back to the previously installed version:

```sh
npm run upgrade:rollback -- --plan reports/updates/<run>/rollback.json --yes
```

Then run:

```sh
npm run suite:post
```

## Exit Codes

- `0`: no hard errors.
- `1`: errors were found, or warnings were found with `--strict-warnings`.
- `2`: the guard itself failed, for example due to invalid arguments.

## Reports

During a run, the CLI prints progress for each validation probe to stderr. You can see what is being checked, whether a probe is required or optional, retry attempts for JSON probes, and how long each command took. Use `--quiet` to suppress progress output.

After a run, the CLI prints the most important results first: overall pass/fail, check counts, OpenClaw version, gateway/service state, configured agents/channels, top errors or warnings, and a `file://` link to the generated HTML dashboard.
It also prints an upgrade recommendation: upgrade looks safe, upgrade with caution, do not upgrade yet, or do not trust the upgraded install yet.

Each run writes:

- `report.json`: machine-readable command results and checks with common secrets redacted.
- `summary.md`: human-readable findings and next steps.
- `report.html`: interactive visual dashboard with severity filters, search, expandable details, and command timing bars.

The JSON report intentionally includes command output summaries. Do not publish reports without reviewing them, especially if your local OpenClaw install uses custom channels, private workspaces, or unusual plugin configuration.

Render an HTML dashboard for an existing JSON report:

```sh
npm run report:html -- reports/before-upgrade/report.json
```

Then open the generated `report.html` in a browser.

### Sample Run Output

A local baseline run prints the validation phases, command probes, and the most important result immediately:

```text
[phase] Starting preflight validation
[run] Detect OpenClaw CLI version (required)
      openclaw --version
[ok] version: exit 0, 149ms
[run] Collect runtime, gateway, agent, task, and update status (required attempt 1/3)
      openclaw status --json
[ok] status: exit 0, 5317ms
[run] Probe live channel and heartbeat health (optional attempt 1/3)
      openclaw health --json
[ok] health: exit 0, 3233ms
[phase] Evaluating command output and upgrade invariants
[phase] Evaluation complete: pass

Clawback: PASS
Checks: 50 total, 44 passed, 6 warnings, 0 errors
Mode: baseline
OpenClaw: 2026.4.24 (latest: 2026.4.29)
Gateway: reachable at ws://127.0.0.1:18789
Gateway service: running
Agents: 6
Configured channels: telegram, whatsapp
Recommendation: Upgrade only with caution

Most important warnings:
- status.update_available: Registry latest is 2026.4.29; installed runtime is 2026.4.24
- tasks.history: Historical failed/lost tasks are present; review before blaming an upgrade

HTML report: file:///home/pii/clawback/reports/before-upgrade/report.html
Markdown summary: /home/pii/clawback/reports/before-upgrade/summary.md
JSON report: /home/pii/clawback/reports/before-upgrade/report.json
```

The matching `summary.md` starts with the same decision data in a shareable format:

```text
# Clawback Report

- Result: PASS
- Mode: baseline
- Checks: 50
- Errors: 0
- Warnings: 6
- Recommendation: Upgrade only with caution
- Resources: peak load/CPU 0.88, min memory available 68.1%, peak process RSS 262 MiB

## Upgrade Guidance

No hard blockers were found, but warnings remain. Review them before upgrading.
```

The HTML dashboard shows the same result visually, with severity filters, search, expandable command details, timing bars, resource cards, and direct links back to the generated JSON and Markdown files.

## Current Limitations

- Container rehearsal is not a full live-host replica unless you deliberately mount/copy additional state.
- It does not send live test messages to chat channels.
- It does not run arbitrary repair commands.
- Optional OpenClaw commands vary by version, so unavailable optional commands become warnings rather than hard failures.

## Development

Run tests and a CLI smoke check:

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request expectations and [docs/regression.md](docs/regression.md) for the regression strategy.

## Releases

Releases are created from annotated `v*` tags. The release workflow runs CI, packs the npm tarball, creates a GitHub Release, and attaches the package artifact.

See [CHANGELOG.md](CHANGELOG.md) and [docs/releases.md](docs/releases.md).
