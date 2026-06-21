const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const test = require('node:test');
const {
  CODEX_STOP_HOOK_KEY_PATH,
  buildCodexHookHandler,
  getUserStopHooks,
  mergeCodexStopHooks,
  removeCodexHookWithAppServer,
  removeCodexStopHooks,
  normalizeStopHooks,
  normalizeTimeout,
  sanitizeHookGroup,
  sanitizeHookHandler,
  writeCodexHookWithAppServer
} = require('../src/codex-install-hook');

test('builds Codex hook handler with sync command and timeout field', () => {
  assert.deepEqual(buildCodexHookHandler({
    hookCommand: 'twn codex-hook',
    timeout: 3,
    statusMessage: 'Notify'
  }), {
    type: 'command',
    command: 'twn codex-hook',
    async: false,
    timeout: 3,
    statusMessage: 'Notify'
  });
});

test('normalizes invalid Codex hook timeouts', () => {
  assert.equal(normalizeTimeout(undefined), 5);
  assert.equal(normalizeTimeout('2'), 2);
  assert.equal(normalizeTimeout('-1'), 5);
  assert.equal(normalizeTimeout('bad'), 5);
});

test('merges Codex Stop hook without duplicating existing command', () => {
  const existing = [{
    matcher: null,
    hooks: [{
      type: 'command',
      command: 'twn codex-hook',
      commandWindows: null,
      timeoutSec: 7,
      async: false,
      statusMessage: 'Existing'
    }]
  }];

  const merged = mergeCodexStopHooks(existing, { hookCommand: 'twn codex-hook' });

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0], {
    hooks: [{
      type: 'command',
      command: 'twn codex-hook',
      timeout: 7,
      async: false,
      statusMessage: 'Existing'
    }]
  });
});

test('appends Codex Stop hook when missing', () => {
  const merged = mergeCodexStopHooks([], {
    hookCommand: 'twn codex-hook',
    timeout: 4
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].hooks[0].command, 'twn codex-hook');
  assert.equal(merged[0].hooks[0].timeout, 4);
});

test('removes Codex Stop hook by exact command only', () => {
  const existing = [
    {
      matcher: 'first',
      hooks: [
        { type: 'command', command: 'twn codex-hook', async: false },
        { type: 'command', command: 'existing-codex-hook' }
      ]
    },
    {
      hooks: [
        { type: 'command', command: 'twn codex-hook --sound Ping' }
      ]
    }
  ];

  const result = removeCodexStopHooks(existing, { hookCommand: 'twn codex-hook' });

  assert.equal(result.changed, true);
  assert.equal(result.removedHooks.length, 1);
  assert.deepEqual(result.stopHooks, [
    {
      matcher: 'first',
      hooks: [{ type: 'command', command: 'existing-codex-hook' }]
    },
    {
      hooks: [{ type: 'command', command: 'twn codex-hook --sound Ping' }]
    }
  ]);
});

test('reports unchanged Codex Stop hooks when target command is absent', () => {
  const existing = [{
    hooks: [{ type: 'command', command: 'existing-codex-hook' }]
  }];

  const result = removeCodexStopHooks(existing, { hookCommand: 'twn codex-hook' });

  assert.equal(result.changed, false);
  assert.deepEqual(result.removedHooks, []);
  assert.deepEqual(result.stopHooks, existing);
});

