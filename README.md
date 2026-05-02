# OpenClaw Upgrade Guard

OpenClaw Upgrade Guard is a small preflight and post-upgrade validation tool for OpenClaw installs.
It captures the current setup, checks the parts most likely to break during an upgrade, redacts sensitive values, and writes a report that can be compared after installing a newer OpenClaw version.

The project is designed for personal setups first, but the checks are generic enough to share with other OpenClaw users.

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
npm install
npm link
```

Or run directly:

```sh
node bin/openclaw-upgrade-guard.js --help
```

## Recommended Upgrade Workflow

Create a baseline before changing OpenClaw:

```sh
openclaw-upgrade-guard --mode baseline --out reports/before-upgrade
```

Review the generated files:

```sh
less reports/before-upgrade/summary.md
```

Upgrade OpenClaw using your normal process.

Run the post-upgrade comparison:

```sh
openclaw-upgrade-guard \
  --mode post-upgrade \
  --baseline reports/before-upgrade/report.json \
  --out reports/after-upgrade
```

If the post-upgrade run reports errors, fix those before trusting the upgraded install. If it reports warnings, decide whether they match known historical state or represent new risk.

## Container Rehearsal

For a safer dry run, export a sanitized copy of your OpenClaw state and test it in Docker or Podman before touching the real host:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_PACKAGE=openclaw@latest npm run container:rehearse -- fixtures/openclaw-sanitized
```

See [docs/container-rehearsal.md](docs/container-rehearsal.md) for details and limitations.

## Exit Codes

- `0`: no hard errors.
- `1`: errors were found, or warnings were found with `--strict-warnings`.
- `2`: the guard itself failed, for example due to invalid arguments.

## Reports

Each run writes:

- `report.json`: machine-readable command results and checks with common secrets redacted.
- `summary.md`: human-readable findings and next steps.

The JSON report intentionally includes command output summaries. Do not publish reports without reviewing them, especially if your local OpenClaw install uses custom channels, private workspaces, or unusual plugin configuration.

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
