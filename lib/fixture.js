export function sanitizeFixtureJson(relativePath, data) {
  if (relativePath === "openclaw.json") return sanitizeOpenClawConfig(data);
  return data;
}

function sanitizeOpenClawConfig(config) {
  if (!config || typeof config !== "object") return config;

  const plugins = config.plugins;
  if (!plugins || typeof plugins !== "object") return config;

  const pathInstalledIds = new Set();
  for (const [id, install] of Object.entries(plugins.installs || {})) {
    if (isPathInstall(install)) pathInstalledIds.add(id);
  }

  if (pathInstalledIds.size === 0 && !Array.isArray(plugins.load?.paths)) return config;

  const next = structuredClone(config);
  const nextPlugins = next.plugins || {};

  for (const id of pathInstalledIds) {
    delete nextPlugins.entries?.[id];
    delete nextPlugins.installs?.[id];
  }

  if (Array.isArray(nextPlugins.allow)) {
    nextPlugins.allow = nextPlugins.allow.filter((id) => !pathInstalledIds.has(id));
  }

  if (Array.isArray(nextPlugins.load?.paths)) {
    const pathInstallValues = new Set();
    for (const install of Object.values(plugins.installs || {})) {
      if (!isPathInstall(install)) continue;
      if (typeof install.sourcePath === "string") pathInstallValues.add(install.sourcePath);
      if (typeof install.installPath === "string") pathInstallValues.add(install.installPath);
    }
    nextPlugins.load.paths = nextPlugins.load.paths.filter((pluginPath) => !pathInstallValues.has(pluginPath));
    if (nextPlugins.load.paths.length === 0) delete nextPlugins.load.paths;
  }

  if (nextPlugins.load && Object.keys(nextPlugins.load).length === 0) delete nextPlugins.load;
  if (nextPlugins.installs && Object.keys(nextPlugins.installs).length === 0) delete nextPlugins.installs;
  return next;
}

function isPathInstall(install) {
  return install && typeof install === "object" && (
    install.source === "path" ||
    typeof install.sourcePath === "string" ||
    typeof install.installPath === "string"
  );
}
