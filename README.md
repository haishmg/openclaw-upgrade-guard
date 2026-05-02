# OpenClaw Upgrade Guard

OpenClaw Upgrade Guard is a small preflight and post-upgrade validation tool for OpenClaw installs.
It captures the current setup, checks the parts most likely to break during an upgrade, redacts sensitive values, and writes a report that can be compared after installing a newer OpenClaw version.

The project is designed for personal setups first, but the checks are generic enough to share with other OpenClaw users.

## Platform Support

OpenClaw Upgrade Guard is currently Linux/POSIX-first.

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

The tool treats immediate runtime failures as errors. Historical task failures, old lost tasks, bootstrap-pending agents, and dependency marker oddities are warnings because those can exist before an upgrade and should not automatically block every user.

## Install

From a checkout:

```sh
cd /path/to/openclaw-upgrade-guard
npm install
npm link
```

After `npm link`, run it from anywhere:

```sh
openclaw-upgrade-guard --help
```

Or run directly from inside the checkout:

```sh
cd /path/to/openclaw-upgrade-guard
node bin/openclaw-upgrade-guard.js --help
```

If you are outside the checkout, use the full path:

```sh
node /path/to/openclaw-upgrade-guard/bin/openclaw-upgrade-guard.js --help
```

For example, on this host:

```sh
node /home/pii/openclaw-upgrade-guard/bin/openclaw-upgrade-guard.js --help
```

## Recommended Upgrade Workflow

Run the pre-upgrade suite before changing OpenClaw:

```sh
npm run suite:pre
```

This exports a sanitized fixture, then runs the local baseline and container rehearsal in parallel. Review the generated files:

```sh
less reports/before-upgrade/summary.md
less reports/container-rehearsal/run/summary.md
```

Upgrade OpenClaw using your normal process.

Run the post-upgrade comparison:

```sh
npm run suite:post
```

If the post-upgrade run reports errors, fix those before trusting the upgraded install. If it reports warnings, decide whether they match known historical state or represent new risk.

Running `node bin/openclaw-upgrade-guard.js` directly only runs the local guard. It does not start Docker or Podman. Use `npm run suite:pre` when you want the local baseline and latest-version container rehearsal together. Container rehearsal uses `container-rehearsal` mode, which checks the sanitized config/state with latest OpenClaw, starts a foreground gateway inside the container, and treats failed gateway RPC/probe results as hard errors. Host-only features such as systemd service installation and absolute host workspace paths remain warnings.

## Container Rehearsal

For a safer dry run, export a sanitized copy of your OpenClaw state and test it in Docker or Podman before touching the real host:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_PACKAGE=openclaw@latest npm run container:rehearse -- fixtures/openclaw-sanitized
```

See [docs/container-rehearsal.md](docs/container-rehearsal.md) for details and limitations.

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

## Exit Codes

- `0`: no hard errors.
- `1`: errors were found, or warnings were found with `--strict-warnings`.
- `2`: the guard itself failed, for example due to invalid arguments.

## Reports

During a run, the CLI prints progress for each validation probe to stderr. You can see what is being checked, whether a probe is required or optional, retry attempts for JSON probes, and how long each command took. Use `--quiet` to suppress progress output.

After a run, the CLI prints the most important results first: overall pass/fail, check counts, OpenClaw version, gateway/service state, configured agents/channels, top errors or warnings, and a `file://` link to the generated HTML dashboard.

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

## Current Limitations

- It does not perform the upgrade for you.
- It does not send live test messages to chat channels.
- It does not mutate OpenClaw state or run repair commands.
- Optional OpenClaw commands vary by version, so unavailable optional commands become warnings rather than hard failures.

## Development

Run tests and a CLI smoke check:

```sh
npm test
npm run check
```

Run against a non-default OpenClaw executable:

```sh
node bin/openclaw-upgrade-guard.js --openclaw /path/to/openclaw --mode baseline
```
