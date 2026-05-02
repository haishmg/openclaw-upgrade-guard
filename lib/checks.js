import fs from "node:fs";

export function evaluate({ commands, baseline, mode, resources }) {
  const checks = [];
  const add = (level, id, message, details = {}) => checks.push({ level, id, message, details });

  for (const command of Object.values(commands)) {
    if (command.required && !command.ok) {
      add("error", `command.${command.id}`, `Required command failed: openclaw ${command.args.join(" ")}`, commandSummary(command));
    } else if (!command.required && !command.ok) {
      add("warning", `command.${command.id}`, `Optional command was unavailable or failed: openclaw ${command.args.join(" ")}`, commandSummary(command));
    } else if (command.parseError) {
      const containerAuthLimitation = isContainerAuthLimitation({ command, commands, mode });
      const transportFailure = commandOutputLooksLikeGatewayTransportFailure(command);
      const level = command.required || (transportFailure && !containerAuthLimitation) ? "error" : "warning";
      const message = containerAuthLimitation
        ? `Command needs gateway scopes that are not approved in the isolated container: openclaw ${command.args.join(" ")}`
        : transportFailure
        ? `Command printed a gateway transport failure instead of JSON: openclaw ${command.args.join(" ")}`
        : `Command did not return parseable JSON: openclaw ${command.args.join(" ")}`;
      add(level, `command.${command.id}.json`, message, {
        parseError: command.parseError,
      });
    } else {
      add("ok", `command.${command.id}`, `Command completed: openclaw ${command.args.join(" ")}`, { durationMs: command.durationMs });
    }
  }

  const status = commands.status?.json;
  if (status) evaluateStatus(status, add, mode);

  const health = commands.health?.json;
  if (health) evaluateHealth(health, add, mode);

  evaluateGatewayStatus(commands.gateway_status?.json, commands, mode, add);
  evaluateGatewayProbe(commands.gateway_probe?.json, add);
  evaluateConfig(commands.config_validate?.json, commands.config_validate, add);
  evaluateDoctor(commands.doctor?.json, commands.doctor, add);
  evaluateResources(resources, add);
  evaluateBaseline({ baseline, status, health, mode, commands, resources, add });

  return checks;
}

function evaluateResources(resources, add) {
  if (!resources?.peak) return;
  add("ok", "resources.sampled", `Collected ${resources.sampleCount} resource sample(s) during validation`, {
    startedAt: resources.startedAt,
    finishedAt: resources.finishedAt,
  });

  const peak = resources.peak;
  if (peak.minMemoryAvailablePercent < 10) {
    add("warning", "resources.memory", `Memory pressure was high; minimum available memory was ${peak.minMemoryAvailablePercent}%`, {
      peak,
    });
  } else {
    add("ok", "resources.memory", `Memory availability stayed above ${peak.minMemoryAvailablePercent}%`);
  }

  if (peak.load1PerCpu > 2) {
    add("warning", "resources.cpu", `CPU load was high; peak 1-minute load per CPU was ${peak.load1PerCpu}`, {
      peakLoad1: peak.load1,
      peakLoad1PerCpu: peak.load1PerCpu,
    });
  } else {
    add("ok", "resources.cpu", `CPU load stayed within range; peak 1-minute load per CPU was ${peak.load1PerCpu}`);
  }

  const rssLimitBytes = 1.5 * 1024 * 1024 * 1024;
  if (peak.processRssBytes > rssLimitBytes) {
    add("warning", "resources.process_rss", `Largest OpenClaw/Node process RSS reached ${formatBytes(peak.processRssBytes)}`, {
      process: peak.process,
    });
  } else {
    add("ok", "resources.process_rss", `Largest OpenClaw/Node process RSS stayed under ${formatBytes(rssLimitBytes)}`, {
      peakRssBytes: peak.processRssBytes,
      process: peak.process,
    });
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) return `${Math.round(mib)} MiB`;
  return `${Math.round((mib / 1024) * 10) / 10} GiB`;
}

