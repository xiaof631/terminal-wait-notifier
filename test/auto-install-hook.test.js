const assert = require('node:assert/strict');
const test = require('node:test');
const {
  autoInstallHook,
  detectShell,
  parseFlag,
  parseMinSeconds,
  shouldAutoInstall
} = require('../src/auto-install-hook');

test('auto-installs hook during global install', () => {
  const calls = [];
  const output = [];
  const result = autoInstallHook({
    env: {
      npm_config_global: 'true',
      SHELL: '/bin/zsh'
    },
    stdout: { write: (text) => output.push(text) },
    stderr: { write: () => {} },
    installShellHook: (shell, options) => {
      calls.push({ shell, options });
      return {
        action: 'installed',
        shell,
        rcFile: '/Users/test/.zshrc'
      };
    }
  });

  assert.equal(result.skipped, false);
  assert.deepEqual(calls, [{ shell: 'zsh', options: { minSeconds: 0 } }]);
  assert.match(output.join(''), /installed zsh hook/);
});

test('skips local installs by default', () => {
  const decision = shouldAutoInstall({
    npm_config_global: 'false',
    SHELL: '/bin/zsh'
  });

  assert.equal(decision.shouldInstall, false);
  assert.equal(decision.reason, 'local-install');
});

test('allows explicit auto-install for local installs', () => {
  const calls = [];
  const result = autoInstallHook({
    env: {
      TWN_AUTO_INSTALL_HOOK: '1',
      TWN_AUTO_HOOK_MIN_SECONDS: '9',
      SHELL: '/bin/bash'
    },
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    installShellHook: (shell, options) => {
      calls.push({ shell, options });
      return {
        action: 'updated',
        shell,
        rcFile: '/Users/test/.bash_profile'
      };
    }
  });

  assert.equal(result.skipped, false);
  assert.deepEqual(calls, [{ shell: 'bash', options: { minSeconds: 9 } }]);
});

test('supports disabling auto-install', () => {
  assert.deepEqual(shouldAutoInstall({
    npm_config_global: 'true',
    TWN_AUTO_INSTALL_HOOK: '0'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });

  assert.deepEqual(shouldAutoInstall({
    npm_config_global: 'true',
    TWN_SKIP_AUTO_HOOK: 'yes'
  }), {
    shouldInstall: false,
    reason: 'disabled'
  });
});

test('detects supported shells only', () => {
  assert.equal(detectShell({ SHELL: '/bin/zsh' }), 'zsh');
  assert.equal(detectShell({ TWN_AUTO_HOOK_SHELL: 'fish', SHELL: '/bin/zsh' }), 'fish');
  assert.equal(detectShell({ SHELL: '/bin/sh' }), null);
});

test('parses install flags and min seconds', () => {
  assert.equal(parseFlag('true'), true);
  assert.equal(parseFlag('0'), false);
  assert.equal(parseFlag('maybe'), undefined);
  assert.equal(parseMinSeconds({}), 0);
  assert.equal(parseMinSeconds({ TWN_MIN_SECONDS: '4' }), 4);
  assert.equal(parseMinSeconds({ TWN_AUTO_HOOK_MIN_SECONDS: 'bad' }), 0);
});
