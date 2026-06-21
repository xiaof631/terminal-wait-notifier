const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installCodexHook } = require('./codex-install-hook');

const DEFAULT_AI_CLIS = ['codex', 'qwen', 'gemini', 'claude', 'qoder'];
const JSON_SETTINGS_INTEGRATIONS = {
  qwen: {
    displayName: 'Qwen Code',
    settingsPath: '~/.qwen/settings.json',
    eventName: 'Stop',
    command: 'twn ai-hook --cli qwen',
    hook: {
      type: 'command',
      command: 'twn ai-hook --cli qwen',
      name: 'terminal-wait-notifier',
      description: 'Notify when Qwen Code finishes a turn'
    }
  },
  gemini: {
    displayName: 'Gemini CLI',
    settingsPath: '~/.gemini/settings.json',
    eventName: 'AfterAgent',
    matcher: '*',
    command: 'twn ai-hook --cli gemini',
    hook: {
      type: 'command',
      command: 'twn ai-hook --cli gemini',
      name: 'terminal-wait-notifier'
    }
  },
  claude: {
    displayName: 'Claude Code',
    settingsPath: '~/.claude/settings.json',
    eventName: 'Stop',
    matcher: '',
    command: 'twn ai-hook --cli claude',
    hook: {
      type: 'command',
      command: 'twn ai-hook --cli claude'
    }
  },
  qoder: {
    displayName: 'Qoder CLI',
    settingsPath: '~/.qoder/settings.json',
    eventName: 'Stop',
    matcher: '',
    command: 'twn ai-hook --cli qoder',
    hook: {
      type: 'command',
      command: 'twn ai-hook --cli qoder'
    }
  }
};

async function installAiCliHooks(options = {}) {
  const clis = normalizeCliList(options.clis || DEFAULT_AI_CLIS);
  const codexInstaller = options.installCodexHook || installCodexHook;
  const results = [];

  for (const cli of clis) {
    if (cli === 'codex') {
      if (options.skipCodex) continue;
      try {
        const result = await codexInstaller({
          hookCommand: options.codexHookCommand || 'twn codex-hook',
          codexCommand: options.codexCommand,
          timeout: options.codexTimeout,
          dryRun: options.dryRun,
          cwd: options.cwd,
          env: options.env
        });
        results.push({
          cli,
          displayName: 'Codex',
          action: result.action,
          filePath: result.filePath,
          hook: result.hook,
          dryRun: result.dryRun,
          warnings: result.warnings || [],
          errors: result.errors || []
        });
      } catch (error) {
        results.push(errorResult(cli, 'Codex', error));
      }
      continue;
    }

    const integration = JSON_SETTINGS_INTEGRATIONS[cli];
    if (!integration) {
      results.push({
        cli,
        displayName: cli,
        action: 'skipped',
        reason: 'unsupported'
      });
      continue;
    }

    if (options.onlyExisting && !settingsHomeExists(integration, options)) {
      results.push({
        cli,
        displayName: integration.displayName,
        action: 'skipped',
        reason: 'not-installed'
      });
      continue;
    }

    try {
      results.push(installJsonSettingsHook(integration, options));
    } catch (error) {
      results.push(errorResult(cli, integration.displayName, error));
    }
  }

  return results;
}

function installJsonSettingsHook(integration, options = {}) {
  const settingsPath = resolveIntegrationSettingsPath(integration, options);
  const existed = fs.existsSync(settingsPath);
  const existing = readJsonFile(settingsPath);
  const next = mergeHookIntoSettings(existing, integration);
  const changed = JSON.stringify(next) !== JSON.stringify(existing);

  if (!options.dryRun && changed) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return {
    cli: integrationKey(integration),
    displayName: integration.displayName,
    action: changed ? (existed ? 'updated' : 'installed') : 'unchanged',
    filePath: settingsPath,
    changed,
    dryRun: Boolean(options.dryRun)
  };
}

function mergeHookIntoSettings(settings, integration) {
  const next = clone(settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {});
  if (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks)) {
    next.hooks = {};
  }

  const eventHooks = Array.isArray(next.hooks[integration.eventName])
    ? next.hooks[integration.eventName].map(normalizeHookGroup).filter(Boolean)
    : [];

  if (!eventHooks.some((group) => group.hooks.some((hook) => hook.command === integration.command))) {
    eventHooks.push(buildHookGroup(integration));
  }

  next.hooks[integration.eventName] = eventHooks;
  return next;
}

function buildHookGroup(integration) {
  const group = {
    hooks: [clone(integration.hook)]
  };

  if (integration.matcher !== undefined) {
    group.matcher = integration.matcher;
  }

  return group;
}

function normalizeHookGroup(group) {
  if (!group || typeof group !== 'object') return null;
  const hooks = Array.isArray(group.hooks)
    ? group.hooks.map(normalizeHookHandler).filter(Boolean)
    : [];
  if (hooks.length === 0) return null;

  const next = clone(group);
  next.hooks = hooks;
  return next;
}

function normalizeHookHandler(hook) {
  if (!hook || typeof hook !== 'object') return null;
  if (typeof hook.type !== 'string' || typeof hook.command !== 'string') return null;
  return clone(hook);
}

function settingsHomeExists(integration, options = {}) {
  const settingsPath = resolveIntegrationSettingsPath(integration, options);
  return fs.existsSync(settingsPath) || fs.existsSync(path.dirname(settingsPath));
}

function resolveIntegrationSettingsPath(integration, options = {}) {
  const overrides = options.settingsPaths || {};
  if (overrides[integrationKey(integration)]) {
    return expandHome(overrides[integrationKey(integration)], options.homeDir);
  }
  return expandHome(integration.settingsPath, options.homeDir);
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function normalizeCliList(clis) {
  const list = Array.isArray(clis) ? clis : [clis];
  return [...new Set(list.map((cli) => String(cli).trim().toLowerCase()).filter(Boolean))];
}

function integrationKey(integration) {
  for (const [key, value] of Object.entries(JSON_SETTINGS_INTEGRATIONS)) {
    if (value === integration) return key;
  }
  return integration.displayName.toLowerCase();
}

function expandHome(file, homeDir = os.homedir()) {
  if (file === '~') return homeDir;
  if (file.startsWith('~/')) return path.join(homeDir, file.slice(2));
  return path.resolve(file);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function errorResult(cli, displayName, error) {
  return {
    cli,
    displayName,
    action: 'failed',
    error: error && error.message ? error.message : String(error)
  };
}

module.exports = {
  DEFAULT_AI_CLIS,
  JSON_SETTINGS_INTEGRATIONS,
  installAiCliHooks,
  installJsonSettingsHook,
  mergeHookIntoSettings,
  buildHookGroup,
  normalizeHookGroup,
  normalizeHookHandler,
  normalizeCliList,
  settingsHomeExists,
  resolveIntegrationSettingsPath,
  expandHome
};