function evaluateStatus(status, add, mode) {
  const hostRuntimeRequired = mode !== "container-rehearsal";

  if (status.runtimeVersion) add("ok", "status.runtime_version", `OpenClaw runtime version detected: ${status.runtimeVersion}`);
  else add("error", "status.runtime_version", "OpenClaw status did not include runtimeVersion");

  if (status.update?.registry?.latestVersion && status.runtimeVersion && status.update.registry.latestVersion !== status.runtimeVersion) {
    add("warning", "status.update_available", `Registry latest is ${status.update.registry.latestVersion}; installed runtime is ${status.runtimeVersion}`, {
      latestVersion: status.update.registry.latestVersion,
      runtimeVersion: status.runtimeVersion,
    });
  }

  if (status.update?.deps?.status && status.update.deps.status !== "ok") {
    add("warning", "status.update_deps", `OpenClaw dependency marker status is ${status.update.deps.status}`, {
      reason: status.update.deps.reason,
      root: status.update.root,
    });
  }

  if (status.gateway?.reachable) add("ok", "gateway.reachable", "Gateway is reachable");
  else add(hostRuntimeRequired ? "error" : "warning", "gateway.reachable", "Gateway is not reachable", status.gateway || {});

  if (status.gateway?.misconfigured) add("error", "gateway.config", "Gateway is marked misconfigured", status.gateway);
  else add("ok", "gateway.config", "Gateway is not marked misconfigured");

  const gatewayRuntime = status.gatewayService?.runtime;
  if (status.gatewayService?.installed && gatewayRuntime?.status === "running") {
    add("ok", "gateway.service", `Gateway service is running (${gatewayRuntime.state}/${gatewayRuntime.subState})`);
  } else {
    add(hostRuntimeRequired ? "error" : "warning", "gateway.service", "Gateway service is not installed and running", status.gatewayService || {});
  }

  if (status.nodeService?.installed && status.nodeService?.runtime?.status !== "running") {
    add("warning", "node.service", "Node service is installed but not running", status.nodeService);
  } else {
    add("ok", "node.service", "Node service state is acceptable for this install");
  }

  const agents = status.agents?.agents || [];
  if (agents.length > 0) add("ok", "agents.present", `Found ${agents.length} configured agent(s)`);
  else add("error", "agents.present", "No configured agents found");

  for (const agent of agents) {
    if (agent.workspaceDir && fs.existsSync(agent.workspaceDir)) {
      add("ok", `agent.${agent.id}.workspace`, `Agent ${agent.id} workspace exists`, { workspaceDir: agent.workspaceDir });
    } else {
      add(hostRuntimeRequired ? "error" : "warning", `agent.${agent.id}.workspace`, `Agent ${agent.id} workspace is missing`, { workspaceDir: agent.workspaceDir });
    }

    if (agent.sessionsPath && fs.existsSync(agent.sessionsPath)) {
      add("ok", `agent.${agent.id}.sessions`, `Agent ${agent.id} sessions file exists`, {
        sessionsPath: agent.sessionsPath,
        sessionsCount: agent.sessionsCount,
      });
    } else {
      add("warning", `agent.${agent.id}.sessions`, `Agent ${agent.id} sessions file is missing`, { sessionsPath: agent.sessionsPath });
    }

    if (agent.bootstrapPending) {
      add("warning", `agent.${agent.id}.bootstrap`, `Agent ${agent.id} has bootstrapPending=true`, { workspaceDir: agent.workspaceDir });
    }
  }

  const tasks = status.tasks;
  if (tasks) {
    if ((tasks.byStatus?.queued || 0) > 0 || (tasks.byStatus?.running || 0) > 0) {
      add("warning", "tasks.active", "There are queued or running tasks during validation", tasks.byStatus);
    } else {
      add("ok", "tasks.active", "No queued or running tasks");
    }
    if ((tasks.byStatus?.lost || 0) > 0 || (tasks.failures || 0) > 0) {
      add("warning", "tasks.history", "Historical failed/lost tasks are present; review before blaming an upgrade", {
        failures: tasks.failures,
        byStatus: tasks.byStatus,
      });
    }
  }

  if (status.taskAudit?.errors > 0 || status.taskAudit?.warnings > 0) {
    add("warning", "tasks.audit", "Task audit contains historical warnings or errors", status.taskAudit);
  }
}

