export function renderHtml(report) {
  const checksJson = JSON.stringify(report.checks);
  const commandsJson = JSON.stringify(commandRows(report.commands));
  const summary = report.summary || { checks: 0, ok: 0, warnings: 0, errors: 0 };
  const total = Math.max(summary.checks || 0, 1);
  const okPercent = Math.round(((summary.ok || 0) / total) * 100);
  const warnPercent = Math.round(((summary.warnings || 0) / total) * 100);
  const errorPercent = Math.round(((summary.errors || 0) / total) * 100);
  const recommendation = report.recommendation || {};
  const recommendationClass = recommendationClassFor(recommendation.decision);
  const resources = report.resources?.peak;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClaw Upgrade Guard Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #18202b;
      --muted: #657080;
      --line: #d9dee7;
      --ok: #1f8a5b;
      --ok-bg: #e5f5ee;
      --warn: #b7791f;
      --warn-bg: #fff3d7;
      --err: #c24132;
      --err-bg: #fde7e4;
      --blue: #2f6f9f;
      --shadow: 0 12px 32px rgba(24, 32, 43, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      background: #16202d;
      color: #fff;
      padding: 28px 24px 24px;
    }
    .wrap { max-width: 1180px; margin: 0 auto; }
    .topline {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
    .meta { color: #c6d0dc; line-height: 1.55; font-size: 14px; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 6px;
      background: ${report.result === "pass" ? "var(--ok-bg)" : "var(--err-bg)"};
      color: ${report.result === "pass" ? "var(--ok)" : "var(--err)"};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    main { padding: 24px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .metric-label { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    .metric-value { font-size: 30px; font-weight: 750; line-height: 1; }
    .metric-value.ok { color: var(--ok); }
    .metric-value.warning { color: var(--warn); }
    .metric-value.error { color: var(--err); }
    .recommendation {
      margin: 0 0 18px;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .recommendation.ok { border-left: 6px solid var(--ok); }
    .recommendation.warning { border-left: 6px solid var(--warn); }
    .recommendation.error { border-left: 6px solid var(--err); }
    .recommendation-title { font-size: 18px; font-weight: 750; margin-bottom: 6px; }
    .recommendation-message { color: var(--muted); line-height: 1.45; }
    .bar {
      display: grid;
      grid-template-columns: ${okPercent}fr ${warnPercent}fr ${errorPercent}fr;
      overflow: hidden;
      border-radius: 6px;
      height: 14px;
      background: #e7ebf0;
      border: 1px solid var(--line);
      margin: 8px 0 24px;
    }
    .bar div:nth-child(1) { background: var(--ok); }
    .bar div:nth-child(2) { background: var(--warn); }
    .bar div:nth-child(3) { background: var(--err); }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin: 0 0 14px;
    }
    input[type="search"], select {
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 0 10px;
      font: inherit;
    }
    input[type="search"] { flex: 1 1 280px; min-width: 200px; }
    button {
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 0 12px;
      font: inherit;
      cursor: pointer;
    }
    button.active { background: #16202d; color: #fff; border-color: #16202d; }
    .section-title {
      margin: 26px 0 12px;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: end;
    }
    h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .small { color: var(--muted); font-size: 13px; }
    .checks {
      display: grid;
      gap: 10px;
    }
    details {
      background: var(--panel);
      border: 1px solid var(--line);
      border-left-width: 6px;
      border-radius: 8px;
      box-shadow: 0 6px 18px rgba(24, 32, 43, 0.05);
    }
    details.ok { border-left-color: var(--ok); }
    details.warning { border-left-color: var(--warn); }
    details.error { border-left-color: var(--err); }
    summary {
      list-style: none;
      cursor: pointer;
      padding: 13px 14px;
      display: grid;
      grid-template-columns: 92px minmax(120px, 260px) 1fr;
      gap: 12px;
      align-items: center;
    }
    summary::-webkit-details-marker { display: none; }
    .badge {
      display: inline-flex;
      width: 78px;
      min-height: 26px;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .badge.ok { background: var(--ok-bg); color: var(--ok); }
    .badge.warning { background: var(--warn-bg); color: var(--warn); }
    .badge.error { background: var(--err-bg); color: var(--err); }
    .check-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #344054; font-size: 13px; overflow-wrap: anywhere; }
    .message { color: var(--ink); line-height: 1.35; }
    pre {
      margin: 0;
      padding: 0 14px 14px 118px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: #344054;
      font-size: 12px;
      line-height: 1.45;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      vertical-align: middle;
    }
    th { color: var(--muted); background: #fbfcfd; font-weight: 650; }
    tr:last-child td { border-bottom: 0; }
    .timing {
      display: grid;
      grid-template-columns: minmax(42px, 70px) 1fr;
      gap: 8px;
      align-items: center;
    }
    .timing-track { height: 8px; background: #e7ebf0; border-radius: 4px; overflow: hidden; }
    .timing-fill { height: 100%; background: var(--blue); border-radius: 4px; }
    .empty {
      background: var(--panel);
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 22px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 760px) {
      main, header { padding-left: 14px; padding-right: 14px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      summary { grid-template-columns: 82px 1fr; }
      .message { grid-column: 1 / -1; }
      pre { padding-left: 14px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topline">
      <div>
        <h1>OpenClaw Upgrade Guard Report</h1>
        <div class="meta">
          Mode: ${escapeHtml(report.mode)}<br>
          Host: ${escapeHtml(report.host?.hostname || "unknown")} (${escapeHtml(report.host?.platform || "unknown")} ${escapeHtml(report.host?.release || "")}, ${escapeHtml(report.host?.arch || "")})<br>
          Started: ${escapeHtml(report.startedAt)} · Finished: ${escapeHtml(report.finishedAt)}
        </div>
      </div>
      <div class="status-pill">${escapeHtml(report.result || "unknown")}</div>
    </div>
  </header>
  <main>
    <div class="wrap">
      <section class="grid" aria-label="Summary metrics">
        ${metric("Checks", summary.checks || 0)}
        ${metric("Passed", summary.ok || 0, "ok")}
        ${metric("Warnings", summary.warnings || 0, "warning")}
        ${metric("Errors", summary.errors || 0, "error")}
      </section>
      <section class="recommendation ${recommendationClass}" aria-label="Upgrade recommendation">
        <div class="recommendation-title">${escapeHtml(recommendation.label || "No upgrade recommendation available")}</div>
        <div class="recommendation-message">${escapeHtml(recommendation.message || "The report did not include upgrade guidance.")}</div>
      </section>
      <div class="bar" title="Pass/warning/error distribution"><div></div><div></div><div></div></div>
      ${
        resources
          ? `<section class="grid" aria-label="Resource metrics">
        ${metric("Peak Load/CPU", resources.load1PerCpu ?? "n/a", resourceLevel(resources.load1PerCpu, 2))}
        ${metric("Min Memory Available", `${resources.minMemoryAvailablePercent ?? "n/a"}%`, resourceLevel(resources.minMemoryAvailablePercent, 10, true))}
        ${metric("Peak Process RSS", formatBytes(resources.processRssBytes), resourceLevel(resources.processRssBytes, 1.5 * 1024 * 1024 * 1024))}
        ${metric("Resource Samples", report.resources.sampleCount || 0)}
      </section>`
          : ""
      }

      <section class="section-title">
        <div>
          <h2>Checks</h2>
          <div class="small" id="checkCount"></div>
        </div>
      </section>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search checks, ids, messages, details">
        <button class="filter active" data-level="all">All</button>
        <button class="filter" data-level="error">Errors</button>
        <button class="filter" data-level="warning">Warnings</button>
        <button class="filter" data-level="ok">Passed</button>
        <button id="expandAll">Expand</button>
        <button id="collapseAll">Collapse</button>
      </div>
      <div class="checks" id="checks"></div>

      <section class="section-title">
        <div>
          <h2>Command Timings</h2>
          <div class="small">Runtime and parse status for each OpenClaw command.</div>
        </div>
      </section>
      <div id="commands"></div>
    </div>
  </main>
  <script>
    const checks = ${checksJson};
    const commands = ${commandsJson};
    let activeLevel = "all";
    const search = document.getElementById("search");
    const checksNode = document.getElementById("checks");
    const checkCount = document.getElementById("checkCount");

    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function renderChecks() {
      const query = search.value.trim().toLowerCase();
      const visible = checks.filter((check) => {
        if (activeLevel !== "all" && check.level !== activeLevel) return false;
        if (!query) return true;
        return JSON.stringify(check).toLowerCase().includes(query);
      });

      checkCount.textContent = visible.length + " of " + checks.length + " visible";
      if (visible.length === 0) {
        checksNode.innerHTML = '<div class="empty">No checks match the current filter.</div>';
        return;
      }

      checksNode.innerHTML = visible.map((check) => {
        const details = check.details && Object.keys(check.details).length > 0
          ? "<pre>" + escapeText(JSON.stringify(check.details, null, 2)) + "</pre>"
          : "";
        const open = check.level === "error" || check.level === "warning" ? " open" : "";
        return '<details class="' + escapeText(check.level) + '"' + open + '>' +
          '<summary>' +
          '<span class="badge ' + escapeText(check.level) + '">' + escapeText(check.level) + '</span>' +
          '<span class="check-id">' + escapeText(check.id) + '</span>' +
          '<span class="message">' + escapeText(check.message) + '</span>' +
          '</summary>' + details +
          '</details>';
      }).join("");
    }

    function renderCommands() {
      const maxDuration = Math.max(...commands.map((command) => command.durationMs || 0), 1);
      const rows = commands.map((command) => {
        const width = Math.max(2, Math.round(((command.durationMs || 0) / maxDuration) * 100));
        const status = command.ok && !command.parseError ? "ok" : "warning";
        return '<tr>' +
          '<td><span class="badge ' + status + '">' + (status === "ok" ? "ok" : "check") + '</span></td>' +
          '<td class="check-id">' + escapeText(command.id) + '</td>' +
          '<td>' + escapeText(command.args.join(" ")) + '</td>' +
          '<td>' + escapeText(command.exitCode) + '</td>' +
          '<td>' + escapeText(command.attempt || 1) + '</td>' +
          '<td class="timing"><span>' + escapeText(command.durationMs) + 'ms</span><span class="timing-track"><span class="timing-fill" style="width: ' + width + '%"></span></span></td>' +
          '<td>' + escapeText(command.parseError || "") + '</td>' +
          '</tr>';
      }).join("");

      document.getElementById("commands").innerHTML =
        '<table><thead><tr><th>Status</th><th>ID</th><th>Args</th><th>Exit</th><th>Attempt</th><th>Duration</th><th>Parse note</th></tr></thead><tbody>' +
        rows +
        '</tbody></table>';
    }

    document.querySelectorAll(".filter").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        activeLevel = button.dataset.level;
        renderChecks();
      });
    });
    search.addEventListener("input", renderChecks);
    document.getElementById("expandAll").addEventListener("click", () => {
      document.querySelectorAll("#checks details").forEach((node) => node.open = true);
    });
    document.getElementById("collapseAll").addEventListener("click", () => {
      document.querySelectorAll("#checks details").forEach((node) => node.open = false);
    });

    renderChecks();
    renderCommands();
  </script>
</body>
</html>
`;
}

function metric(label, value, level = "") {
  return `<div class="card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value ${level}">${escapeHtml(value)}</div></div>`;
}

function recommendationClassFor(decision) {
  if (decision === "upgrade-ok" || decision === "trust-upgrade") return "ok";
  if (decision === "upgrade-with-caution" || decision === "verify-before-trusting") return "warning";
  return "error";
}

function resourceLevel(value, threshold, inverse = false) {
  if (!Number.isFinite(Number(value))) return "";
  if (inverse) return Number(value) < threshold ? "warning" : "ok";
  return Number(value) > threshold ? "warning" : "ok";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) return `${Math.round(mib)} MiB`;
  return `${Math.round((mib / 1024) * 10) / 10} GiB`;
}

function commandRows(commands = {}) {
  return Object.values(commands).map((command) => ({
    id: command.id,
    args: command.args || [],
    ok: command.ok,
    exitCode: command.exitCode,
    attempt: command.attempt,
    durationMs: command.durationMs,
    parseError: command.parseError,
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
