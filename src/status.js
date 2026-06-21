const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  BLOCK_START,
  BLOCK_END,
  resolveRcFile,
  normalizeShell
} = require('./install-hook');
const {
  DEFAULT_CODEX_COMMAND,
  DEFAULT_CODEX_HOOK_COMMAND,
  CODEX_STOP_HOOK_KEY_PATH,
  getUserStopHooks,
  normalizeStopHooks
} = require('./codex-install-hook');
const {
  JSON_SETTINGS_INTEGRATIONS,
  normalizeCliList,
  normalizeHookGroup,
  resolveIntegrationSettingsPath
} = require('./ai-cli-integrations');

const SUPPORTED_SHELLS = ['zsh', 'bash', 'fish'];
const JSON_AI_CLIS = Object.keys(JSON_SETTINGS_INTEGRATIONS);

async function collectStatus(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const cwd = options.cwd || process.cwd();
  const shells = normalizeShellList(options.shells || SUPPORTED_SHELLS);
  const aiCliNames = normalizeCliList(options.clis || JSON_AI_CLIS)
    .filter((cli) => JSON_SETTINGS_INTEGRATIONS[cli]);

  const shellHooks = shells.map((shell) => inspectShellHook(shell, {
    ...options,
    env,
    platform,
    homeDir
  }));

  const codex = options.skipCodex
    ? skippedCodexStatus(options)
    : await inspectCodexHook({
      ...options,
      env,
      platform,
      homeDir,
      cwd
    });

  const aiClis = aiCliNames.map((cli) => inspectJsonSettingsHook(cli, JSON_SETTINGS_INTEGRATIONS[cli], {
    ...options,
    homeDir
  }));

  const status = {
    version: require('../package.json').version,
    generatedAt: new Date().toISOString(),
    cwd,
    homeDir,
    platform,
    shell: {
      current: guessShell(env, platform),
      hooks: shellHooks
    },
    codex,
    aiClis,
    notifications: inspectNotificationConfig({ env, platform }),
    warnings: [],
    errors: []
  };

  status.warnings = collectMessages(status, 'warnings');
  status.errors = collectMessages(status, 'errors');
  return status;
}

async function collectDoctor(options = {}) {
  const status = options.status || await collectStatus(options);
  return {
    generatedAt: new Date().toISOString(),
    status,
    suggestions: buildDoctorSuggestions(status)
  };
}

