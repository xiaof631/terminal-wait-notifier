const { spawn } = require('node:child_process');

const DEFAULT_CODEX_COMMAND = 'codex';
const DEFAULT_CODEX_HOOK_COMMAND = 'twn codex-hook';
const DEFAULT_CODEX_HOOK_TIMEOUT_SECONDS = 5;
const DEFAULT_CODEX_HOOK_STATUS_MESSAGE = 'Notify Codex completion';
const CODEX_STOP_HOOK_KEY_PATH = 'hooks.Stop';

async function installCodexHook(options = {}) {
  return writeCodexHookWithAppServer({
    codexCommand: options.codexCommand || DEFAULT_CODEX_COMMAND,
    hookCommand: options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND,
    timeout: options.timeout,
    statusMessage: options.statusMessage,
    dryRun: options.dryRun,
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    spawnFn: options.spawnFn || spawn,
    rpcTimeoutMs: options.rpcTimeoutMs
  });
}

async function uninstallCodexHook(options = {}) {
  return removeCodexHookWithAppServer({
    codexCommand: options.codexCommand || DEFAULT_CODEX_COMMAND,
    hookCommand: options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND,
    dryRun: options.dryRun,
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    spawnFn: options.spawnFn || spawn,
    rpcTimeoutMs: options.rpcTimeoutMs
  });
}

function buildCodexHookHandler(options = {}) {
  return {
    type: 'command',
    command: options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND,
    async: false,
    timeout: normalizeTimeout(options.timeout),
    statusMessage: options.statusMessage || DEFAULT_CODEX_HOOK_STATUS_MESSAGE
  };
}

function buildCodexHookGroup(options = {}) {
  const group = {
    hooks: [buildCodexHookHandler(options)]
  };

  if (typeof options.matcher === 'string' && options.matcher.trim()) {
    group.matcher = options.matcher;
  }

  return group;
}

function mergeCodexStopHooks(existingStopHooks, options = {}) {
  const groups = Array.isArray(existingStopHooks)
    ? existingStopHooks.map(sanitizeHookGroup).filter(Boolean)
    : [];
  const command = options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND;

  if (!groups.some((group) => group.hooks.some((hook) => hook.command === command))) {
    groups.push(buildCodexHookGroup(options));
  }

  return groups;
}

function removeCodexStopHooks(existingStopHooks, options = {}) {
  const groups = Array.isArray(existingStopHooks)
    ? existingStopHooks.map(sanitizeHookGroup).filter(Boolean)
    : [];
  const command = options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND;
  const removedHooks = [];
  const nextGroups = [];

  for (const group of groups) {
    const remainingHooks = [];
    for (const hook of group.hooks) {
      if (hook.command === command) {
        removedHooks.push(hook);
      } else {
        remainingHooks.push(hook);
      }
    }

    if (remainingHooks.length > 0) {
      nextGroups.push({
        ...group,
        hooks: remainingHooks
      });
    }
  }

  return {
    stopHooks: nextGroups,
    removedHooks,
    changed: removedHooks.length > 0
  };
}

function getUserStopHooks(configReadResponse) {
  const layers = configReadResponse && Array.isArray(configReadResponse.layers)
    ? configReadResponse.layers
    : [];
  const userLayer = layers.find((layer) => layer && layer.name && layer.name.type === 'user');
  return userLayer?.config?.hooks?.Stop || [];
}

function sanitizeHookGroup(group) {
  if (!group || typeof group !== 'object') return null;

  const hooks = Array.isArray(group.hooks)
    ? group.hooks.map(sanitizeHookHandler).filter(Boolean)
    : [];
  if (hooks.length === 0) return null;

  const sanitized = { hooks };
  if (typeof group.matcher === 'string' && group.matcher.trim()) {
    sanitized.matcher = group.matcher;
  }
  return sanitized;
}

function sanitizeHookHandler(handler) {
  if (!handler || typeof handler !== 'object') return null;
  if (handler.type === 'command' && typeof handler.command !== 'string') return null;

  const sanitized = {};
  copyString(handler, sanitized, 'type');
  copyString(handler, sanitized, 'command');
  copyString(handler, sanitized, 'commandWindows');
  copyString(handler, sanitized, 'statusMessage');

  if (typeof handler.async === 'boolean') {
    sanitized.async = handler.async;
  }
  if (Number.isFinite(handler.timeout)) {
    sanitized.timeout = handler.timeout;
  } else if (Number.isFinite(handler.timeoutSec)) {
    sanitized.timeout = handler.timeoutSec;
  }

  return sanitized.type ? sanitized : null;
}

