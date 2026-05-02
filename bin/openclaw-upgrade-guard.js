#!/usr/bin/env node
import { main } from "../lib/cli.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 2;
});
