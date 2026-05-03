#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { redact } from "../lib/redact.js";

const source = process.argv[2] || path.join(process.env.HOME || "", ".openclaw");
const destination = process.argv[3] || path.join(process.cwd(), "fixtures", "openclaw-sanitized");
const includeWorkspaces = process.argv.includes("--include-workspaces");
const includePluginRuntimeDeps = process.argv.includes("--include-plugin-runtime-deps");

const includeFiles = [
  "openclaw.json",
  "jobs.json",
  "update-check.json",
  "openclaw.redacted.reference.json",
];

const includeDirs = [
  "agents",
  "cron",
  "plugins",
];

if (includeWorkspaces) includeDirs.push("workspace");
if (includePluginRuntimeDeps) includeDirs.push("plugin-runtime-deps");

if (!fs.existsSync(source)) {
  throw new Error(`OpenClaw state directory does not exist: ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

for (const file of includeFiles) copyJsonOrText(path.join(source, file), path.join(destination, file));
for (const dir of includeDirs) copyTree(path.join(source, dir), path.join(destination, dir));

console.log(`Sanitized fixture written to ${destination}`);
if (includeWorkspaces) console.log("Included workspace files for private rehearsal.");
if (includePluginRuntimeDeps) console.log("Included plugin runtime deps for private rehearsal.");
console.log("Review it before publishing or mounting it into a container.");

function copyTree(from, to) {
  if (!fs.existsSync(from)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (shouldSkip(name)) continue;
      copyTree(path.join(from, name), path.join(to, name));
    }
    return;
  }
  copyJsonOrText(from, to);
}

function copyJsonOrText(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (from.endsWith(".json")) {
    try {
      const data = JSON.parse(fs.readFileSync(from, "utf8"));
      fs.writeFileSync(to, `${JSON.stringify(redact(data), null, 2)}\n`);
      return;
    } catch {
      // Fall through to text redaction.
    }
  }
  const text = fs.readFileSync(from, "utf8");
  fs.writeFileSync(to, redact(text));
}

function shouldSkip(name) {
  return [
    "credentials",
    "media",
    "logs",
    "memory",
    "runs",
    "tasks",
    "subagents",
    "plugin-runtime-deps",
    "telegram",
    "qqbot",
    "devices",
    "locks",
    "node_modules",
    ".openclaw-npm-cache",
    ".git",
    "exec-approvals.json",
  ].includes(name) ||
    name.endsWith(".lock") ||
    name.endsWith(".jsonl") ||
    name.endsWith(".trajectory-path.json") ||
    name.endsWith(".trajectory.jsonl") ||
    name.includes(".deleted.");
}
