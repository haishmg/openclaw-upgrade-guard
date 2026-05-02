import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../lib/checks.js";
import { redact } from "../lib/redact.js";
import { parseArgs } from "../lib/cli.js";

test("redacts common secret and phone shapes", () => {
  const output = redact({
    token: "abc_123456789012345678901234",
    phone: "+971585720564",
    nested: { apiKey: "sk-123456789012345678901234" },
  });

  assert.equal(output.token, "[REDACTED]");
  assert.equal(output.phone, "[REDACTED_PHONE]");
  assert.equal(output.nested.apiKey, "[REDACTED]");
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

test("argument parser validates timeout", () => {
  assert.throws(() => parseArgs(["--timeout", "0"]), /positive/);
  assert.equal(parseArgs(["--mode", "baseline"]).mode, "baseline");
});

function ok(stdout) {
  return { ok: true, required: true, args: [], stdout, stderr: "", durationMs: 1 };
}

function okJson(json) {
  return { ok: true, required: true, args: [], json, stdout: JSON.stringify(json), stderr: "", durationMs: 1 };
}
