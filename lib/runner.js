import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { evaluate } from "./checks.js";
import { redact } from "./redact.js";

const COMMANDS = [
  { id: "version", label: "Detect OpenClaw CLI version", args: ["--version"], json: false, required: true },
  { id: "status", label: "Collect runtime, gateway, agent, task, and update status", args: ["status", "--json"], json: true, required: true },
  { id: "health", label: "Probe live channel and heartbeat health", args: ["health", "--json"], json: true, required: false },
  { id: "gateway_status", label: "Inspect gateway service and RPC status", args: ["gateway", "status", "--json"], json: true, required: false },
  { id: "gateway_probe", label: "Probe gateway reachability and auth capability", args: ["gateway", "probe", "--json"], json: true, required: false },
  { id: "cron_status", label: "Inspect cron scheduler state", args: ["cron", "status", "--json"], json: true, required: false },
  { id: "cron_list", label: "List configured cron jobs", args: ["cron", "list", "--json"], json: true, required: false },
  { id: "tasks_audit", label: "Audit durable task state", args: ["tasks", "audit", "--json"], json: true, required: false },
  { id: "tasks_list", label: "List recent durable tasks", args: ["tasks", "list", "--json"], json: true, required: false },
  { id: "channels_status", label: "Probe configured channel accounts", args: ["channels", "status", "--probe", "--json"], json: true, required: false },
  { id: "update_status", label: "Check update channel and target version metadata", args: ["update", "status", "--json"], json: true, required: false },
  { id: "config_validate", label: "Validate OpenClaw config schema", args: ["config", "validate", "--json"], json: true, required: false },
  { id: "doctor", label: "Run non-interactive OpenClaw doctor diagnostics", args: ["doctor", "--non-interactive"], json: false, required: false },
];

export async function runGuard(options) {
  const startedAt = new Date().toISOString();
  const progress = options.onProgress || (() => {});
  const commands = {};
  progress({ type: "phase", message: `Starting ${options.mode} validation` });
  for (const command of COMMANDS) {
    commands[command.id] = await runCommand(options.openclaw, command, options.timeoutSeconds, progress);
  }

  if (options.baseline) progress({ type: "phase", message: `Loading baseline ${options.baseline}` });
  const baseline = options.baseline ? readBaseline(options.baseline) : null;
  progress({ type: "phase", message: "Evaluating command output and upgrade invariants" });
  const checks = evaluate({ commands, baseline, mode: options.mode });
  const summary = summarize(checks);
  const result = summary.errors > 0 ? "fail" : "pass";
  progress({ type: "phase", message: `Evaluation complete: ${result}` });

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

async function runCommand(bin, command, timeoutSeconds, progress) {
  const maxAttempts = command.json ? 3 : 1;
  let lastResult;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    progress({
      type: "command-start",
      command,
      attempt,
      maxAttempts,
      message: command.label,
    });
    lastResult = await runCommandOnce(bin, command, timeoutSeconds, attempt);
    if (isUsableResult(lastResult, command)) {
      progress({ type: "command-end", command, result: lastResult, retrying: false });
      return lastResult;
    }
    const retrying = attempt < maxAttempts;
    progress({ type: "command-end", command, result: lastResult, retrying });
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
    const parsed = parseJsonOutput(result.stdout);
    if (parsed.ok) {
      result.json = parsed.value;
    } else {
      result.parseError = parsed.error;
    }
  } else if (command.json && result.ok) {
    result.parseError = "Expected JSON on stdout but command returned no output";
  }
  return result;
}

export function parseJsonOutput(output) {
  const cleaned = stripTerminalNoise(output).trim();
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    const extracted = extractFirstJsonValue(cleaned);
    if (extracted) return extracted;
  }

  try {
    JSON.parse(cleaned);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Unknown JSON parse failure" };
}

function stripTerminalNoise(output) {
  return String(output)
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function extractFirstJsonValue(text) {
  for (let start = 0; start < text.length; start += 1) {
    const first = text[start];
    if (first !== "{" && first !== "[") continue;
    const candidate = balancedJsonCandidate(text, start);
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Keep scanning in case the first bracketed text is terminal framing.
    }
  }
  return null;
}

function balancedJsonCandidate(text, start) {
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const open = stack.pop();
      if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) return null;
      if (stack.length === 0) return text.slice(start, index + 1);
    }
  }
  return null;
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
