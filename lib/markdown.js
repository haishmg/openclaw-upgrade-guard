export function renderMarkdown(report) {
  const lines = [
    "# OpenClaw Upgrade Guard Report",
    "",
    `- Result: ${report.result.toUpperCase()}`,
    `- Mode: ${report.mode}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Host: ${report.host.hostname} (${report.host.platform} ${report.host.release}, ${report.host.arch})`,
    `- Checks: ${report.summary.checks}`,
    `- Errors: ${report.summary.errors}`,
    `- Warnings: ${report.summary.warnings}`,
    "",
    "## Findings",
    "",
  ];

  for (const level of ["error", "warning", "ok"]) {
    const checks = report.checks.filter((check) => check.level === level);
    if (checks.length === 0) continue;
    lines.push(`### ${label(level)}`, "");
    for (const check of checks) {
      lines.push(`- ${check.id}: ${check.message}`);
    }
    lines.push("");
  }

  lines.push("## Next Steps", "");
  if (report.summary.errors > 0) {
    lines.push("- Fix errors before upgrading or before trusting the upgraded install.");
  } else {
    lines.push("- No hard blockers were found by this run.");
  }
  if (report.summary.warnings > 0) {
    lines.push("- Review warnings and decide whether they are expected for this setup.");
  }
  lines.push("- Keep `report.json` as the baseline, then run post-upgrade with `--baseline report.json --mode post-upgrade`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function label(level) {
  if (level === "ok") return "Passed";
  return `${level[0].toUpperCase()}${level.slice(1)}s`;
}
