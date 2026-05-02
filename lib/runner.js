import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { evaluate } from "./checks.js";
import { redact } from "./redact.js";

const COMMANDS = [
  { id: "version", args: ["--version"], json: false, required: true },
  { id: "status", args: ["status", "--json"], json: true, required: true },
  { id: "health", args: ["health", "--json"], json: true, required: false },
  { id: "gateway_status", args: ["gateway", "status", "--json"], json: true, required: false },
  { id: "gateway_probe", args: ["gateway", "probe", "--json"], json: true, required: false },
  { id: "cron_status", args: ["cron", "status", "--json"], json: true, required: false },
  { id: "cron_list", args: ["cron", "list", "--json"], json: true, required: false },
  { id: "tasks_audit", args: ["tasks", "audit", "--json"], json: true, required: false },
  { id: "tasks_list", args: ["tasks", "list", "--json"], json: true, required: false },
  { id: "channels_status", args: ["channels", "status", "--probe", "--json"], json: true, required: false },
  { id: "update_status", args: ["update", "status", "--json"], json: true, required: false },
  { id: "config_validate", args: ["config", "validate", "--json"], json: true, required: false },
  { id: "doctor", args: ["doctor", "--non-interactive"], json: false, required: false },
];

export async function runGuard(options) {
  const startedAt = new Date().toISOString();
  const commands = {};
  for (const command of COMMANDS) {
    commands[command.id] = await runCommand(options.openclaw, command, options.timeoutSeconds);
  }

  const baseline = options.baseline ? readBaseline(options.baseline) : null;
  const checks = evaluate({ commands, baseline, mode: options.mode });
  const summary = summarize(checks);
  const result = summary.errors > 0 ? "fail" : "pass";

  return redact({
    schemaVersion: 1,
    tool: "openclaw-upgrade-guard",
    mode: options.mode,
    result,
    startedAt,
    finishedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
    },
    summary,
    checks,
    commands,
  });
}

function readBaseline(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function summarize(checks) {
  return checks.reduce(
    (summary, check) => {
      summary.checks += 1;
      if (check.level === "error") summary.errors += 1;
      if (check.level === "warning") summary.warnings += 1;
      if (check.level === "ok") summary.ok += 1;
      return summary;
    },
    { checks: 0, ok: 0, warnings: 0, errors: 0 },
  );
}

async function runCommand(bin, command, timeoutSeconds) {
  const maxAttempts = command.json ? 3 : 1;
  let lastResult;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await runCommandOnce(bin, command, timeoutSeconds, attempt);
    if (isUsableResult(lastResult, command)) return lastResult;
    if (attempt < maxAttempts) await delay(1000 * attempt);
  }
  return lastResult;
}

function isUsableResult(result, command) {
  if (!result.ok) return false;
  if (command.json && result.parseError) return false;
  return true;
}

async function runCommandOnce(bin, command, timeoutSeconds, attempt) {
  const startedAt = Date.now();
  const result = {
    id: command.id,
    args: command.args,
    required: command.required,
    attempt,
    ok: false,
    exitCode: null,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: "",
    json: null,
    parseError: null,
  };

  await new Promise((resolve) => {
    const child = spawnCommand(bin, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      result.stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      result.stderr += chunk.toString();
    });
    child.on("error", (error) => {
      result.stderr += `${error.message}\n`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      result.exitCode = code;
      resolve();
    });
  });

  result.durationMs = Date.now() - startedAt;
  result.ok = result.exitCode === 0 && !result.timedOut;
  result.stdout = result.stdout.trim();
  result.stderr = result.stderr.trim();

  if (command.json && result.stdout) {
    try {
      result.json = JSON.parse(result.stdout);
    } catch (error) {
      result.parseError = error.message;
    }
  } else if (command.json && result.ok) {
    result.parseError = "Expected JSON on stdout but command returned no output";
  }
  return result;
}

function spawnCommand(bin, args, options) {
  if (hasScriptCommand()) {
    const quoted = [bin, ...args].map(shellQuote).join(" ");
    return spawn("script", ["-q", "-c", quoted, "/dev/null"], options);
  }
  return spawn(bin, args, options);
}

function hasScriptCommand() {
  if (hasScriptCommand.cached == null) {
    hasScriptCommand.cached = spawnSync("script", ["--version"], { stdio: "ignore" }).status === 0;
  }
  return hasScriptCommand.cached;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