test('extracts only user-layer Codex Stop hooks', () => {
  const response = {
    layers: [
      { name: { type: 'project' }, config: { hooks: { Stop: [{ hooks: [] }] } } },
      { name: { type: 'user' }, config: { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user' }] }] } } }
    ]
  };

  assert.deepEqual(getUserStopHooks(response), [{ hooks: [{ type: 'command', command: 'user' }] }]);
});

test('sanitizes TOML-incompatible null hook fields', () => {
  assert.deepEqual(sanitizeHookHandler({
    type: 'command',
    command: 'notify',
    commandWindows: null,
    timeoutSec: 6,
    statusMessage: null,
    async: false
  }), {
    type: 'command',
    command: 'notify',
    timeout: 6,
    async: false
  });

  assert.deepEqual(sanitizeHookGroup({
    matcher: null,
    hooks: [{ type: 'command', command: 'notify' }]
  }), {
    hooks: [{ type: 'command', command: 'notify' }]
  });
});

test('normalizes Codex Stop hooks before unchanged comparisons', () => {
  assert.deepEqual(normalizeStopHooks([{
    hooks: [{
      type: 'command',
      command: 'notify',
      async: false,
      timeout: 5,
      statusMessage: 'Notify'
    }]
  }]), [{
    hooks: [{
      type: 'command',
      command: 'notify',
      statusMessage: 'Notify',
      async: false,
      timeout: 5
    }]
  }]);
});

test('dry-run computes Codex hook without writing config', async () => {
  const mock = createCodexAppServerMock({
    layers: [{
      name: { type: 'user' },
      config: { hooks: { Stop: [] } }
    }]
  });

  const result = await writeCodexHookWithAppServer({
    dryRun: true,
    spawnFn: mock.spawnFn,
    cwd: '/tmp/project',
    env: {},
    rpcTimeoutMs: 1000
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.action, 'installed');
  assert.equal(result.keyPath, CODEX_STOP_HOOK_KEY_PATH);
  assert.equal(result.value[0].hooks[0].command, 'twn codex-hook');
  assert.deepEqual(mock.messages.map((message) => message.method), [
    'initialize',
    'config/read'
  ]);
});

test('dry-run removes Codex hook without writing config', async () => {
  const mock = createCodexAppServerMock({
    layers: [{
      name: { type: 'user', path: '/tmp/config.toml' },
      config: {
        hooks: {
          Stop: [{
            hooks: [
              { type: 'command', command: 'twn codex-hook' },
              { type: 'command', command: 'existing-codex-hook' }
            ]
          }]
        }
      }
    }]
  });

  const result = await removeCodexHookWithAppServer({
    dryRun: true,
    spawnFn: mock.spawnFn,
    cwd: '/tmp/project',
    env: {},
    rpcTimeoutMs: 1000
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.action, 'removed');
  assert.equal(result.filePath, '/tmp/config.toml');
  assert.equal(result.removedHooks.length, 1);
  assert.deepEqual(result.value, [{
    hooks: [{ type: 'command', command: 'existing-codex-hook' }]
  }]);
  assert.deepEqual(mock.messages.map((message) => message.method), [
    'initialize',
    'config/read'
  ]);
});

test('removes Codex hook through app-server when not dry-run', async () => {
  const mock = createCodexAppServerMock({
    layers: [{
      name: { type: 'user', path: '/tmp/config.toml' },
      config: {
        hooks: {
          Stop: [{
            hooks: [{ type: 'command', command: 'twn codex-hook' }]
          }]
        }
      }
    }]
  });

  const result = await removeCodexHookWithAppServer({
    spawnFn: mock.spawnFn,
    cwd: '/tmp/project',
    env: {},
    rpcTimeoutMs: 1000
  });

  assert.equal(result.action, 'removed');
  assert.equal(result.filePath, '/tmp/config.toml');
  assert.equal(result.value.length, 0);
  assert.deepEqual(mock.messages.map((message) => message.method), [
    'initialize',
    'config/read',
    'config/batchWrite',
    'hooks/list'
  ]);
  assert.deepEqual(mock.messages[2].params.edits[0].value, []);
});

test('Codex hook removal succeeds when target hook is not found', async () => {
  const mock = createCodexAppServerMock({
    layers: [{
      name: { type: 'user', path: '/tmp/config.toml' },
      config: {
        hooks: {
          Stop: [{
            hooks: [{ type: 'command', command: 'existing-codex-hook' }]
          }]
        }
      }
    }]
  });

  const result = await removeCodexHookWithAppServer({
    spawnFn: mock.spawnFn,
    cwd: '/tmp/project',
    env: {},
    rpcTimeoutMs: 1000
  });

  assert.equal(result.action, 'not-found');
  assert.equal(result.filePath, '/tmp/config.toml');
  assert.deepEqual(mock.messages.map((message) => message.method), [
    'initialize',
    'config/read'
  ]);
});

function createCodexAppServerMock(configReadResult) {
  const child = new EventEmitter();
  const messages = [];

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      const message = JSON.parse(String(chunk));
      messages.push(message);

      if (message.id === 1) {
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} })}\n`);
      }
      if (message.id === 2) {
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, result: configReadResult })}\n`);
      }
      if (message.id === 3) {
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, result: { filePath: '/tmp/config.toml' } })}\n`);
      }
      if (message.id === 4) {
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, result: { data: [{ hooks: [] }] } })}\n`);
      }

      callback();
    }
  });

  return {
    messages,
    spawnFn: () => child
  };
}
