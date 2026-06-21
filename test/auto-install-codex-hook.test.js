const assert = require('node:assert/strict');
const test = require('node:test');
const {
  autoInstallCodexHook,
  shouldAutoInstallCodexHook
} = require('../src/auto-install-codex-hook');

test('auto-installs Codex hook during global install', async () => {
  const calls = [];
  const output = [];
  const result = await autoInstallCodexHook({
    env: {
      npm_config_global: 'true',
      TWN_CODEX_HOOK_TIMEOUT_SECONDS: '4'
    },
    stdout: { write: (text) => output.push(text) },
    stderr: { write: () => {} },
    installCodexHook: async (options) => {
      calls.push(options);
      return {
        action: 'installed',
        filePath: '/Users/test/.codex/config.toml',
        hook: { trustStatus: 'untrusted' }
      };
    }
  });

  assert.equal(result.skipped, false);
  assert.equal(calls[0].hookCommand, 'twn codex-hook');
  assert.equal(calls[0].timeout, '4');
  assert.match(output.join(''), /installed Codex Stop hook/);
  assert.match(output.join(''), /review and trust/);
});

test('skips Codex hook auto-install for local installs by default', () => {
  assert.deepEqual(shouldAutoInstallCodexHook({
    npm_config_global: 'false'
  }), {
    shouldInstall: false,
    reason: 'local-install'
  });
});

test('supports disabling Codex hook auto-install', () => {
  assert.deepEqual(shouldAutoInstallCodexHook({
    npm_config_global: 'true',
    TWN_AUTO_CODEX_HOOK: '0'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });

  assert.deepEqual(shouldAutoInstallCodexHook({
    npm_config_global: 'true',
    TWN_SKIP_CODEX_HOOK: 'yes'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });
});
