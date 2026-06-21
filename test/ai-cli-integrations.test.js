const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  JSON_SETTINGS_INTEGRATIONS,
  buildHookGroup,
  installAiCliHooks,
  installJsonSettingsHook,
  mergeHookIntoSettings,
  normalizeHookGroup,
  normalizeHookHandler,
  removeHookFromSettings,
  resolveIntegrationSettingsPath,
  settingsHomeExists,
  uninstallAiCliHooks,
  uninstallJsonSettingsHook
} = require('../src/ai-cli-integrations');

test('builds hook groups for JSON settings integrations', () => {
  assert.deepEqual(buildHookGroup(JSON_SETTINGS_INTEGRATIONS.gemini), {
    hooks: [{
      type: 'command',
      command: 'twn ai-hook --cli gemini',
      name: 'terminal-wait-notifier'
    }],
    matcher: '*'
  });
});

test('merges AI CLI hook without duplicating existing command', () => {
  const settings = {
    hooks: {
      Stop: [{
        matcher: '',
        hooks: [{
          type: 'command',
          command: 'twn ai-hook --cli qwen',
          name: 'terminal-wait-notifier'
        }]
      }]
    }
  };

  const next = mergeHookIntoSettings(settings, JSON_SETTINGS_INTEGRATIONS.qwen);

  assert.equal(next.hooks.Stop.length, 1);
  assert.equal(next.hooks.Stop[0].hooks.length, 1);
});

test('preserves existing hook fields while appending integration hook', () => {
  const settings = {
    hooks: {
      Stop: [{
        matcher: 'old',
        sequential: true,
        hooks: [{
          type: 'command',
          command: 'existing-hook',
          name: 'existing',
          timeout: 123,
          extra: { keep: true }
        }]
      }]
    }
  };

  const next = mergeHookIntoSettings(settings, JSON_SETTINGS_INTEGRATIONS.qwen);

  assert.deepEqual(next.hooks.Stop[0], settings.hooks.Stop[0]);
  assert.equal(next.hooks.Stop[1].hooks[0].command, 'twn ai-hook --cli qwen');
});

test('removes AI CLI hook from multiple groups while preserving other settings', () => {
  const settings = {
    model: 'qwen',
    hooks: {
      Stop: [
        {
          matcher: 'first',
          hooks: [
            { type: 'command', command: 'twn ai-hook --cli qwen', name: 'terminal-wait-notifier' },
            { type: 'command', command: 'existing-hook', name: 'keep' }
          ]
        },
        {
          matcher: 'second',
          hooks: [
            { type: 'command', command: 'twn ai-hook --cli qwen' }
          ]
        }
      ],
      OtherEvent: [{
        hooks: [{ type: 'command', command: 'other-event-hook' }]
      }]
    }
  };

  const result = removeHookFromSettings(settings, JSON_SETTINGS_INTEGRATIONS.qwen);

  assert.equal(result.changed, true);
  assert.equal(result.removedHooks.length, 2);
  assert.equal(result.settings.model, 'qwen');
  assert.deepEqual(result.settings.hooks.Stop, [{
    matcher: 'first',
    hooks: [{ type: 'command', command: 'existing-hook', name: 'keep' }]
  }]);
  assert.deepEqual(result.settings.hooks.OtherEvent, settings.hooks.OtherEvent);
});

test('reports not changed when AI CLI hook is absent', () => {
  const settings = {
    hooks: {
      Stop: [{
        hooks: [{ type: 'command', command: 'existing-hook' }]
      }]
    }
  };

  const result = removeHookFromSettings(settings, JSON_SETTINGS_INTEGRATIONS.claude);

  assert.equal(result.changed, false);
  assert.deepEqual(result.removedHooks, []);
  assert.deepEqual(result.settings, settings);
});

test('cleans empty AI CLI event and hooks object after removal', () => {
  const settings = {
    hooks: {
      Stop: [{
        hooks: [{ type: 'command', command: 'twn ai-hook --cli claude' }]
      }]
    }
  };

  const result = removeHookFromSettings(settings, JSON_SETTINGS_INTEGRATIONS.claude);

  assert.equal(result.changed, true);
  assert.deepEqual(result.settings, {});
});

test('normalizes hook groups by keeping valid command hook objects intact', () => {
  const group = {
    matcher: '*',
    custom: 'value',
    hooks: [
      { type: 'command', command: 'ok', timeout: 3, extra: true },
      { type: 'command' },
      null
    ]
  };

  assert.deepEqual(normalizeHookGroup(group), {
    matcher: '*',
    custom: 'value',
    hooks: [{ type: 'command', command: 'ok', timeout: 3, extra: true }]
  });

  assert.deepEqual(normalizeHookHandler({ type: 'command', command: 'ok', extra: true }), {
    type: 'command',
    command: 'ok',
    extra: true
  });
});

