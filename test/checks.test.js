import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../lib/checks.js";
import { sanitizeFixtureJson } from "../lib/fixture.js";
import { redact } from "../lib/redact.js";
import { parseArgs } from "../lib/cli.js";
import { parseJsonOutput } from "../lib/runner.js";
import { buildRecommendation } from "../lib/recommendation.js";

test("redacts common secret and phone shapes", () => {
  const output = redact({
    token: "abc_123456789012345678901234",
    phone: "+971585720564",
    nested: { apiKey: "sk-123456789012345678901234" },
    compaction: { reserveTokens: 20000, keepRecentTokens: 10000 },
    heartbeat: { isolatedSession: false },
  });

  assert.equal(output.token, "[REDACTED]");
  assert.equal(output.phone, "[REDACTED_PHONE]");
  assert.equal(output.nested.apiKey, "[REDACTED]");
  assert.equal(output.compaction.reserveTokens, 20000);
  assert.equal(output.compaction.keepRecentTokens, 10000);
  assert.equal(output.heartbeat.isolatedSession, false);
});

test("fixture export strips path-installed plugins from OpenClaw config", () => {
  const sanitized = sanitizeFixtureJson("openclaw.json", {
    plugins: {
      entries: {
        clawback: { enabled: true },
        openai: { enabled: true },
      },
      allow: ["clawback", "openai"],
      load: {
        paths: ["/host/repo/packages/clawback-openclaw-plugin"],
      },
      installs: {
        clawback: {
          source: "path",
          sourcePath: "/host/repo/packages/clawback-openclaw-plugin",
          installPath: "/host/repo/packages/clawback-openclaw-plugin",
        },
      },
    },
  });

  assert.deepEqual(sanitized.plugins.entries, { openai: { enabled: true } });
  assert.deepEqual(sanitized.plugins.allow, ["openai"]);
  assert.equal(sanitized.plugins.load, undefined);
  assert.equal(sanitized.plugins.installs, undefined);
});

test("status evaluator fails unreachable gateway", () => {
  const checks = evaluate({
    mode: "preflight",
    commands: {
      version: ok("2026.4.23"),
      status: okJson({
        runtimeVersion: "2026.4.23",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: true, runtime: { status: "running" } },
        agents: { agents: [] },
      }),
      health: okJson({ ok: true, channels: {} }),
    },
  });

  assert(checks.some((check) => check.level === "error" && check.id === "gateway.reachable"));
  assert(checks.some((check) => check.level === "error" && check.id === "agents.present"));
});

test("baseline evaluator catches missing agents and channels", () => {
  const baseline = {
    commands: {
      status: { json: { agents: { agents: [{ id: "main" }, { id: "ops" }] } } },
      health: { json: { channels: { telegram: { configured: true } } } },
    },
  };

  const checks = evaluate({
    mode: "post-upgrade",
    baseline,
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: { reachable: true, misconfigured: false },
        gatewayService: { installed: true, runtime: { status: "running", state: "active", subState: "running" } },
        agents: { agents: [{ id: "main", workspaceDir: process.cwd(), sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: { telegram: { configured: false } } }),
    },
  });

  assert(checks.some((check) => check.level === "error" && check.id === "baseline.agent.ops"));
  assert(checks.some((check) => check.level === "error" && check.id === "baseline.channel.telegram"));
});

test("baseline evaluator catches gateway capability regression", () => {
  const baseline = {
    commands: {
      status: {
        ok: true,
        json: {
          gateway: {
            reachable: true,
            self: { version: "2026.4.23" },
            error: null,
          },
          agents: { agents: [{ id: "main" }] },
        },
      },
      health: { ok: true, json: { channels: {} } },
      gateway_probe: { ok: true, json: { ok: true } },
    },
  };

  const checks = evaluate({
    mode: "container-rehearsal",
    baseline,
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: {
          reachable: true,
          self: null,
          error: "missing scope: operator.read",
          misconfigured: false,
        },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: {} }),
      gateway_probe: okJson({ ok: true }),
    },
  });

  assert.equal(checks.find((check) => check.id === "baseline.gateway.self")?.level, "error");
  assert.equal(checks.find((check) => check.id === "baseline.gateway.error")?.level, "error");
});

test("container rehearsal downgrades host runtime expectations", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: {} }),
    },
  });

  assert.equal(checks.find((check) => check.id === "gateway.reachable")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "gateway.service")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "agent.main.workspace")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "container.fidelity.host_replica")?.level, "warning");
});

test("parses JSON wrapped in terminal control output", () => {
  const parsed = parseJsonOutput('\u001b[2K{\n  "valid": false,\n  "issues": [{"path": "agents.defaults.compaction.reserveTokens"}]\n}\n');

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.valid, false);
  assert.equal(parsed.value.issues[0].path, "agents.defaults.compaction.reserveTokens");
});

test("config validation valid=false is a hard failure", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: {} }),
      config_validate: okJson({ valid: false, issues: [{ path: "agents.defaults.compaction.reserveTokens" }] }),
    },
  });

  assert.equal(checks.find((check) => check.id === "config.validate")?.level, "error");
});

test("unparseable invalid config output is a hard failure", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: {} }),
      config_validate: {
        ok: true,
        required: false,
        args: ["config", "validate", "--json"],
        json: null,
        stdout: "Config invalid: {\"valid\": false",
        stderr: "",
        parseError: "Unexpected end of JSON input",
        durationMs: 1,
      },
    },
  });

  assert.equal(checks.find((check) => check.id === "config.validate")?.level, "error");
});

