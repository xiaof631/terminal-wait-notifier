const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseAiHookArgs,
  parseAiHooksInstallArgs,
  parseCodexHookArgs,
  parseCodexHookInstallArgs,
  parseRunArgs
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
