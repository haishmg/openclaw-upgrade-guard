import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runGuard } from "./runner.js";
import { renderMarkdown } from "./markdown.js";
import { renderHtml } from "./html.js";

const HELP = `Usage: clawback [options]

Checks whether an OpenClaw upgrade is likely to bite, and helps claw back if it does.

Options:
  --mode <name>          preflight|post-upgrade|baseline|container-rehearsal (default: preflight)
  --openclaw <path>      OpenClaw executable to run (default: openclaw)
  --timeout <seconds>    Per-command timeout (default: 30)
  --settle <seconds>     Gateway settle wait before post-upgrade checks (default: 120 for post-upgrade, otherwise 0)
  --out <dir>            Report directory (default: ./reports/<timestamp>)
  --baseline <file>      Previous JSON report to compare against
  --json                 Print JSON report to stdout
  --debug                Print every validation probe and command result
  --no-markdown          Do not write summary.md
  --no-html              Do not write report.html
  --quiet                Suppress progress output
  --strict-warnings      Exit 1 when warnings are present
  -h, --help             Show this help
`;

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }

  const report = await runGuard({
    ...options,
    onProgress: options.quiet ? undefined : (event) => printProgress(event, { debug: options.debug }),
  });
  const outDir = options.out || defaultReportDir();
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.resolve(outDir, "report.json");
  const markdownPath = path.resolve(outDir, "summary.md");
  const htmlPath = path.resolve(outDir, "report.html");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  if (options.markdown !== false) {
    fs.writeFileSync(markdownPath, renderMarkdown(report));
  }
  if (options.html !== false) {
    fs.writeFileSync(htmlPath, renderHtml(report));
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printRunSummary(report, { jsonPath, markdownPath, htmlPath, options });
  }

  if (report.result === "fail" || (options.strictWarnings && report.summary.warnings > 0)) {
    process.exitCode = 1;
  }
}

export function parseArgs(argv) {
  const options = {
    mode: "preflight",
    openclaw: "openclaw",
    timeoutSeconds: 30,
    settleSeconds: null,
    markdown: true,
    html: true,
    debug: false,
    quiet: false,
    strictWarnings: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--debug") options.debug = true;
    else if (arg === "--no-markdown") options.markdown = false;
    else if (arg === "--no-html") options.html = false;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--strict-warnings") options.strictWarnings = true;
    else if (arg === "--mode") options.mode = readValue();
    else if (arg === "--openclaw") options.openclaw = readValue();
    else if (arg === "--timeout") options.timeoutSeconds = Number(readValue());
    else if (arg === "--settle") options.settleSeconds = Number(readValue());
    else if (arg === "--out") options.out = readValue();
    else if (arg === "--baseline") options.baseline = readValue();
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!["preflight", "post-upgrade", "baseline", "container-rehearsal"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 1) {
    throw new Error("--timeout must be a positive number of seconds");
  }
  if (options.settleSeconds !== null && (!Number.isFinite(options.settleSeconds) || options.settleSeconds < 0)) {
    throw new Error("--settle must be zero or a positive number of seconds");
  }
  return options;
}

function defaultReportDir() {
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z");
  return path.join(process.cwd(), "reports", stamp);
}

function printProgress(event, options = {}) {
  if (event.type === "phase") {
    console.error(`[phase] ${event.message}`);
    return;
  }
  if (event.type === "command-start") {
    if (!options.debug) return;
    const commandText = ["openclaw", ...event.command.args].join(" ");
    const retryText = event.maxAttempts > 1 ? ` attempt ${event.attempt}/${event.maxAttempts}` : "";
    const requiredText = event.command.required ? "required" : "optional";
    console.error(`[run] ${event.message} (${requiredText}${retryText})`);
    console.error(`      ${commandText}`);
    return;
  }
  if (event.type === "command-end") {
    const result = event.result;
    const status = result.ok && !result.parseError ? "ok" : event.retrying ? "retry" : result.required ? "error" : "warn";
    if (!options.debug && status === "ok") return;
    const parseNote = result.parseError ? `, parse: ${result.parseError}` : "";
    const retryNote = event.retrying ? ", retrying" : "";
    console.error(`[${status}] ${event.command.id}: exit ${result.exitCode}, ${result.durationMs}ms${parseNote}${retryNote}`);
  }
}

function printRunSummary(report, paths) {
  const { jsonPath, markdownPath, htmlPath, options } = paths;
  const summary = report.summary;
  console.log("");
  console.log(`Clawback: ${report.result.toUpperCase()}`);
  console.log(`Checks: ${summary.checks} total, ${summary.ok} passed, ${summary.warnings} warnings, ${summary.errors} errors`);
  console.log(`Mode: ${report.mode}`);
  if (report.recommendation) {
    console.log(`Recommendation: ${report.recommendation.label}`);
  }

  const status = report.commands?.status?.json;
  const health = report.commands?.health?.json;
  if (status?.runtimeVersion) {
    const latest = status.update?.registry?.latestVersion;
    const suffix = latest && latest !== status.runtimeVersion ? ` (latest: ${latest})` : "";
    console.log(`OpenClaw: ${status.runtimeVersion}${suffix}`);
  }
  if (status?.gateway) {
    console.log(`Gateway: ${status.gateway.reachable ? "reachable" : "not reachable"} at ${status.gateway.url || "unknown URL"}`);
  }
  if (status?.gatewayService?.runtimeShort) {
    console.log(`Gateway service: ${status.gatewayService.runtimeShort}`);
  }
  if (status?.agents?.agents) {
    const pending = status.agents.agents.filter((agent) => agent.bootstrapPending).map((agent) => agent.id);
    const suffix = pending.length > 0 ? ` (${pending.length} bootstrap pending: ${pending.join(", ")})` : "";
    console.log(`Agents: ${status.agents.agents.length}${suffix}`);
  }
  if (health?.channels) {
    const configured = Object.entries(health.channels).filter(([, channel]) => channel.configured).map(([name]) => name);
    if (configured.length > 0) console.log(`Configured channels: ${configured.join(", ")}`);
  }
  if (report.resources?.peak) {
    console.log(
      `Resources: peak load/CPU ${report.resources.peak.load1PerCpu}, min memory available ${report.resources.peak.minMemoryAvailablePercent}%, peak process RSS ${formatBytes(report.resources.peak.processRssBytes)}`,
    );
  }
  if (report.mode === "preflight" || report.mode === "baseline") {
    console.log("Container rehearsal: not run by this command. Use `npm run suite:pre` to run local baseline and container rehearsal together.");
  }

  const important = report.checks.filter((check) => check.level === "error");
  if (important.length === 0) {
    important.push(...report.checks.filter((check) => check.level === "warning").slice(0, 6));
  }

  if (important.length > 0) {
    console.log("");
    console.log(summary.errors > 0 ? "Errors to fix first:" : "Most important warnings:");
    for (const check of important.slice(0, 8)) {
      console.log(`- ${check.id}: ${check.message}`);
    }
  } else {
    console.log("");
    console.log("No errors or warnings found.");
  }

  if (report.recommendation?.message) {
    console.log("");
    console.log(`Upgrade guidance: ${report.recommendation.message}`);
  }

  console.log("");
  if (options.html !== false) console.log(`HTML report: ${pathToFileURL(htmlPath).href}`);
  if (options.markdown !== false) console.log(`Markdown summary: ${markdownPath}`);
  console.log(`JSON report: ${jsonPath}`);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) return `${Math.round(mib)} MiB`;
  return `${Math.round((mib / 1024) * 10) / 10} GiB`;
}
