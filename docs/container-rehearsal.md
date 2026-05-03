# Container-Level Upgrade Checks

Container rehearsal is the first upgrade gate. It checks a target OpenClaw package in an isolated Linux filesystem before the real host is changed.

It is intentionally non-mutating: the helper builds a container image, installs the target package, copies in a sanitized fixture, starts `openclaw gateway run`, waits for gateway readiness, then runs the guard inside the container.

This is a compatibility smoke test, not a full clone of the live host. A passing container result means the target can load the redacted fixture and pass container probes. It does not prove that the live host package replacement, user systemd service, private channel/device state, or external workspaces will survive the upgrade.

## Recommended Container Gate

For upgrade decisions, prefer a control-vs-target comparison instead of a one-off latest-version rehearsal:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.24 OPENCLAW_PACKAGE=openclaw@2026.4.25 npm run container:compare -- fixtures/openclaw-sanitized
```

This runs the current/baseline package in the same container harness, saves that report, then runs the target package against it. That makes the result much more useful because container noise already present in the current version is not treated as a target regression.

Use the result this way:

- `FAIL`: do not upgrade. Review the hard errors first.
- `PASS` with `container.fidelity.host_replica`: the target passed the sanitized compatibility gate, but the report is still low-fidelity versus the live host.
- `PASS` without hard errors: proceed only through the guarded updater and live post-upgrade validation.

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

By default, generated plugin runtime deps under `~/.openclaw/plugin-runtime-deps` are also not copied. The target OpenClaw package installed in the image brings its own bundled plugins, so the default smoke test checks whether the target can start cleanly with your redacted plugin registry metadata. To rehearse against the host's existing generated plugin runtime cache, add `--include-plugin-runtime-deps`:

```sh
node scripts/export-fixture.js ~/.openclaw fixtures/openclaw-private --include-plugin-runtime-deps
```

For the full pre-upgrade suite, use the consolidated private fixture option:

```sh
npm run suite:pre -- --target 2026.4.29 --private-fixture
```

The default fixture deliberately skips sensitive or bulky runtime state. That is good for open-source sharing, but it also means the default container is low-fidelity. For private troubleshooting, you can improve fidelity by deliberately mounting or copying more state, but review secrets before sharing any resulting fixture or report.

## Plain Rehearsal

```sh
npm run container:rehearse -- fixtures/openclaw-sanitized
```

Reports are written to:

```text
reports/container-rehearsal/run/
```

The rehearsal starts `openclaw gateway run` in the container before running checks. It waits for the gateway startup log to report ready, then keeps waiting until `openclaw gateway probe --json` reports `ok: true`. This avoids racing OpenClaw's local device pairing/auth setup, which may complete after the HTTP server starts.

Gateway RPC, identity, readiness, and scope regressions are the most important container-level signals. For example, a target that starts but loses `operator.read` scope should fail the container gate. Host service installation checks still warn instead of failing because the container does not run your user-level `systemd`.

The gateway startup log is written to:

```text
reports/container-rehearsal/gateway.log
```

The last readiness probe output is also saved for troubleshooting:

```text
reports/container-rehearsal/gateway-probe-last.json
reports/container-rehearsal/gateway-probe-last.err
```

The default readiness timeout is 300 seconds. For slower hosts, increase it:

```sh
GUARD_GATEWAY_READY_TIMEOUT_SECONDS=420 npm run container:rehearse -- fixtures/openclaw-sanitized
```

## Rehearse Against a Specific Version or Tag

For the full pre-upgrade suite:

```sh
npm run suite:pre -- --target 2026.4.29
```

For a container-only rehearsal:

```sh
OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:rehearse -- fixtures/openclaw-sanitized
```

You can also use a dist-tag or package spec:

```sh
OPENCLAW_PACKAGE=openclaw@beta npm run container:rehearse -- fixtures/openclaw-sanitized
```

## Podman and Docker Disk Usage

Container rehearsal builds a Node-based image and installs OpenClaw plus its dependencies. The rehearsal container is run with `--rm`, and the built rehearsal image is removed after verification by default. Add `--keep-image` only when you need to inspect or reuse the image for debugging.

Even with automatic cleanup, Podman/Docker may retain shared base layers or build cache. On small Linux hosts, check storage periodically when testing several OpenClaw versions.

Check host disk space:

```sh
df -h /
```

Check Podman storage:

```sh
podman system df
```

Remove unused Podman images after a rehearsal:

```sh
podman image prune -a -f
```

For Docker, use:

```sh
docker system df
docker image prune -a -f
```

Only prune images you are comfortable rebuilding. The guard reports are written under `reports/` and are not removed by image pruning.

## What This Can and Cannot Prove

Can prove:

- The target OpenClaw package installs in a clean Node image.
- Your sanitized config shape still parses.
- The target gateway can start in the isolated fixture and answer local RPC/probe checks.
- Gateway identity, reachability, readiness, and auth/scope behavior did not regress within the container harness.
- Version-to-version command output remains parseable where the current version was parseable.
- CPU, memory, and process RSS remain inside configured thresholds during the rehearsal.
- Static agent/workspace/session metadata survives the new version.
- The guard itself works in a clean Linux environment.

Cannot fully prove:

- The live host upgrade path, including package replacement, service file changes, and restart behavior.
- Real Telegram/WhatsApp auth still works, because auth stores are intentionally not copied by default.
- Host systemd service installation behavior, because the container does not run your user systemd.
- External workspace directories, unless you mount or copy them deliberately.
- Durable task history, locks, logs, media, memory, and runtime caches, because the default fixture omits them. Plugin runtime deps are included only when you explicitly export them for private rehearsal.
- Hardware, Tailscale, DNS, or local network behavior.

The report includes `container.fidelity.host_replica` as a warning to make this explicit. A passing sanitized container rehearsal means "the target can load this redacted fixture and pass compatibility probes." It does not mean "the target is proven safe on the live host."

For real confidence, use both workflows:

1. Container rehearsal with a sanitized fixture.
2. Local baseline before upgrade.
3. Local post-upgrade comparison after upgrade.

## Compare a Target Against the Current Version

A plain container rehearsal proves that the target version can start with the fixture. The stronger check is a control-vs-target comparison:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.23 OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:compare -- fixtures/openclaw-sanitized
```

