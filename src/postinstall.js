#!/usr/bin/env node

const { autoInstallHook } = require('./auto-install-hook');
const { autoInstallCodexHook } = require('./auto-install-codex-hook');
const { autoInstallAiCliHooks } = require('./auto-install-ai-hooks');

async function main() {
  autoInstallHook();
  await autoInstallCodexHook();
  await autoInstallAiCliHooks();
}

main().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`[twn] postinstall skipped: ${message}\n`);
});
