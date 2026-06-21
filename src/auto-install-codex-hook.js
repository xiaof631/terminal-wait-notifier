const { installCodexHook } = require('./codex-install-hook');
const { isGlobalInstall, parseFlag } = require('./auto-install-hook');

async function autoInstallCodexHook(options = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const installer = options.installCodexHook || installCodexHook;

  const decision = shouldAutoInstallCodexHook(env);
  if (!decision.shouldInstall) {
    return { skipped: true, reason: decision.reason };
  }

  try {
    const result = await installer({
      codexCommand: env.TWN_CODEX_COMMAND || 'codex',
      hookCommand: env.TWN_CODEX_HOOK_COMMAND || 'twn codex-hook',
      timeout: env.TWN_CODEX_HOOK_TIMEOUT_SECONDS,
      env
    });

    stdout.write(`[twn] ${result.action} Codex Stop hook in ${result.filePath || 'Codex config'}\n`);
    if (result.hook && result.hook.trustStatus && !['trusted', 'managed'].includes(result.hook.trustStatus)) {
      stdout.write('[twn] Codex will ask you to review and trust this hook before it can run.\n');
    }

    return {
      skipped: false,
      result
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    stderr.write(`[twn] auto Codex hook install skipped: ${message}\n`);
    return {
      skipped: true,
      reason: 'install-failed',
      error
    };
  }
}

function shouldAutoInstallCodexHook(env = process.env) {
  if (flagEnabled(env.TWN_SKIP_AUTO_HOOK) || flagEnabled(env.TWN_SKIP_CODEX_HOOK)) {
    return { shouldInstall: false, reason: 'disabled' };
  }

  const explicit = parseFlag(env.TWN_AUTO_CODEX_HOOK);
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

function flagEnabled(value) {
  return parseFlag(value) === true;
}

module.exports = {
  autoInstallCodexHook,
  shouldAutoInstallCodexHook
};