function copyString(source, target, key) {
  if (typeof source[key] === 'string') {
    target[key] = source[key];
  }
}

function normalizeTimeout(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_CODEX_HOOK_TIMEOUT_SECONDS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CODEX_HOOK_TIMEOUT_SECONDS;
  }
  return parsed;
}

function writeCodexHookWithAppServer(options = {}) {
  const codexCommand = options.codexCommand || DEFAULT_CODEX_COMMAND;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const spawnFn = options.spawnFn || spawn;
  const rpcTimeoutMs = options.rpcTimeoutMs || 8000;
  const hookOptions = {
    hookCommand: options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND,
    timeout: options.timeout,
    statusMessage: options.statusMessage
  };
  const dryRun = Boolean(options.dryRun);

  return new Promise((resolve, reject) => {
    const child = spawnFn(codexCommand, ['app-server', '--stdio'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrOutput = '';
    let configFilePath;
    let action = 'installed';
    let settled = false;
    let initialized = false;
    let userStopHooks = [];
    let sanitizedUserStopHooks = [];
    let nextStopHooks = [];

    const timer = setTimeout(() => {
      finish(new Error(`Timed out while configuring Codex hook after ${rpcTimeoutMs}ms`));
    }, rpcTimeoutMs);

    child.on('error', finish);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish(new Error(`Codex app-server exited with code ${code}`));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrOutput += String(chunk);
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          handleRpcMessage(line);
        }
      }
    });

    send(1, 'initialize', {
      clientInfo: {
        name: 'terminal-wait-notifier',
        version: require('../package.json').version
      },
      capabilities: {
        experimentalApi: true
      }
    });

    function handleRpcMessage(line) {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.error) {
        finish(new Error(message.error.message || 'Codex app-server returned an error'));
        return;
      }

      if (message.id === 1) {
        initialized = true;
        send(2, 'config/read', { cwd, includeLayers: true });
        return;
      }

      if (message.id === 2) {
        userStopHooks = getUserStopHooks(message.result);
        sanitizedUserStopHooks = normalizeStopHooks(userStopHooks);
        nextStopHooks = mergeCodexStopHooks(userStopHooks, hookOptions);
        if (JSON.stringify(nextStopHooks) === JSON.stringify(sanitizedUserStopHooks)) {
          action = 'unchanged';
          send(4, 'hooks/list', { cwds: [cwd] });
          return;
        }

        action = sanitizedUserStopHooks.length > 0 ? 'updated' : 'installed';
        if (dryRun) {
          finish(null, {
            action,
            filePath: undefined,
            hook: buildCodexHookHandler(hookOptions),
            warnings: [],
            errors: [],
            stderr: stderrOutput.trim(),
            initialized,
            dryRun: true,
            keyPath: CODEX_STOP_HOOK_KEY_PATH,
            value: nextStopHooks
          });
          return;
        }

        send(3, 'config/batchWrite', {
          reloadUserConfig: true,
          edits: [{
            keyPath: CODEX_STOP_HOOK_KEY_PATH,
            mergeStrategy: 'upsert',
            value: nextStopHooks
          }]
        });
        return;
      }

      if (message.id === 3) {
        configFilePath = message.result && message.result.filePath;
        send(4, 'hooks/list', { cwds: [cwd] });
        return;
      }

      if (message.id === 4) {
        finish(null, buildInstallResult(message.result));
      }
    }

    function buildInstallResult(hooksListResult) {
      const entry = hooksListResult && Array.isArray(hooksListResult.data)
        ? hooksListResult.data[0]
        : undefined;
      const hooks = entry && Array.isArray(entry.hooks) ? entry.hooks : [];
      const hook = hooks.find((item) => item.command === hookOptions.hookCommand);

      return {
        action,
        filePath: configFilePath || hook?.sourcePath,
        hook,
        warnings: entry?.warnings || [],
        errors: entry?.errors || [],
        stderr: stderrOutput.trim(),
        initialized,
        dryRun
      };
    }

    function send(id, method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    }

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();

      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    }
  });
}

