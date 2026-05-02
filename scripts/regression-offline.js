#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluate } from "../lib/checks.js";
import { buildRecommendation } from "../lib/recommendation.js";
import { renderHtml } from "../lib/html.js";
import { renderMarkdown } from "../lib/markdown.js";

try {
  regression("baseline gateway capability regression is a hard failure", () => {
    const baseline = report({
      version: "2026.4.24",
      gateway: {
        reachable: true,
        self: { host: "baseline", version: "2026.4.24" },
        error: null,
      },
      health: { channels: { telegram: { configured: true, accounts: { default: { configured: true, probe: { ok: true } } } } } },
    });
    const commands = {
      version: ok("OpenClaw 2026.4.25"),
      status: okJson({
        runtimeVersion: "2026.4.25",
        gateway: { reachable: false, self: null, error: "missing scope: operator.read", misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: "/missing/sessions.json" }] },
      }),
      health: okJson({ ok: true, channels: { telegram: { configured: true, accounts: { default: { configured: true, probe: { ok: false } } } } } }),
      gateway_probe: okJson({ ok: true, targets: [{ connect: { scopeLimited: true, error: "missing scope: operator.read" } }] }),
    };
    const checks = evaluate({ mode: "container-rehearsal", commands, baseline, resources: resources() });

    assert.equal(checks.find((check) => check.id === "baseline.gateway.self")?.level, "error");
    assert.equal(checks.find((check) => check.id === "baseline.gateway.error")?.level, "error");
    assert.equal(buildRecommendation({ mode: "container-rehearsal", summary: summarize(checks) }).decision, "do-not-upgrade");
  });

  regression("container reports carry low fidelity warning", () => {
    const checks = evaluate({
      mode: "container-rehearsal",
      resources: resources(),
      commands: {
        version: ok("OpenClaw 2026.4.24"),
        status: okJson({
          runtimeVersion: "2026.4.24",
          gateway: { reachable: true, self: { version: "2026.4.24" }, misconfigured: false },
          gatewayService: { installed: false, runtime: { status: "unknown" } },
          agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: "/missing/sessions.json" }] },
        }),
        health: okJson({ ok: true, channels: {} }),
      },
    });

    assert.equal(checks.find((check) => check.id === "container.fidelity.host_replica")?.level, "warning");
  });

  regression("reports render in markdown and html", () => {
    const sample = report({
      version: "2026.4.24",
      gateway: { reachable: true, self: { version: "2026.4.24" }, error: null },
      health: { channels: {} },
      checks: [{ level: "ok", id: "sample", message: "sample passed" }],
    });
    const html = renderHtml(sample);
    const markdown = renderMarkdown(sample);
    assert.match(html, /Clawback Report/);
    assert.match(markdown, /Clawback Report/);
  });

  console.log("offline regressions passed");
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}

function regression(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function report(overrides = {}) {
  const commands = {
    version: ok(`OpenClaw ${overrides.version || "2026.4.24"}`),
    status: okJson({
      runtimeVersion: overrides.version || "2026.4.24",
      gateway: overrides.gateway || { reachable: true, self: { version: overrides.version || "2026.4.24" }, error: null, misconfigured: false },
      gatewayService: { installed: true, runtime: { status: "running", state: "active", subState: "running" } },
      agents: { agents: [{ id: "main", workspaceDir: process.cwd(), sessionsPath: process.argv[1] }] },
    }),
    health: okJson({ ok: true, ...(overrides.health || { channels: {} }) }),
    gateway_probe: okJson({ ok: true }),
  };
  const checks = overrides.checks || [{ level: "ok", id: "sample", message: "sample passed" }];
  const summary = overrides.summary || summarize(checks);
  return {
    schemaVersion: 1,
    tool: "clawback",
    mode: "container-rehearsal",
    result: overrides.result || (summary.errors > 0 ? "fail" : "pass"),
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:00:01.000Z",
    host: { hostname: "ci", platform: "linux", arch: "x64", release: "test" },
    summary,
    checks,
    commands,
    resources: resources(),
    recommendation: buildRecommendation({ mode: "container-rehearsal", summary }),
  };
}

function resources() {
  return {
    sampleCount: 1,
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:00:01.000Z",
    peak: {
      load1: 0.1,
      load1PerCpu: 0.1,
      memoryUsedPercent: 10,
      minMemoryAvailablePercent: 90,
      processRssBytes: 128 * 1024 * 1024,
      process: { pid: 123, comm: "node", cmdline: "node" },
    },
  };
}

function summarize(checks) {
  return checks.reduce(
    (summary, check) => {
      summary.checks += 1;
      if (check.level === "ok") summary.ok += 1;
      if (check.level === "warning") summary.warnings += 1;
      if (check.level === "error") summary.errors += 1;
      return summary;
    },
    { checks: 0, ok: 0, warnings: 0, errors: 0 },
  );
}

function ok(stdout) {
  return { ok: true, required: true, args: [], stdout, stderr: "", durationMs: 1 };
}

function okJson(json) {
  return { ok: true, required: false, args: [], json, stdout: JSON.stringify(json), stderr: "", durationMs: 1 };
}
