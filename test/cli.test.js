const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseAiHookArgs,
  parseAiHooksInstallArgs,
  parseAiHooksUninstallArgs,
  parseCodexHookArgs,
  parseCodexHookInstallArgs,
  parseCodexHookUninstallArgs,
  parseStatusArgs,
  parseRunArgs,
  parseNotifyArgs
} = require('../src/cli');

test('parses Codex hook install dry-run option', () => {
  assert.deepEqual(parseCodexHookInstallArgs([
    '--codex',
    'codex',
    '--command',
    'twn codex-hook',
    '--timeout',
    '4',
    '--dry-run'
  ]), {
    codexCommand: 'codex',
    hookCommand: 'twn codex-hook',
    timeout: 4,
    dryRun: true
  });
});

test('parses AI hooks dry-run option', () => {
  assert.deepEqual(parseAiHooksInstallArgs(['--cli', 'qwen', '--dry-run']), {
    clis: ['qwen'],
    dryRun: true
  });
});

test('parses hook uninstall options for Codex and AI CLIs', () => {
  assert.deepEqual(parseCodexHookUninstallArgs([
    '--codex',
    'codex-nightly',
    '--command',
    'twn codex-hook',
    '--dry-run',
    '--rpc-timeout-ms',
    '200'
  ]), {
    codexCommand: 'codex-nightly',
    hookCommand: 'twn codex-hook',
    dryRun: true,
    rpcTimeoutMs: 200
  });

  assert.deepEqual(parseAiHooksUninstallArgs([
    '--cli',
    'qwen',
    '--no-codex',
    '--dry-run'
  ]), {
    clis: ['qwen'],
    skipCodex: true,
    dryRun: true
  });
});

test('parses notification sound options', () => {
  assert.deepEqual(parseRunArgs(['--sound', 'Ping', '--', 'npm', 'test']), {
    commandArgs: ['npm', 'test'],
    options: { sound: 'Ping' }
  });

  assert.equal(parseCodexHookArgs(['--no-sound']).sound, false);
  assert.equal(parseAiHookArgs(['--cli', 'qwen', '--sound', 'Glass']).sound, 'Glass');
});

test('parses alert popup options', () => {
  assert.deepEqual(parseRunArgs(['--alert', '--', 'npm', 'test']), {
    commandArgs: ['npm', 'test'],
    options: { alert: true }
  });

  assert.equal(parseCodexHookArgs(['--no-alert']).alert, false);
  assert.equal(parseAiHookArgs(['--cli', 'qwen', '--alert']).alert, true);
});

test('parses click-to-activate options for run and notify', () => {
  assert.deepEqual(parseRunArgs(['--activate', '--', 'npm', 'test']), {
    commandArgs: ['npm', 'test'],
    options: { activate: true }
  });
  assert.equal(parseRunArgs(['--no-activate', '--', 'npm', 'test']).options.activate, false);

  assert.equal(parseNotifyArgs(['--activate', 'hello']).options.activate, true);
  assert.equal(parseNotifyArgs(['--no-activate', 'hello']).options.activate, false);
});

test('parses diagnostics options', () => {
  assert.deepEqual(parseStatusArgs([
    '--json',
    '--home',
    '/tmp/twn-home',
    '--codex',
    'codex-nightly',
    '--cli',
    'qwen',
    '--no-codex',
    '--rpc-timeout-ms',
    '100'
  ]), {
    json: true,
    homeDir: '/tmp/twn-home',
    codexCommand: 'codex-nightly',
    clis: ['qwen'],
    skipCodex: true,
    rpcTimeoutMs: 100
  });
});
