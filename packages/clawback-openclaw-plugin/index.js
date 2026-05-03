const plugin = {
  id: "clawback",
  name: "Clawback",
  description: "Command helper for Clawback OpenClaw upgrade rehearsals.",
  register(api) {
    api.registerCli(({ program }) => {
      registerClawbackHelperCli(program, api.pluginConfig || {});
    }, {
      descriptors: [{
        name: "clawback",
        description: "Print Clawback setup and rehearsal commands",
        hasSubcommands: true,
      }],
    });
  },
};

function registerClawbackHelperCli(program, config) {
  const root = program
    .command("clawback")
    .description("Print Clawback setup and rehearsal commands");

  root
    .command("setup")
    .description("Print commands for installing Clawback from the latest release tag")
    .option("--tag <tag>", "Clawback release tag", "v0.3.2")
    .option("--dir <dir>", "Checkout directory", config.checkoutDir || "clawback")
    .action((options) => {
      printLines([
        `git clone --depth 1 --branch ${shellWord(options.tag)} https://github.com/haishmg/Clawback.git ${shellWord(options.dir)}`,
        `cd ${shellWord(options.dir)}`,
        "npm install --ignore-scripts",
        "node bin/clawback.js --help",
      ]);
    });

  root
    .command("commands")
    .description("Print baseline, rehearsal, and post-upgrade commands")
    .option("--target <version>", "OpenClaw target version, tag, or package")
    .option("--dir <dir>", "Clawback checkout directory", config.checkoutDir || "clawback")
    .option("--private-fixture", "Include workspace files and plugin runtime deps")
    .action((options) => {
      const target = options.target || config.defaultTarget || "<target-version>";
      const privateFixture = Boolean(options.privateFixture || config.privateFixture);
      const rehearsal = ["npm run suite:pre -- --target", shellWord(target)];
      if (privateFixture) rehearsal.push("--private-fixture");
      printLines([
        `cd ${shellWord(options.dir)}`,
        "node bin/clawback.js --mode baseline",
        rehearsal.join(" "),
        "npm run suite:post",
      ]);
    });

  root
    .command("links")
    .description("Print Clawback project links")
    .action(() => {
      printLines([
        "Repo: https://github.com/haishmg/Clawback",
        "Latest release: https://github.com/haishmg/Clawback/releases/latest",
        "Docs: https://github.com/haishmg/Clawback#readme",
      ]);
    });
}

function printLines(lines) {
  for (const line of lines) console.log(line);
}

function shellWord(value) {
  const text = String(value || "");
  if (/^[A-Za-z0-9_./:@+-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export default plugin;
