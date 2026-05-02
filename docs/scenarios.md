# Validation Scenarios

This document describes the scenarios Clawback is meant to cover before the project is opened up for wider use.

## Platform Scope

These scenarios are currently validated on Linux only. The local gateway and service checks assume Linux-style process/network behavior and are most complete when OpenClaw is managed by user-level `systemd`.

The container rehearsal also uses a Linux container image. macOS, Windows, WSL, and non-systemd Linux should be treated as experimental until the project has explicit compatibility checks for those environments.

## Baseline Before Upgrade

Goal: prove the existing install is healthy enough to compare against.

Command:

```sh
clawback --mode baseline --out reports/before-upgrade
```

Expected outcome:

- OpenClaw CLI responds.
- Gateway is reachable.
- Managed gateway service is running.
- Configured channels still have valid auth/probe state.
- Agents and workspaces are still present.
- No queued or running task backlog is silently ignored.
- Known historical task failures are visible as warnings.

## Post-Upgrade Comparison

Goal: detect regressions introduced by the newly installed OpenClaw version.

Command:

```sh
clawback --mode post-upgrade --baseline reports/before-upgrade/report.json
```

Expected outcome:

- Agents present before the upgrade are still present.
- Channels configured before the upgrade are still configured.
- Gateway remains reachable after the service restart.
- Runtime version changed when an actual upgrade was expected.

Post-upgrade validation includes a default 120 second gateway settle window before the command matrix starts. This avoids treating normal service restart time as channel or gateway breakage. If the gateway still cannot answer after the settle window, gateway and channel regressions remain hard failures.

## Container Rehearsal

Goal: test a sanitized copy of the setup against a fresh OpenClaw package without mutating the host.

Command:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_PACKAGE=openclaw@latest npm run container:rehearse -- fixtures/openclaw-sanitized
```

Expected outcome:

- The container image builds.
- The target OpenClaw package installs.
- The sanitized fixture can be loaded.
- A foreground gateway starts inside the container.
- Gateway RPC/probe checks succeed against the target package.
- Static config and agent checks pass or produce actionable warnings.
- The report warns that the container is not a full host replica.

This scenario is the first upgrade gate because it is cheap, repeatable, and non-mutating. It should catch target package install failures, sanitized config/schema incompatibility, gateway startup/readiness/RPC regressions, lost gateway identity, scope regressions, command JSON regressions, and resource pressure.

This scenario complements local checks. It does not replace local post-upgrade validation because live channel credentials, host system services, external workspaces, task history, locks, logs, and runtime caches are intentionally not copied into the default fixture.

## Container Baseline Comparison

Goal: prove a target package preserves behavior that the current package already has in the same sanitized fixture and container harness.

Command:

```sh
npm run container:export -- ~/.openclaw fixtures/openclaw-sanitized
OPENCLAW_BASELINE_PACKAGE=openclaw@2026.4.23 OPENCLAW_PACKAGE=openclaw@2026.4.29 npm run container:compare -- fixtures/openclaw-sanitized
```

Expected outcome:

- The current/baseline package passes against the sanitized fixture.
- The target package is compared against the saved baseline report.
- New gateway capability loss is an error.
- New command failures or newly unparseable command output are errors.
- Channel accounts that were configured, linked, or probeable in the baseline keep that state.
- Resource regressions are reported against the baseline, not only against fixed thresholds.
- The low-fidelity container warning remains visible so the user does not mistake the result for a full host replica.

This is the preferred pre-upgrade container decision when investigating a specific version jump. A failing target comparison should block upgrade. A passing target comparison means the target cleared the container compatibility gate, not that the live host upgrade is proven.

## Pre-Upgrade Suite

Goal: make the normal pre-upgrade process faster by running the independent checks in parallel while showing results only after both finish.

Command:

```sh
npm run suite:pre
```

To target a specific OpenClaw version:

```sh
npm run suite:pre -- --target 2026.4.26
```

Expected outcome:

- A sanitized fixture is exported.
- Local baseline starts into `reports/before-upgrade`.
- Container rehearsal starts into `reports/container-rehearsal/run`.
- The command exits nonzero if either check fails.

The post-upgrade comparison depends on the baseline and on the real upgrade being complete, so it runs separately:

```sh
npm run suite:post
```

## Gateway Service Breakage

The guard should fail when:

- The service is not installed where the setup expects it.
- The service is stopped or failed.
- The RPC probe is unreachable.
- OpenClaw status marks the gateway as misconfigured.

## Channel Auth Breakage

The guard should fail when a configured channel probe reports a hard failure.
It should warn, not fail, when a channel is simply not configured on a machine that never used it.

## Agent Workspace Drift

The guard should fail when an agent workspace path no longer exists.
It should warn when a sessions file is missing, because fresh agents and migrated installs may have no historical session file yet.

## Task Store State

Queued or running tasks during an upgrade are risky because an upgrade may restart services underneath active work. The guard warns on active tasks and historical task audit issues.

Future versions may add age-based hard failures for stale queued/running tasks once OpenClaw exposes enough structured detail across versions.

## Resource Pressure

The guard samples resource usage during each run and warns when:

- Available memory drops below 10%.
- 1-minute load average per CPU rises above 2.
- The largest OpenClaw/Node process RSS exceeds 1.5 GiB.

This is especially important for container rehearsal because a target version can pass functional probes while still using materially more CPU or memory than the current install. Treat these warnings as upgrade risk and compare them with the local baseline and post-upgrade reports.

## Safe Open Source Defaults

The guard must:

- Avoid mutation by default.
- Avoid sending messages or running agent turns by default.
- Redact common token, key, password, session, and phone-number shapes.
- Treat optional command differences across OpenClaw versions as warnings.
- Keep reports useful without embedding raw local secrets.
