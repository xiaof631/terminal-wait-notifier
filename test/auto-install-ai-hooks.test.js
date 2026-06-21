const assert = require('node:assert/strict');
const test = require('node:test');
const {
  autoInstallAiCliHooks,
  parseCliList,
  shouldAutoInstallAiCliHooks
} = require('../src/auto-install-ai-hooks');

test('auto-installs AI CLI hooks during global install', async () => {
  const calls = [];
  const output = [];
  const result = await autoInstallAiCliHooks({
    env: {
      npm_config_global: 'true'
    },
    stdout: { write: (text) => output.push(text) },
    stderr: { write: () => {} },
    installAiCliHooks: async (options) => {
      calls.push(options);
      return [{
        displayName: 'Qwen Code',
        action: 'installed',
        filePath: '/Users/test/.qwen/settings.json'
      }];
    }
  });

  assert.equal(result.skipped, false);
  assert.deepEqual(calls[0].clis, ['qwen', 'gemini', 'claude', 'qoder']);
  assert.equal(calls[0].onlyExisting, true);
  assert.equal(calls[0].skipCodex, true);
  assert.match(output.join(''), /installed Qwen Code hook/);
});

test('supports selecting AI CLIs for auto-install', async () => {
  const calls = [];
  await autoInstallAiCliHooks({
    env: {
      TWN_AUTO_AI_HOOKS: '1',
      TWN_AUTO_AI_HOOK_CLIS: 'qwen,gemini'
    },
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    installAiCliHooks: async (options) => {
      calls.push(options);
      return [];
    }
  });

  assert.deepEqual(calls[0].clis, ['qwen', 'gemini']);
});

test('skips AI CLI hook auto-install for local installs by default', () => {
  assert.deepEqual(shouldAutoInstallAiCliHooks({
    npm_config_global: 'false'
  }), {
    shouldInstall: false,
    reason: 'local-install'
  });
});

test('supports disabling AI CLI hook auto-install', () => {
  assert.deepEqual(shouldAutoInstallAiCliHooks({
    npm_config_global: 'true',
    TWN_AUTO_AI_HOOKS: '0'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });

  assert.deepEqual(shouldAutoInstallAiCliHooks({
    npm_config_global: 'true',
    TWN_SKIP_AI_HOOKS: 'yes'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });
});

test('parses comma separated CLI lists', () => {
  assert.deepEqual(parseCliList('qwen, gemini,,claude'), ['qwen', 'gemini', 'claude']);
  assert.equal(parseCliList(''), undefined);
});