function evaluateHealth(health, add, mode) {
  if (health.ok) add("ok", "health.ok", "OpenClaw health endpoint reports ok=true");
  else add("error", "health.ok", "OpenClaw health endpoint reports ok=false", health);

  const channels = health.channels || {};
  for (const [name, channel] of Object.entries(channels)) {
    if (channel.configured) add("ok", `channel.${name}.configured`, `${name} is configured`);
    else add("warning", `channel.${name}.configured`, `${name} is not configured`);

    if (channel.probe && channel.probe.ok === false) {
      add(channelProbeLevel(mode), `channel.${name}.probe`, `${name} probe failed`, channel.probe);
    } else if (channel.probe?.ok === true) {
      add("ok", `channel.${name}.probe`, `${name} probe succeeded`);
    }

    for (const [accountId, account] of Object.entries(channel.accounts || {})) {
      if (account.probe && account.probe.ok === false) {
        add(channelProbeLevel(mode), `channel.${name}.${accountId}.probe`, `${name}/${accountId} probe failed`, account.probe);
      }
      if (account.statusState === "linked" || account.linked === true) {
        add("ok", `channel.${name}.${accountId}.linked`, `${name}/${accountId} is linked`);
      }
    }
  }
}

function channelProbeLevel(mode) {
  return mode === "container-rehearsal" ? "warning" : "error";
}

function evaluateGatewayStatus(gatewayStatus, commands, mode, add) {
  if (!gatewayStatus) return;
  if (gatewayStatus.config?.cli?.valid === false || gatewayStatus.config?.daemon?.valid === false) {
    add("error", "gateway.status.config", "Gateway status reports invalid gateway config", gatewayStatus.config);
  }
  if (gatewayStatus.rpc?.ok === false) {
    const scopeLimitedContainer = mode === "container-rehearsal" && commands.gateway_probe?.json?.ok === true;
    add(
      scopeLimitedContainer ? "warning" : "error",
      "gateway.status.rpc",
      scopeLimitedContainer
        ? "Gateway status RPC did not complete, but container gateway probe succeeded"
        : "Gateway status RPC probe failed",
      gatewayStatus.rpc,
    );
  } else if (gatewayStatus.rpc?.ok === true) {
    add("ok", "gateway.status.rpc", "Gateway status RPC probe succeeded");
  }
}

function evaluateGatewayProbe(gatewayProbe, add) {
  if (!gatewayProbe) return;
  if (gatewayProbe.ok === false) {
    add("error", "gateway.probe", "Gateway probe failed", gatewayProbe);
  } else if (gatewayProbe.ok === true) {
    add("ok", "gateway.probe", "Gateway probe succeeded", {
      capability: gatewayProbe.capability,
      durationMs: gatewayProbe.durationMs,
    });
  }
}

function evaluateConfig(configJson, command, add) {
  if (!command?.ok) return;
  if (configJson?.ok === false || configJson?.valid === false) {
    add("error", "config.validate", "OpenClaw config validation failed", configJson);
  } else if (command.parseError && commandOutputLooksLikeInvalidConfig(command)) {
    add("error", "config.validate", "OpenClaw config validation output indicates an invalid config but was not parseable", {
      parseError: command.parseError,
    });
  } else if (!command.parseError) {
    add("ok", "config.validate", "OpenClaw config validation command completed");
  }
}

function commandOutputLooksLikeInvalidConfig(command) {
  const output = `${command.stdout || ""}\n${command.stderr || ""}`;
  return /"valid"\s*:\s*false|invalid\s+config|config\s+invalid/i.test(output);
}