test('installs JSON settings hook into a user settings file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-settings-'));
  try {
    fs.mkdirSync(path.join(tmp, '.qwen'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.qwen/settings.json'), '{"model":"qwen"}\n', 'utf8');

    const result = installJsonSettingsHook(JSON_SETTINGS_INTEGRATIONS.qwen, { homeDir: tmp });
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, '.qwen/settings.json'), 'utf8'));

    assert.equal(result.action, 'updated');
    assert.equal(saved.model, 'qwen');
    assert.equal(saved.hooks.Stop[0].hooks[0].command, 'twn ai-hook --cli qwen');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports installed action when creating a new settings file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-new-settings-'));
  try {
    const result = installJsonSettingsHook(JSON_SETTINGS_INTEGRATIONS.gemini, { homeDir: tmp });
    const file = path.join(tmp, '.gemini/settings.json');

    assert.equal(result.action, 'installed');
    assert.equal(fs.existsSync(file), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uninstalls JSON settings hook without removing other hooks', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-uninstall-settings-'));
  try {
    fs.mkdirSync(path.join(tmp, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gemini/settings.json'), JSON.stringify({
      hooks: {
        AfterAgent: [{
          matcher: '*',
          hooks: [
            { type: 'command', command: 'twn ai-hook --cli gemini' },
            { type: 'command', command: 'keep-me' }
          ]
        }]
      },
      ui: 'keep'
    }), 'utf8');

    const result = uninstallJsonSettingsHook(JSON_SETTINGS_INTEGRATIONS.gemini, { homeDir: tmp });
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, '.gemini/settings.json'), 'utf8'));

    assert.equal(result.action, 'removed');
    assert.equal(result.removedHooks.length, 1);
    assert.equal(saved.ui, 'keep');
    assert.deepEqual(saved.hooks.AfterAgent[0].hooks, [{ type: 'command', command: 'keep-me' }]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('dry-run AI CLI uninstall does not write settings', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-uninstall-dry-run-'));
  try {
    const file = path.join(tmp, '.qoder/settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{ type: 'command', command: 'twn ai-hook --cli qoder' }]
        }]
      }
    }, null, 2);
    fs.writeFileSync(file, `${original}\n`, 'utf8');

    const result = uninstallJsonSettingsHook(JSON_SETTINGS_INTEGRATIONS.qoder, {
      homeDir: tmp,
      dryRun: true
    });

    assert.equal(result.action, 'removed');
    assert.equal(fs.readFileSync(file, 'utf8'), `${original}\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports not-found when uninstalling missing AI CLI settings hook', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-uninstall-missing-'));
  try {
    const result = uninstallJsonSettingsHook(JSON_SETTINGS_INTEGRATIONS.qwen, { homeDir: tmp });

    assert.equal(result.action, 'not-found');
    assert.equal(result.reason, 'missing-file');
    assert.equal(result.changed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('supports only-existing AI CLI installs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-ai-only-existing-'));
  try {
    fs.mkdirSync(path.join(tmp, '.qwen'), { recursive: true });

    const results = await installAiCliHooks({
      clis: ['qwen', 'gemini'],
      homeDir: tmp,
      onlyExisting: true
    });

    assert.equal(results[0].cli, 'qwen');
    assert.equal(results[0].action, 'installed');
    assert.equal(results[1].cli, 'gemini');
    assert.equal(results[1].action, 'skipped');
    assert.equal(results[1].reason, 'not-installed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('passes dry-run through to Codex uninstalls', async () => {
  const calls = [];

  const results = await uninstallAiCliHooks({
    clis: ['codex'],
    dryRun: true,
    uninstallCodexHook: async (options) => {
      calls.push(options);
      return {
        action: 'removed',
        dryRun: options.dryRun,
        filePath: '/Users/test/.codex/config.toml',
        removedHooks: [{ command: 'twn codex-hook' }]
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].dryRun, true);
  assert.equal(results[0].cli, 'codex');
  assert.equal(results[0].action, 'removed');
  assert.equal(results[0].dryRun, true);
});

test('passes dry-run through to Codex installs', async () => {
  const calls = [];

  const results = await installAiCliHooks({
    clis: ['codex'],
    dryRun: true,
    installCodexHook: async (options) => {
      calls.push(options);
      return {
        action: 'installed',
        dryRun: options.dryRun,
        filePath: '/Users/test/.codex/config.toml'
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].dryRun, true);
  assert.equal(results[0].cli, 'codex');
  assert.equal(results[0].dryRun, true);
});

test('resolves settings paths relative to a custom home directory', () => {
  const homeDir = '/tmp/twn-home';
  assert.equal(
    resolveIntegrationSettingsPath(JSON_SETTINGS_INTEGRATIONS.qoder, { homeDir }),
    path.join(homeDir, '.qoder/settings.json')
  );
  assert.equal(settingsHomeExists(JSON_SETTINGS_INTEGRATIONS.qoder, { homeDir }), false);
});
