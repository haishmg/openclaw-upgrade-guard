import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../lib/checks.js";
import { redact } from "../lib/redact.js";
import { parseArgs } from "../lib/cli.js";
import { parseJsonOutput } from "../lib/runner.js";

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

test("argument parser validates timeout", () => {
  assert.throws(() => parseArgs(["--timeout", "0"]), /positive/);
  assert.equal(parseArgs(["--mode", "baseline"]).mode, "baseline");
  assert.equal(parseArgs(["--mode", "container-rehearsal"]).mode, "container-rehearsal");
  assert.equal(parseArgs(["--no-html"]).html, false);
  assert.equal(parseArgs(["--quiet"]).quiet, true);
});

function ok(stdout) {
  return { ok: true, required: true, args: [], stdout, stderr: "", durationMs: 1 };
}

function okJson(json) {
  return { ok: true, required: true, args: [], json, stdout: JSON.stringify(json), stderr: "", durationMs: 1 };
}