function commandOutputLooksLikeGatewayTransportFailure(command) {
  const output = `${command.stdout || ""}\n${command.stderr || ""}`;
  return /GatewayTransportError|gateway closed|connect ECONNREFUSED .*OpenClaw|Failed to start CLI/i.test(output);
}

function isContainerAuthLimitation({ command, commands, mode }) {
  if (mode !== "container-rehearsal") return false;
  if (commands.gateway_probe?.json?.ok !== true) return false;
  const output = `${command.stdout || ""}\n${command.stderr || ""}`;
  return /scope upgrade pending approval|pairing required|asking for more scopes|gateway timeout after \d+ms/i.test(output);
}

function evaluateDoctor(doctorJson, command, add) {
  if (!command?.ok) return;
  if (doctorJson?.ok === false) add("warning", "doctor", "OpenClaw doctor reported issues", doctorJson);
  else add("ok", "doctor", "OpenClaw doctor command completed");
}

function evaluateBaseline({ baseline, status, health, mode, commands, resources, add }) {
  if (!baseline) return;
  const previousStatus = baseline.commands?.status?.json;
  const previousHealth = baseline.commands?.health?.json;
  if (!previousStatus || !status) {
    add("warning", "baseline.status", "Could not compare status with baseline");
    return;
  }

  const currentAgents = new Set((status.agents?.agents || []).map((agent) => agent.id));
  for (const agent of previousStatus.agents?.agents || []) {
    if (!currentAgents.has(agent.id)) {
      add("error", `baseline.agent.${agent.id}`, `Agent ${agent.id} existed in baseline but is missing now`);
    }
  }

  const previousChannels = Object.keys(previousHealth?.channels || {});
  for (const channelName of previousChannels) {
    const before = previousHealth.channels[channelName];
    const after = health?.channels?.[channelName];
    if (before?.configured && !after?.configured) {
      add("error", `baseline.channel.${channelName}`, `${channelName} was configured in baseline but is not configured now`);
    }
  }

  evaluateBaselineCommands(baseline.commands || {}, commands || {}, add);
  evaluateBaselineGateway(previousStatus.gateway, status.gateway, add);
  evaluateBaselineGatewayProbe(baseline.commands?.gateway_probe?.json, commands.gateway_probe?.json, add);
  evaluateBaselineChannelAccounts(previousHealth, health, add);
  evaluateBaselineResources(baseline.resources, resources, add);

  if (mode === "post-upgrade" && previousStatus.runtimeVersion === status.runtimeVersion) {
    add("warning", "baseline.version", "Post-upgrade mode is using the same runtimeVersion as the baseline", {
      runtimeVersion: status.runtimeVersion,
    });
  }
}

function evaluateBaselineCommands(previousCommands, currentCommands, add) {
  for (const [id, previous] of Object.entries(previousCommands)) {
    const current = currentCommands[id];
    if (!current) continue;
    if (previous.ok === true && current.ok !== true) {
      add("error", `baseline.command.${id}`, `Command passed in the baseline but fails now: openclaw ${current.args?.join(" ") || id}`, {
        before: commandSummary(previous),
        after: commandSummary(current),
      });
    }
    if (!previous.parseError && current.parseError) {
      add("error", `baseline.command.${id}.json`, `Command returned parseable output in the baseline but does not now: openclaw ${current.args?.join(" ") || id}`, {
        before: { durationMs: previous.durationMs },
        after: { parseError: current.parseError, stdout: current.stdout, stderr: current.stderr },
      });
    }
  }
}

