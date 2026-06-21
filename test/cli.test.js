const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseAiHooksInstallArgs,
  parseCodexHookInstallArgs
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
