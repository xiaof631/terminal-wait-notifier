const { installShellHook, normalizeShell } = require('./install-hook');

const DEFAULT_MIN_SECONDS = 0;

function autoInstallHook(options = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const installer = options.installShellHook || installShellHook;

  const decision = shouldAutoInstall(env);
  if (!decision.shouldInstall) {
    return { skipped: true, reason: decision.reason };
  }

  const shell = detectShell(env);
  if (!shell) {
    return { skipped: true, reason: 'unsupported-shell' };
  }

  try {
    const result = installer(shell, {
      minSeconds: parseMinSeconds(env)
    });

    stdout.write(`[twn] ${result.action} ${result.shell} hook in ${result.rcFile}\n`);
    stdout.write('[twn] Restart your terminal to activate automatic command completion reminders.\n');

    return {
      skipped: false,
      shell,
      result
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    stderr.write(`[twn] auto hook install skipped: ${message}\n`);
    return {
      skipped: true,
      reason: 'install-failed',
      error
    };
  }
}

function shouldAutoInstall(env = process.env) {
  if (flagEnabled(env.TWN_SKIP_AUTO_HOOK)) {
    return { shouldInstall: false, reason: 'disabled' };
  }

  const explicit = parseFlag(env.TWN_AUTO_INSTALL_HOOK);
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

function isGlobalInstall(env = process.env) {
  return env.npm_config_global === 'true' || env.npm_config_location === 'global';
}

function detectShell(env = process.env) {
  const shell = env.TWN_AUTO_HOOK_SHELL || env.SHELL || '';
  try {
    return normalizeShell(shell);
  } catch {
    return null;
  }
}

function parseMinSeconds(env = process.env) {
  const raw = env.TWN_AUTO_HOOK_MIN_SECONDS || env.TWN_MIN_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_MIN_SECONDS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MIN_SECONDS;
  return parsed;
}

function flagEnabled(value) {
  return parseFlag(value) === true;
}

function parseFlag(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

module.exports = {
  autoInstallHook,
  shouldAutoInstall,
  isGlobalInstall,
  detectShell,
  parseMinSeconds,
  parseFlag,
  DEFAULT_MIN_SECONDS
};