function inspectShellHook(shell, options = {}) {
  const warnings = [];
  const errors = [];
  let normalizedShell;

  try {
    normalizedShell = normalizeShell(shell);
  } catch (error) {
    return {
      shell,
      filePath: undefined,
      installed: false,
      status: 'unsupported-shell',
      checked: false,
      expectedCommand: undefined,
      foundCommands: [],
      warnings,
      errors: [formatError(error)]
    };
  }

  const filePath = resolveRcFile(normalizedShell, options.rcFiles?.[normalizedShell], options);
  const expectedCommand = `twn hook ${normalizedShell}`;
  const result = {
    shell: normalizedShell,
    filePath,
    installed: false,
    status: 'missing-file',
    checked: true,
    expectedCommand,
    foundCommands: [],
    warnings,
    errors
  };

  if (!fs.existsSync(filePath)) {
    warnings.push(`Shell rc file does not exist: ${filePath}`);
    return result;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const block = extractManagedBlock(content);

  if (!block) {
    result.status = 'missing-hook';
    warnings.push(`terminal-wait-notifier managed block was not found in ${filePath}`);
    return result;
  }

  if (block.partial) {
    result.status = 'invalid-managed-block';
    errors.push(`Managed block markers are incomplete in ${filePath}`);
    return result;
  }

  result.foundCommands = extractShellHookCommands(block.content);
  if (result.foundCommands.some((command) => command.includes(expectedCommand))) {
    result.installed = true;
    result.status = 'installed';
    return result;
  }

  result.status = 'command-mismatch';
  if (result.foundCommands.length > 0) {
    warnings.push(`Expected ${expectedCommand}, but found: ${result.foundCommands.join(', ')}`);
  } else {
    warnings.push(`Managed block exists but no ${expectedCommand} command was found`);
  }
  return result;
}

async function inspectCodexHook(options = {}) {
  const codexCommand = options.codexCommand || DEFAULT_CODEX_COMMAND;
  const hookCommand = options.codexHookCommand || DEFAULT_CODEX_HOOK_COMMAND;
  const homeDir = options.homeDir || os.homedir();
  const filePath = path.join(homeDir, '.codex', 'config.toml');
  const base = {
    cli: 'codex',
    displayName: 'Codex',
    filePath,
    installed: false,
    status: 'unavailable',
    checked: true,
    eventName: 'Stop',
    keyPath: CODEX_STOP_HOOK_KEY_PATH,
    codexCommand,
    expectedCommand: hookCommand,
    hook: undefined,
    warnings: [],
    errors: []
  };

  try {
    const result = await readCodexHookStatusWithAppServer({
      codexCommand,
      hookCommand,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      spawnFn: options.spawnFn || spawn,
      rpcTimeoutMs: options.rpcTimeoutMs,
      fallbackFilePath: filePath
    });
    return result;
  } catch (error) {
    base.warnings.push(`Unable to read Codex app-server: ${formatError(error)}`);
    return base;
  }
}

function readCodexHookStatusWithAppServer(options = {}) {
  const codexCommand = options.codexCommand || DEFAULT_CODEX_COMMAND;
  const hookCommand = options.hookCommand || DEFAULT_CODEX_HOOK_COMMAND;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const spawnFn = options.spawnFn || spawn;
  const rpcTimeoutMs = options.rpcTimeoutMs || 2500;
  const fallbackFilePath = options.fallbackFilePath || path.join(os.homedir(), '.codex', 'config.toml');

  return new Promise((resolve, reject) => {
    const child = spawnFn(codexCommand, ['app-server', '--stdio'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrOutput = '';
    let settled = false;
    let initialized = false;
    let userStopHooks = [];
    let userConfigPath;

    const timer = setTimeout(() => {
      finish(new Error(`Timed out while reading Codex hook status after ${rpcTimeoutMs}ms`));
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
        userConfigPath = findUserConfigPath(message.result);
        send(3, 'hooks/list', { cwds: [cwd] });
        return;
      }

      if (message.id === 3) {
        finish(null, buildCodexStatus(message.result));
      }
    }

    function buildCodexStatus(hooksListResult) {
      const normalizedUserStopHooks = normalizeStopHooks(userStopHooks);
      const userHook = findHookByCommand(normalizedUserStopHooks, hookCommand);
      const entry = hooksListResult && Array.isArray(hooksListResult.data)
        ? hooksListResult.data[0]
        : undefined;
      const listedHooks = entry && Array.isArray(entry.hooks) ? entry.hooks : [];
      const listedHook = listedHooks.find((hook) => hook.command === hookCommand);
      const installed = Boolean(userHook || listedHook);
      const warnings = [...(entry?.warnings || [])];
      const errors = [...(entry?.errors || [])];

      if (!installed) {
        const foundCommands = unique([
          ...flattenHookCommands(normalizedUserStopHooks),
          ...listedHooks.map((hook) => hook.command).filter(Boolean)
        ]);
        if (foundCommands.length > 0) {
          warnings.push(`Expected ${hookCommand}, but found: ${foundCommands.join(', ')}`);
        } else {
          warnings.push(`Codex Stop hook is not installed at ${CODEX_STOP_HOOK_KEY_PATH}`);
        }
      }

      return {
        cli: 'codex',
        displayName: 'Codex',
        filePath: listedHook?.sourcePath || userConfigPath || fallbackFilePath,
        installed,
        status: installed ? 'installed' : 'missing-hook',
        checked: true,
        eventName: 'Stop',
        keyPath: CODEX_STOP_HOOK_KEY_PATH,
        codexCommand,
        expectedCommand: hookCommand,
        hook: listedHook || userHook,
        trustStatus: listedHook?.trustStatus,
        stderr: stderrOutput.trim(),
        initialized,
        warnings,
        errors
      };
    }

    function send(id, method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    }

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
      if (error && typeof child.kill === 'function') {
        child.kill();
      }

      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    }
  });
}

function inspectJsonSettingsHook(cli, integration, options = {}) {
  const filePath = resolveIntegrationSettingsPath(integration, options);
  const warnings = [];
  const errors = [];
  const result = {
    cli,
    displayName: integration.displayName,
    filePath,
    installed: false,
    status: 'missing-file',
    checked: true,
    eventName: integration.eventName,
    expectedCommand: integration.command,
    foundCommands: [],
    warnings,
    errors
  };

  if (!fs.existsSync(filePath)) {
    warnings.push(`${integration.displayName} settings file does not exist: ${filePath}`);
    return result;
  }

  let settings;
  try {
    settings = readJsonObject(filePath);
  } catch (error) {
    result.status = 'invalid-json';
    errors.push(`${integration.displayName} settings JSON is invalid: ${formatError(error)}`);
    return result;
  }

  const eventHooks = Array.isArray(settings.hooks?.[integration.eventName])
    ? settings.hooks[integration.eventName].map(normalizeHookGroup).filter(Boolean)
    : [];

  result.foundCommands = flattenHookCommands(eventHooks);
  if (result.foundCommands.includes(integration.command)) {
    result.installed = true;
    result.status = 'installed';
    return result;
  }

  if (result.foundCommands.length > 0) {
    result.status = 'command-mismatch';
    warnings.push(`Expected ${integration.command}, but found: ${result.foundCommands.join(', ')}`);
    return result;
  }

  result.status = 'missing-hook';
  warnings.push(`${integration.displayName} ${integration.eventName} hook is missing`);
  return result;
}

function buildDoctorSuggestions(status) {
  const suggestions = [];
  const currentShell = status.shell.current;
  const currentShellHook = status.shell.hooks.find((hook) => hook.shell === currentShell);
  const installedShellHooks = status.shell.hooks.filter((hook) => hook.installed);

  for (const hook of status.shell.hooks) {
    if (hook.status === 'invalid-managed-block' || hook.status === 'command-mismatch') {
      suggestions.push({
        id: `fix-shell-${hook.shell}`,
        level: 'warning',
        message: `Reinstall the ${hook.shell} shell hook so the managed block uses the expected command.`,
        command: `twn install-hook ${hook.shell}`
      });
    }
  }

  if (installedShellHooks.length === 0) {
    const shell = SUPPORTED_SHELLS.includes(currentShell) ? currentShell : 'zsh';
    suggestions.push({
      id: 'install-shell-hook',
      level: 'warning',
      message: `Install a shell hook to get completion notifications for normal terminal commands.`,
      command: `twn install-hook ${shell}`
    });
  } else if (currentShellHook?.installed) {
    suggestions.push({
      id: 'reload-shell',
      level: 'info',
      message: `Restart the terminal or reload ${currentShellHook.filePath} so the shell hook is active in existing windows.`,
      command: sourceCommand(currentShellHook)
    });
  }

  if (status.codex.status === 'unavailable') {
    suggestions.push({
      id: 'codex-unavailable',
      level: 'info',
      message: 'If you use Codex, make sure the Codex CLI is installed and then install the Stop hook.',
      command: 'twn install-codex-hook'
    });
  } else if (!status.codex.installed) {
    suggestions.push({
      id: 'install-codex-hook',
      level: 'warning',
      message: 'Install the Codex Stop hook to get notified when an interactive Codex turn finishes.',
      command: 'twn install-codex-hook'
    });
  } else if (status.codex.trustStatus && !['trusted', 'managed'].includes(status.codex.trustStatus)) {
    suggestions.push({
      id: 'trust-codex-hook',
      level: 'warning',
      message: 'Open Codex and review/trust the terminal-wait-notifier Stop hook before expecting it to run.'
    });
  }

  const invalidJsonHooks = status.aiClis.filter((item) => item.status === 'invalid-json');
  for (const item of invalidJsonHooks) {
    suggestions.push({
      id: `fix-${item.cli}-json`,
      level: 'error',
      message: `Fix invalid JSON in ${item.filePath}, then rerun AI CLI hook installation.`,
      command: `twn install-ai-hooks --cli ${item.cli}`
    });
  }

  if (status.aiClis.some((item) => ['missing-hook', 'command-mismatch'].includes(item.status))) {
    suggestions.push({
      id: 'install-ai-hooks',
      level: 'info',
      message: 'Install or refresh AI CLI hooks for existing Qwen/Gemini/Claude/Qoder settings directories.',
      command: 'twn install-ai-hooks --only-existing'
    });
  }

  if (status.platform === 'darwin') {
    suggestions.push({
      id: 'macos-notification-permission',
      level: 'info',
      message: 'If sound works but banners are unreliable, check macOS Notification settings for osascript, Script Editor, and your terminal app; use --alert or TWN_ALERT=1 for a stronger popup.'
    });
  }

  if (!status.notifications.webhookUrlConfigured) {
    suggestions.push({
      id: 'set-webhook-url',
      level: 'info',
      message: 'Set TWN_WEBHOOK_URL if you want remote or mobile push notifications in addition to local desktop alerts.',
      command: 'export TWN_WEBHOOK_URL="https://example.com/webhook"'
    });
  }

  return dedupeSuggestions(suggestions);
}

function formatStatus(status) {
  const lines = [
    'terminal-wait-notifier status',
    '',
    `Shell hooks (current: ${status.shell.current || 'unknown'}):`
  ];

  for (const hook of status.shell.hooks) {
    lines.push(`  ${formatState(hook)} ${hook.shell}: ${hook.status} (${hook.filePath || 'unknown path'})`);
    appendItemMessages(lines, hook);
  }

  lines.push('', 'Codex hook:');
  lines.push(`  ${formatState(status.codex)} ${status.codex.displayName}: ${status.codex.status} (${status.codex.filePath || status.codex.codexCommand})`);
  appendItemMessages(lines, status.codex);

  lines.push('', 'AI CLI hooks:');
  for (const item of status.aiClis) {
    lines.push(`  ${formatState(item)} ${item.displayName}: ${item.status} (${item.filePath})`);
    appendItemMessages(lines, item);
  }

  lines.push('', 'Notifications:');
  lines.push(`  desktop: ${status.notifications.desktopEnabled ? 'enabled' : 'disabled'}`);
  lines.push(`  webhook: ${status.notifications.webhookUrlConfigured ? 'configured' : 'not configured'}`);
  lines.push(`  sound: ${status.notifications.soundConfigured ? status.notifications.sound : 'default/off'}`);
  lines.push(`  alert: ${status.notifications.alertEnabled ? 'enabled' : 'disabled'}`);

  return `${lines.join('\n')}\n`;
}

function formatDoctor(doctor) {
  const { status, suggestions } = doctor;
  const shellInstalled = status.shell.hooks.filter((hook) => hook.installed).length;
  const aiInstalled = status.aiClis.filter((item) => item.installed).length;
  const lines = [
    'terminal-wait-notifier doctor',
    '',
    'Summary:',
    `  shell hooks: ${shellInstalled}/${status.shell.hooks.length} installed`,
    `  codex hook: ${status.codex.status}`,
    `  AI CLI hooks: ${aiInstalled}/${status.aiClis.length} installed`,
    '',
    'Suggestions:'
  ];

  if (suggestions.length === 0) {
    lines.push('  No action needed.');
  } else {
    suggestions.forEach((suggestion, index) => {
      lines.push(`  ${index + 1}. [${suggestion.level}] ${suggestion.message}`);
      if (suggestion.command) {
        lines.push(`     ${suggestion.command}`);
      }
    });
  }

  return `${lines.join('\n')}\n`;
}

function inspectNotificationConfig({ env, platform }) {
  const webhookUrlConfigured = Boolean(env.TWN_WEBHOOK_URL);
  const desktopEnabled = env.TWN_DESKTOP !== '0';
  const alertEnabled = env.TWN_ALERT === '1';
  const soundConfigured = Boolean(env.TWN_SOUND && env.TWN_SOUND !== '0');

  return {
    platform,
    desktopEnabled,
    webhookUrlConfigured,
    soundConfigured,
    sound: soundConfigured ? env.TWN_SOUND : undefined,
    alertEnabled
  };
}

function collectMessages(status, key) {
  const messages = [];
  for (const hook of status.shell.hooks) {
    pushMessages(messages, `shell:${hook.shell}`, hook[key]);
  }
  pushMessages(messages, 'codex', status.codex[key]);
  for (const item of status.aiClis) {
    pushMessages(messages, item.cli, item[key]);
  }
  return messages;
}

function pushMessages(target, source, messages) {
  for (const message of messages || []) {
    target.push({ source, message: formatError(message) });
  }
}

function extractManagedBlock(content) {
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);

  if (start === -1 && end === -1) return null;
  if (start === -1 || end === -1 || end < start) {
    return { partial: true, content: '' };
  }

  return {
    partial: false,
    content: content.slice(start, end + BLOCK_END.length)
  };
}

function extractShellHookCommands(block) {
  const commands = [];
  const pattern = /\btwn\s+hook\s+(zsh|bash|fish)\b[^\n)"']*/g;
  let match;

  while ((match = pattern.exec(block))) {
    commands.push(match[0].trim());
  }

  return unique(commands);
}

function flattenHookCommands(groups) {
  const commands = [];
  for (const group of groups || []) {
    for (const hook of group.hooks || []) {
      if (typeof hook.command === 'string') {
        commands.push(hook.command);
      }
    }
  }
  return unique(commands);
}

function findHookByCommand(groups, command) {
  for (const group of groups || []) {
    for (const hook of group.hooks || []) {
      if (hook.command === command) {
        return hook;
      }
    }
  }
  return undefined;
}

function findUserConfigPath(configReadResponse) {
  const layers = configReadResponse && Array.isArray(configReadResponse.layers)
    ? configReadResponse.layers
    : [];
  const userLayer = layers.find((layer) => layer && layer.name && layer.name.type === 'user');
  return userLayer?.filePath || userLayer?.path || userLayer?.name?.filePath || userLayer?.name?.path;
}

function readJsonObject(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Settings root must be a JSON object');
  }
  return parsed;
}

