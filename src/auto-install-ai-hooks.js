const { installAiCliHooks } = require('./ai-cli-integrations');
const { isGlobalInstall, parseFlag } = require('./auto-install-hook');

async function autoInstallAiCliHooks(options = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const installer = options.installAiCliHooks || installAiCliHooks;

  const decision = shouldAutoInstallAiCliHooks(env);
  if (!decision.shouldInstall) {
    return { skipped: true, reason: decision.reason };
  }

  try {
    const results = await installer({
      clis: parseCliList(env.TWN_AUTO_AI_HOOK_CLIS) || ['qwen', 'gemini', 'claude', 'qoder'],
      onlyExisting: true,
      skipCodex: true,
      env
    });

    for (const result of results) {
      if (result.action === 'skipped') continue;
      stdout.write(`[twn] ${result.action} ${result.displayName} hook in ${result.filePath || 'settings'}\n`);
      if (result.action === 'failed') {
        stdout.write(`[twn] ${result.displayName} hook failed: ${result.error}\n`);
      }
    }

    return {
      skipped: false,
      results
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    stderr.write(`[twn] auto AI CLI hook install skipped: ${message}\n`);
    return {
      skipped: true,
      reason: 'install-failed',
      error
    };
  }
}

function shouldAutoInstallAiCliHooks(env = process.env) {
  if (flagEnabled(env.TWN_SKIP_AUTO_HOOK) || flagEnabled(env.TWN_SKIP_AI_HOOKS)) {
    return { shouldInstall: false, reason: 'disabled' };
  }

  const explicit = parseFlag(env.TWN_AUTO_AI_HOOKS);
  if (explicit === false) {
    return { shouldInstall: false, reason: 'disabled' };
  }
  if (explicit === true) {
    return { shouldInstall: true, reason: 'explicit' };
  }

  if (isGlobalInstall(env)) {
    return { shouldInstall: true, reason: 'global-install' };
  }

  return { shouldInstall: false, reason: 'local-install' };
}

function parseCliList(value) {
  if (!value) return undefined;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function flagEnabled(value) {
  return parseFlag(value) === true;
}

module.exports = {
  autoInstallAiCliHooks,
  shouldAutoInstallAiCliHooks,
  parseCliList
};
