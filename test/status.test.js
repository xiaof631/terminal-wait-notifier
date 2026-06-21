const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const test = require('node:test');
const { renderManagedHookBlock } = require('../src/install-hook');
const { JSON_SETTINGS_INTEGRATIONS } = require('../src/ai-cli-integrations');
const {
  buildDoctorSuggestions,
  collectStatus,
  inspectJsonSettingsHook,
  inspectShellHook,
  readCodexHookStatusWithAppServer
} = require('../src/status');

test('inspects an installed shell hook under a custom home directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-shell-'));
  try {
    fs.writeFileSync(path.join(tmp, '.zshrc'), `${renderManagedHookBlock('zsh', { minSeconds: 0 })}\n`, 'utf8');

    const result = inspectShellHook('zsh', {
      homeDir: tmp,
      env: {},
      platform: 'darwin'
    });

    assert.equal(result.installed, true);
    assert.equal(result.status, 'installed');
    assert.equal(result.filePath, path.join(tmp, '.zshrc'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports missing shell rc file with checked path', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-missing-shell-'));
  try {
    const result = inspectShellHook('bash', {
      homeDir: tmp,
      env: {},
      platform: 'linux'
    });

    assert.equal(result.installed, false);
    assert.equal(result.status, 'missing-file');
    assert.equal(result.filePath, path.join(tmp, '.bashrc'));
    assert.match(result.warnings[0], /does not exist/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports shell hook command mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-shell-mismatch-'));
  try {
    fs.writeFileSync(path.join(tmp, '.zshrc'), `${renderManagedHookBlock('bash', { minSeconds: 0 })}\n`, 'utf8');

    const result = inspectShellHook('zsh', {
      homeDir: tmp,
      env: {},
      platform: 'darwin'
    });

    assert.equal(result.installed, false);
    assert.equal(result.status, 'command-mismatch');
    assert.deepEqual(result.foundCommands, ['twn hook bash --min-seconds 0']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports missing AI CLI settings file with checked path', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-missing-ai-'));
  try {
    const result = inspectJsonSettingsHook('qoder', JSON_SETTINGS_INTEGRATIONS.qoder, { homeDir: tmp });

    assert.equal(result.installed, false);
    assert.equal(result.status, 'missing-file');
    assert.equal(result.filePath, path.join(tmp, '.qoder/settings.json'));
    assert.match(result.warnings[0], /does not exist/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inspects installed AI CLI JSON settings hook', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-ai-'));
  try {
    fs.mkdirSync(path.join(tmp, '.qwen'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.qwen/settings.json'), JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{
            type: 'command',
            command: 'twn ai-hook --cli qwen'
          }]
        }]
      }
    }), 'utf8');

    const result = inspectJsonSettingsHook('qwen', JSON_SETTINGS_INTEGRATIONS.qwen, { homeDir: tmp });

    assert.equal(result.installed, true);
    assert.equal(result.status, 'installed');
    assert.deepEqual(result.foundCommands, ['twn ai-hook --cli qwen']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports invalid AI CLI JSON settings safely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-invalid-json-'));
  try {
    fs.mkdirSync(path.join(tmp, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gemini/settings.json'), '{"hooks":', 'utf8');

    const result = inspectJsonSettingsHook('gemini', JSON_SETTINGS_INTEGRATIONS.gemini, { homeDir: tmp });

    assert.equal(result.installed, false);
    assert.equal(result.status, 'invalid-json');
    assert.match(result.errors[0], /invalid/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reports AI CLI hook command mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-mismatch-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude/settings.json'), JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{
            type: 'command',
            command: 'other-notifier'
          }]
        }]
      }
    }), 'utf8');

    const result = inspectJsonSettingsHook('claude', JSON_SETTINGS_INTEGRATIONS.claude, { homeDir: tmp });

    assert.equal(result.installed, false);
    assert.equal(result.status, 'command-mismatch');
    assert.deepEqual(result.foundCommands, ['other-notifier']);
    assert.match(result.warnings[0], /Expected twn ai-hook --cli claude/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collects status without reading real user home when custom home is provided', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-status-custom-home-'));
  try {
    const status = await collectStatus({
      homeDir: tmp,
      env: { SHELL: '/bin/zsh' },
      platform: 'darwin',
      skipCodex: true
    });

    assert.equal(status.homeDir, tmp);
    assert.equal(status.shell.current, 'zsh');
    assert.equal(status.codex.filePath, path.join(tmp, '.codex/config.toml'));
    assert.equal(status.aiClis.find((item) => item.cli === 'qoder').filePath, path.join(tmp, '.qoder/settings.json'));
    assert.equal(status.notifications.platform, 'darwin');
    assert.ok(status.warnings.some((warning) => warning.source === 'shell:zsh'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reads Codex hook status without writing config', async () => {
  const mock = createCodexAppServerMock({
    configReadResult: {
      layers: [{
        name: { type: 'user', path: '/tmp/codex-config.toml' },
        config: {
          hooks: {
            Stop: [{
              hooks: [{
                type: 'command',
                command: 'twn codex-hook'
              }]
            }]
          }
        }
      }]
    },
    hooksListResult: {
      data: [{
        hooks: [{
          type: 'command',
          command: 'twn codex-hook',
          sourcePath: '/tmp/codex-config.toml',
          trustStatus: 'untrusted'
        }]
      }]
    }
  });

  const result = await readCodexHookStatusWithAppServer({
    spawnFn: mock.spawnFn,
    cwd: '/tmp/project',
    env: {},
    rpcTimeoutMs: 1000
  });

  assert.equal(result.installed, true);
  assert.equal(result.status, 'installed');
  assert.equal(result.filePath, '/tmp/codex-config.toml');
  assert.equal(result.trustStatus, 'untrusted');
  assert.deepEqual(mock.messages.map((message) => message.method), [
    'initialize',
    'config/read',
    'hooks/list'
  ]);
});

test('doctor suggestions include Codex trust, macOS notifications, and webhook setup', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-doctor-'));
  try {
    const status = await collectStatus({
      homeDir: tmp,
      env: { SHELL: '/bin/zsh' },
      platform: 'darwin',
      skipCodex: true
    });
    status.codex = {
      ...status.codex,
      installed: true,
      status: 'installed',
      trustStatus: 'untrusted'
    };

    const suggestions = buildDoctorSuggestions(status);

    assert.ok(suggestions.some((item) => item.id === 'trust-codex-hook'));
    assert.ok(suggestions.some((item) => item.id === 'macos-notification-permission'));
    assert.ok(suggestions.some((item) => item.id === 'set-webhook-url'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function createCodexAppServerMock({ configReadResult, hooksListResult }) {
  const child = new EventEmitter();
  const messages = [];

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
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
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, result: hooksListResult })}\n`);
      }

      callback();
    }
  });

  return {
    messages,
    spawnFn: () => child
  };
}