function skippedCodexStatus(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  return {
    cli: 'codex',
    displayName: 'Codex',
    filePath: path.join(homeDir, '.codex', 'config.toml'),
    installed: false,
    status: 'skipped',
    checked: false,
    eventName: 'Stop',
    keyPath: CODEX_STOP_HOOK_KEY_PATH,
    codexCommand: options.codexCommand || DEFAULT_CODEX_COMMAND,
    expectedCommand: options.codexHookCommand || DEFAULT_CODEX_HOOK_COMMAND,
    hook: undefined,
    warnings: [],
    errors: []
  };
}

function normalizeShellList(shells) {
  const list = Array.isArray(shells) ? shells : [shells];
  return [...new Set(list.map((shell) => String(shell).trim()).filter(Boolean))];
}

function guessShell(env = process.env, platform = process.platform) {
  const shell = env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return platform === 'win32' ? 'powershell' : 'unknown';
}

function sourceCommand(hook) {
  if (!hook || !hook.filePath) return undefined;
  return `source ${hook.filePath}`;
}

function dedupeSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.id)) return false;
    seen.add(suggestion.id);
    return true;
  });
}

function appendItemMessages(lines, item) {
  for (const error of item.errors || []) {
    lines.push(`    error: ${formatError(error)}`);
  }
  for (const warning of item.warnings || []) {
    lines.push(`    warning: ${formatError(warning)}`);
  }
}

function formatState(item) {
  if (item.errors && item.errors.length > 0) return '[error]';
  if (item.installed) return '[ok]';
  if (item.status === 'skipped') return '[skip]';
  return '[warn]';
}

function formatError(error) {
  return error && error.message ? error.message : String(error);
}

function unique(values) {
  return [...new Set(values)];
}

module.exports = {
  SUPPORTED_SHELLS,
  collectStatus,
  collectDoctor,
  inspectShellHook,
  inspectJsonSettingsHook,
  inspectCodexHook,
  readCodexHookStatusWithAppServer,
  buildDoctorSuggestions,
  formatStatus,
  formatDoctor
};
