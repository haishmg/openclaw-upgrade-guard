import fs from "node:fs";

export function evaluate({ commands, baseline, mode }) {
  const checks = [];
  const add = (level, id, message, details = {}) => checks.push({ level, id, message, details });

  for (const command of Object.values(commands)) {
    if (command.required && !command.ok) {
      add("error", `command.${command.id}`, `Required command failed: openclaw ${command.args.join(" ")}`, commandSummary(command));
    } else if (!command.required && !command.ok) {
      add("warning", `command.${command.id}`, `Optional command was unavailable or failed: openclaw ${command.args.join(" ")}`, commandSummary(command));
    } else if (command.parseError) {
      const level = command.required ? "error" : "warning";
      add(level, `command.${command.id}.json`, `Command did not return parseable JSON: openclaw ${command.args.join(" ")}`, {
        parseError: command.parseError,
      });
    } else {
      add("ok", `command.${command.id}`, `Command completed: openclaw ${command.args.join(" ")}`, { durationMs: command.durationMs });
    }
  }

  const status = commands.status?.json;
  if (status) evaluateStatus(status, add);

  const health = commands.health?.json;
  if (health) evaluateHealth(health, add);

  evaluateConfig(commands.config_validate?.json, commands.config_validate, add);
  evaluateDoctor(commands.doctor?.json, commands.doctor, add);
  evaluateBaseline({ baseline, status, health, mode, add });

  return checks;
}

function evaluateStatus(status, add) {
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
  else add("error", "gateway.reachable", "Gateway is not reachable", status.gateway || {});

  if (status.gateway?.misconfigured) add("error", "gateway.config", "Gateway is marked misconfigured", status.gateway);
  else add("ok", "gateway.config", "Gateway is not marked misconfigured");

  const gatewayRuntime = status.gatewayService?.runtime;
  if (status.gatewayService?.installed && gatewayRuntime?.status === "running") {
    add("ok", "gateway.service", `Gateway service is running (${gatewayRuntime.state}/${gatewayRuntime.subState})`);
  } else {
    add("error", "gateway.service", "Gateway service is not installed and running", status.gatewayService || {});
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
      add("error", `agent.${agent.id}.workspace`, `Agent ${agent.id} workspace is missing`, { workspaceDir: agent.workspaceDir });
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

function evaluateHealth(health, add) {
  if (health.ok) add("ok", "health.ok", "OpenClaw health endpoint reports ok=true");
  else add("error", "health.ok", "OpenClaw health endpoint reports ok=false", health);

  const channels = health.channels || {};
  for (const [name, channel] of Object.entries(channels)) {
    if (channel.configured) add("ok", `channel.${name}.configured`, `${name} is configured`);
    else add("warning", `channel.${name}.configured`, `${name} is not configured`);

    if (channel.probe && channel.probe.ok === false) {
      add("error", `channel.${name}.probe`, `${name} probe failed`, channel.probe);
    } else if (channel.probe?.ok === true) {
      add("ok", `channel.${name}.probe`, `${name} probe succeeded`);
    }

    for (const [accountId, account] of Object.entries(channel.accounts || {})) {
      if (account.probe && account.probe.ok === false) {
        add("error", `channel.${name}.${accountId}.probe`, `${name}/${accountId} probe failed`, account.probe);
      }
      if (account.statusState === "linked" || account.linked === true) {
        add("ok", `channel.${name}.${accountId}.linked`, `${name}/${accountId} is linked`);
      }
    }
  }
}

function evaluateConfig(configJson, command, add) {
  if (!command?.ok) return;
  if (configJson?.ok === false) add("error", "config.validate", "OpenClaw config validation failed", configJson);
  else add("ok", "config.validate", "OpenClaw config validation command completed");
}

function evaluateDoctor(doctorJson, command, add) {
  if (!command?.ok) return;
  if (doctorJson?.ok === false) add("warning", "doctor", "OpenClaw doctor reported issues", doctorJson);
  else add("ok", "doctor", "OpenClaw doctor command completed");
}

function evaluateBaseline({ baseline, status, health, mode, add }) {
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

  if (mode === "post-upgrade" && previousStatus.runtimeVersion === status.runtimeVersion) {
    add("warning", "baseline.version", "Post-upgrade mode is using the same runtimeVersion as the baseline", {
      runtimeVersion: status.runtimeVersion,
    });
  }
}

function commandSummary(command) {
  return {
    exitCode: command.exitCode,
    timedOut: command.timedOut,
    durationMs: command.durationMs,
    stderr: command.stderr,
  };
}
