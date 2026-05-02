# Container Upgrade Rehearsal

The local guard checks your real OpenClaw install in place. The container rehearsal checks a sanitized copy of your OpenClaw state against a fresh OpenClaw package in an isolated filesystem.

This is useful before installing a new OpenClaw version on your actual host.

## Requirements

- Docker or Podman.
- Node.js on the host to export the sanitized fixture.
- A local OpenClaw state directory, usually `~/.openclaw`.
- A Linux-compatible shell environment. The provided helper scripts use `bash`.

The container image itself runs Linux. Running it from macOS, Windows, or WSL may work if Docker/Podman path mounts behave normally, but the workflow is currently validated only from Linux.

## Export a Sanitized Fixture

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
```

The exporter copies selected config, agent, cron, plugin, and workspace metadata while skipping obvious secret/session/runtime directories such as:

- `credentials`
- `media`
- `logs`
- `telegram`
- `devices`
- `locks`
- `memory`
- `runs`
- `tasks`
- `subagents`
- `plugin-runtime-deps`
- `node_modules`
- `.git`
- transcript files such as `*.jsonl` and trajectory files

It also redacts common token, password, API key, session, credential, and phone-number shapes.

Review `fixtures/openclaw-sanitized` before publishing or sharing it.

By default, workspace files under `~/.openclaw/workspace` are not copied. To include them for a private rehearsal, add `--include-workspaces`:

```sh
node scripts/export-fixture.js ~/.openclaw fixtures/openclaw-sanitized --include-workspaces
```

## Rehearse Against Latest OpenClaw

```sh
npm run container:rehearse -- fixtures/openclaw-sanitized
```

Reports are written to:

```text
reports/container-rehearsal/run/
```

The rehearsal starts `openclaw gateway run` in the container before running checks. Gateway RPC and probe failures are hard errors because they indicate the target OpenClaw package cannot run the replicated setup well enough to answer local health checks. Host service installation checks still warn instead of failing because the container does not run your user-level `systemd`.

The gateway startup log is written to:

```text
reports/container-rehearsal/gateway.log
```

## Rehearse Against a Specific Version or Tag

```sh
OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:rehearse -- fixtures/openclaw-sanitized
```

You can also use a dist-tag or package spec:

```sh
OPENCLAW_PACKAGE=openclaw@beta npm run container:rehearse -- fixtures/openclaw-sanitized
```

## What This Can and Cannot Prove

Can prove:

- The target OpenClaw package installs in a clean Node image.
- Your sanitized config shape still parses.
- The target gateway can start in the isolated fixture and answer local RPC/probe checks.
- Static agent/workspace/session metadata survives the new version.
- The guard itself works in a clean Linux environment.

Cannot fully prove:

- Real Telegram/WhatsApp auth still works, because auth stores are intentionally not copied by default.
- Host systemd service installation behavior, because the container does not run your user systemd.
- Hardware, Tailscale, DNS, or local network behavior.

For real confidence, use both workflows:

1. Container rehearsal with a sanitized fixture.
2. Local baseline before upgrade.
3. Local post-upgrade comparison after upgrade.

## Run With the Local Baseline in Parallel

The container rehearsal and local baseline do not depend on each other, so the project includes a convenience suite:

```sh
npm run suite:pre
```

This command:

- exports `fixtures/openclaw-sanitized`
- starts the local baseline into `reports/before-upgrade`
- starts the container rehearsal into `reports/container-rehearsal/run`
- waits for both checks to finish

After upgrading OpenClaw, run:

```sh
npm run suite:post
```

The post-upgrade comparison uses `reports/before-upgrade/report.json` by default.