This runs the baseline package first, saves `reports/container-baselines/2026.4.23/report.json`, then runs the target package with that report mounted as `--baseline`.

Use this when you need to answer: "does the target version preserve the behavior my current setup already has?" It avoids failing the target for container noise that also exists in the current version, while still failing new regressions such as lost gateway identity, new gateway errors, newly broken channel account state, or materially higher resource usage.

When the target report passes, the rehearsal prints the guarded host update commands:

```sh
npm run upgrade:apply -- --target <version> --report <report.json>
npm run upgrade:apply -- --target <version> --report <report.json> --accept-low-fidelity --yes
```

The first command is a host update dry-run. The second command applies the update and writes a rollback plan under `reports/updates/`. The `--accept-low-fidelity` flag is deliberately explicit because the report did not replicate live service restart behavior or private channel/device state.

Do not skip the post-upgrade host validation after applying. Container pass plus guarded update is only the pre-upgrade half of the workflow.

You can also run the two steps manually:

```sh
OPENCLAW_PACKAGE=openclaw@2026.4.23 npm run container:rehearse -- fixtures/openclaw-sanitized
mkdir -p reports/container-baselines/2026.4.23
cp reports/container-rehearsal/run/report.json reports/container-baselines/2026.4.23/report.json
OPENCLAW_BASELINE_FILE=reports/container-baselines/2026.4.23/report.json OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:rehearse -- fixtures/openclaw-sanitized
```

## Run With the Local Baseline

The project includes a convenience suite that runs the local baseline and container rehearsal in parallel, while delaying result output until both checks finish:

```sh
npm run suite:pre
```

This command:

- exports `fixtures/openclaw-sanitized`
- starts the local baseline into `reports/before-upgrade`
- starts the container rehearsal into `reports/container-rehearsal/run`
- prints both outputs after all pre-upgrade checks finish

After upgrading OpenClaw, run:

```sh
npm run suite:post
```

The post-upgrade comparison uses `reports/before-upgrade/report.json` by default.

## Guarded Host Update

The container rehearsal is non-mutating. To let the guard moderate a real host update, pass the passing report to the guarded updater:

```sh
npm run upgrade:apply -- --target 2026.4.24 --report reports/container-rehearsal/run/report.json
```

Without `--yes`, this validates the report and runs `openclaw update --tag <target> --dry-run --json` only. If the report is a sanitized low-fidelity container rehearsal, applying the update also requires `--accept-low-fidelity`:

```sh
npm run upgrade:apply -- --target 2026.4.24 --report reports/container-rehearsal/run/report.json --accept-low-fidelity --yes
```

The updater records the currently installed version and writes a rollback plan under `reports/updates/`. If post-upgrade validation fails:

```sh
npm run upgrade:rollback -- --plan reports/updates/<run>/rollback.json --yes
```