function evaluateBaselineGateway(previousGateway, currentGateway, add) {
  if (!previousGateway || !currentGateway) return;
  if (previousGateway.reachable === true && currentGateway.reachable !== true) {
    add("error", "baseline.gateway.reachable", "Gateway was reachable in the baseline but is not reachable now", {
      before: previousGateway,
      after: currentGateway,
    });
  }
  if (previousGateway.self && !currentGateway.self) {
    add("error", "baseline.gateway.self", "Gateway identity was available in the baseline but is missing now", {
      before: previousGateway.self,
      afterError: currentGateway.error,
      afterAuthWarning: currentGateway.authWarning,
    });
  }
  if (!previousGateway.error && currentGateway.error) {
    add("error", "baseline.gateway.error", `Gateway now reports an error that was not present in the baseline: ${currentGateway.error}`, {
      before: previousGateway.error,
      after: currentGateway.error,
    });
  }
}

function evaluateBaselineGatewayProbe(previousProbe, currentProbe, add) {
  if (!previousProbe) return;
  if (previousProbe.ok === true && currentProbe?.ok !== true) {
    add("error", "baseline.gateway_probe", "Gateway probe passed in the baseline but does not pass now", {
      before: previousProbe,
      after: currentProbe,
    });
  } else if (previousProbe.ok === true) {
    add("ok", "baseline.gateway_probe", "Gateway probe still passes compared with the baseline");
  }
}

function evaluateBaselineChannelAccounts(previousHealth, currentHealth, add) {
  const beforeChannels = previousHealth?.channels || {};
  const afterChannels = currentHealth?.channels || {};
  for (const [channelName, beforeChannel] of Object.entries(beforeChannels)) {
    const afterChannel = afterChannels[channelName];
    for (const [accountId, beforeAccount] of Object.entries(beforeChannel.accounts || {})) {
      const afterAccount = afterChannel?.accounts?.[accountId];
      if (beforeAccount.configured === true && afterAccount?.configured !== true) {
        add("error", `baseline.channel.${channelName}.${accountId}.configured`, `${channelName}/${accountId} was configured in the baseline but is not configured now`, {
          before: accountSummary(beforeAccount),
          after: accountSummary(afterAccount),
        });
      }
      if (beforeAccount.linked === true && afterAccount?.linked !== true) {
        add("error", `baseline.channel.${channelName}.${accountId}.linked`, `${channelName}/${accountId} was linked in the baseline but is not linked now`, {
          before: accountSummary(beforeAccount),
          after: accountSummary(afterAccount),
        });
      }
      if (beforeAccount.probe?.ok === true && afterAccount?.probe?.ok !== true) {
        add("error", `baseline.channel.${channelName}.${accountId}.probe`, `${channelName}/${accountId} probe passed in the baseline but does not pass now`, {
          before: beforeAccount.probe,
          after: afterAccount?.probe,
        });
      }
    }
  }
}

function evaluateBaselineResources(previousResources, currentResources, add) {
  const before = previousResources?.peak;
  const after = currentResources?.peak;
  if (!before || !after) return;
  add("ok", "baseline.resources", "Baseline resource metrics are available for comparison");
  if (before.processRssBytes > 0 && after.processRssBytes > Math.max(before.processRssBytes * 2, before.processRssBytes + 512 * 1024 * 1024)) {
    add("warning", "baseline.resources.process_rss", "Largest OpenClaw/Node process RSS is materially higher than the baseline", {
      before: before.processRssBytes,
      after: after.processRssBytes,
    });
  }
  if (Number.isFinite(before.load1PerCpu) && Number.isFinite(after.load1PerCpu) && after.load1PerCpu > Math.max(2, before.load1PerCpu * 2)) {
    add("warning", "baseline.resources.cpu", "Peak load per CPU is materially higher than the baseline", {
      before: before.load1PerCpu,
      after: after.load1PerCpu,
    });
  }
}

function accountSummary(account) {
  if (!account) return null;
  return {
    configured: account.configured,
    linked: account.linked,
    statusState: account.statusState,
    lastError: account.lastError,
    probeOk: account.probe?.ok,
    probeError: account.probe?.error,
  };
}

function commandSummary(command) {
  return {
    exitCode: command.exitCode,
    timedOut: command.timedOut,
    durationMs: command.durationMs,
    stderr: command.stderr,
  };
}