test("gateway transport output on JSON commands is a hard failure", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.29"),
      status: okJson({
        runtimeVersion: "2026.4.29",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: {
        id: "health",
        ok: true,
        required: false,
        args: ["health", "--json"],
        json: null,
        stdout: "[openclaw] Failed to start CLI: GatewayTransportError: gateway closed",
        stderr: "",
        parseError: "Unexpected token 'o'",
        durationMs: 1,
      },
    },
  });

  assert.equal(checks.find((check) => check.id === "command.health.json")?.level, "error");
});

test("container scope limitations are warnings when gateway probe succeeds", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.23"),
      status: okJson({
        runtimeVersion: "2026.4.23",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: {
        id: "health",
        ok: true,
        required: false,
        args: ["health", "--json"],
        json: null,
        stdout: "[openclaw] Failed to start CLI: Error: gateway timeout after 10000ms",
        stderr: "",
        parseError: "Unexpected token 'o'",
        durationMs: 1,
      },
      gateway_status: okJson({
        rpc: { ok: false, error: "timeout" },
        config: { cli: { valid: true }, daemon: { valid: true } },
      }),
      gateway_probe: okJson({ ok: true, capability: "read_only" }),
      cron_status: {
        id: "cron_status",
        ok: true,
        required: false,
        args: ["cron", "status", "--json"],
        json: null,
        stdout: "scope upgrade pending approval; pairing required: device is asking for more scopes than currently approved",
        stderr: "",
        parseError: "Unexpected token 's'",
        durationMs: 1,
      },
    },
  });

  assert.equal(checks.find((check) => check.id === "command.health.json")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "command.cron_status.json")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "gateway.status.rpc")?.level, "warning");
});

test("container channel probe failures are warnings", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    commands: {
      version: ok("2026.4.23"),
      status: okJson({
        runtimeVersion: "2026.4.23",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({
        ok: true,
        channels: {
          telegram: {
            configured: true,
            probe: { ok: false, error: "Not Found" },
            accounts: { default: { probe: { ok: false, error: "Not Found" } } },
          },
        },
      }),
    },
  });

  assert.equal(checks.find((check) => check.id === "channel.telegram.probe")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "channel.telegram.default.probe")?.level, "warning");
});

test("resource evaluator warns on pressure", () => {
  const checks = evaluate({
    mode: "container-rehearsal",
    resources: {
      sampleCount: 2,
      startedAt: "2026-05-02T00:00:00Z",
      finishedAt: "2026-05-02T00:00:02Z",
      peak: {
        load1: 20,
        load1PerCpu: 2.5,
        minMemoryAvailablePercent: 5,
        processRssBytes: 2 * 1024 * 1024 * 1024,
        process: { pid: 123, comm: "node" },
      },
    },
    commands: {
      version: ok("2026.4.23"),
      status: okJson({
        runtimeVersion: "2026.4.23",
        gateway: { reachable: false, misconfigured: false },
        gatewayService: { installed: false, runtime: { status: "unknown" } },
        agents: { agents: [{ id: "main", workspaceDir: "/missing", sessionsPath: process.argv[1] }] },
      }),
      health: okJson({ ok: true, channels: {} }),
    },
  });

  assert.equal(checks.find((check) => check.id === "resources.memory")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "resources.cpu")?.level, "warning");
  assert.equal(checks.find((check) => check.id === "resources.process_rss")?.level, "warning");
});

test("recommendation blocks target upgrades on hard errors", () => {
  const recommendation = buildRecommendation({
    mode: "container-rehearsal",
    summary: { errors: 1, warnings: 0 },
  });

  assert.equal(recommendation.decision, "do-not-upgrade");
});

test("recommendation separates local environment baseline failures from target failures", () => {
  const recommendation = buildRecommendation({
    mode: "baseline",
    summary: { errors: 1, warnings: 0 },
  });

  assert.equal(recommendation.decision, "environment-not-ready");
  assert.match(recommendation.message, /before any target OpenClaw version was tested/);
});

test("recommendation allows caution when only warnings remain", () => {
  const recommendation = buildRecommendation({
    mode: "preflight",
    summary: { errors: 0, warnings: 2 },
  });

  assert.equal(recommendation.decision, "upgrade-with-caution");
});

test("argument parser validates timeout", () => {
  assert.throws(() => parseArgs(["--timeout", "0"]), /positive/);
  assert.equal(parseArgs(["--mode", "baseline"]).mode, "baseline");
  assert.equal(parseArgs(["--mode", "container-rehearsal"]).mode, "container-rehearsal");
  assert.equal(parseArgs(["--mode", "post-upgrade", "--settle", "180"]).settleSeconds, 180);
  assert.equal(parseArgs(["--no-html"]).html, false);
  assert.equal(parseArgs(["--debug"]).debug, true);
  assert.equal(parseArgs(["--quiet"]).quiet, true);
});

function ok(stdout) {
  return { ok: true, required: true, args: [], stdout, stderr: "", durationMs: 1 };
}

function okJson(json) {
  return { ok: true, required: true, args: [], json, stdout: JSON.stringify(json), stderr: "", durationMs: 1 };
}
