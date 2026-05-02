import fs from "node:fs";
import path from "node:path";
import { runGuard } from "./runner.js";
import { renderMarkdown } from "./markdown.js";

const HELP = `Usage: openclaw-upgrade-guard [options]

Checks whether the current OpenClaw setup looks safe before or after an upgrade.

Options:
  --mode <name>          preflight|post-upgrade|baseline (default: preflight)
  --openclaw <path>      OpenClaw executable to run (default: openclaw)
  --timeout <seconds>    Per-command timeout (default: 30)
  --out <dir>            Report directory (default: ./reports/<timestamp>)
  --baseline <file>      Previous JSON report to compare against
  --json                 Print JSON report to stdout
  --no-markdown          Do not write summary.md
  --strict-warnings      Exit 1 when warnings are present
  -h, --help             Show this help
`;

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }

  const report = await runGuard(options);
  const outDir = options.out || defaultReportDir();
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  if (options.markdown !== false) {
    fs.writeFileSync(path.join(outDir, "summary.md"), renderMarkdown(report));
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`OpenClaw Upgrade Guard: ${report.result.toUpperCase()}`);
    console.log(`Report: ${jsonPath}`);
    console.log(`Errors: ${report.summary.errors}, warnings: ${report.summary.warnings}, checks: ${report.summary.checks}`);
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
    markdown: true,
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
    else if (arg === "--no-markdown") options.markdown = false;
    else if (arg === "--strict-warnings") options.strictWarnings = true;
    else if (arg === "--mode") options.mode = readValue();
    else if (arg === "--openclaw") options.openclaw = readValue();
    else if (arg === "--timeout") options.timeoutSeconds = Number(readValue());
    else if (arg === "--out") options.out = readValue();
    else if (arg === "--baseline") options.baseline = readValue();
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!["preflight", "post-upgrade", "baseline"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 1) {
    throw new Error("--timeout must be a positive number of seconds");
  }
  return options;
}

function defaultReportDir() {
  const stamp = new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z");
  return path.join(process.cwd(), "reports", stamp);
}