function removeCodexHookWithAppServer(options = {}) {
  const codexCommand = options.codexCommand || DEFAULT_CODEX_COMMAND;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const spawnFn = options.spawnFn || spawn;
  const rpcTimeoutMs = options.rpcTimeoutMs || 8000;
  const hookCommand = options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND;
  const dryRun = Boolean(options.dryRun);

  return new Promise((resolve, reject) => {
    const child = spawnFn(codexCommand, ['app-server', '--stdio'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrOutput = '';
    let configFilePath;
    let userConfigPath;
    let action = 'not-found';
    let settled = false;
    let initialized = false;
    let removal = {
      stopHooks: [],
      removedHooks: [],
      changed: false
    };

    const timer = setTimeout(() => {
      finish(new Error(`Timed out while removing Codex hook after ${rpcTimeoutMs}ms`));
    }, rpcTimeoutMs);

    child.on('error', finish);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish(new Error(`Codex app-server exited with code ${code}`));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrOutput += String(chunk);
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          handleRpcMessage(line);
        }
      }
    });

    send(1, 'initialize', {
      clientInfo: {
        name: 'terminal-wait-notifier',
        version: require('../package.json').version
      },
      capabilities: {
        experimentalApi: true
      }
    });

    function handleRpcMessage(line) {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.error) {
        finish(new Error(message.error.message || 'Codex app-server returned an error'));
        return;
      }

      if (message.id === 1) {
        initialized = true;
        send(2, 'config/read', { cwd, includeLayers: true });
        return;
      }

      if (message.id === 2) {
        userConfigPath = findUserConfigPath(message.result);
        removal = removeCodexStopHooks(getUserStopHooks(message.result), { hookCommand });

        if (!removal.changed) {
          finish(null, buildRemovalResult());
          return;
        }

        action = 'removed';
        if (dryRun) {
          finish(null, buildRemovalResult());
          return;
        }

        send(3, 'config/batchWrite', {
          reloadUserConfig: true,
          edits: [{
            keyPath: CODEX_STOP_HOOK_KEY_PATH,
            mergeStrategy: 'upsert',
            value: removal.stopHooks
          }]
        });
        return;
      }

      if (message.id === 3) {
        configFilePath = message.result && message.result.filePath;
        send(4, 'hooks/list', { cwds: [cwd] });
        return;
      }

      if (message.id === 4) {
        finish(null, buildRemovalResult(message.result));
      }
    }

    function buildRemovalResult(hooksListResult) {
      const entry = hooksListResult && Array.isArray(hooksListResult.data)
        ? hooksListResult.data[0]
        : undefined;

      return {
        action,
        filePath: configFilePath || userConfigPath,
        hookCommand,
        removedHooks: removal.removedHooks,
        warnings: entry?.warnings || [],
        errors: entry?.errors || [],
        stderr: stderrOutput.trim(),
        initialized,
        dryRun,
        keyPath: CODEX_STOP_HOOK_KEY_PATH,
        value: removal.stopHooks
      };
    }

    function send(id, method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    }

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();

      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    }
  });
}

function normalizeStopHooks(stopHooks) {
  return Array.isArray(stopHooks)
    ? stopHooks.map(sanitizeHookGroup).filter(Boolean)
    : [];
}

function findUserConfigPath(configReadResponse) {
  const layers = configReadResponse && Array.isArray(configReadResponse.layers)
    ? configReadResponse.layers
    : [];
  const userLayer = layers.find((layer) => layer && layer.name && layer.name.type === 'user');
  return userLayer?.filePath || userLayer?.path || userLayer?.name?.filePath || userLayer?.name?.path;
}

module.exports = {
  DEFAULT_CODEX_COMMAND,
  DEFAULT_CODEX_HOOK_COMMAND,
  DEFAULT_CODEX_HOOK_TIMEOUT_SECONDS,
  DEFAULT_CODEX_HOOK_STATUS_MESSAGE,
  CODEX_STOP_HOOK_KEY_PATH,
  installCodexHook,
  uninstallCodexHook,
  writeCodexHookWithAppServer,
  removeCodexHookWithAppServer,
  buildCodexHookHandler,
  buildCodexHookGroup,
  mergeCodexStopHooks,
  removeCodexStopHooks,
  normalizeStopHooks,
  getUserStopHooks,
  sanitizeHookGroup,
  sanitizeHookHandler,
  normalizeTimeout
};
