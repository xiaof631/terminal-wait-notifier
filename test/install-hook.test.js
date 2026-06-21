const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  BLOCK_END,
  BLOCK_START,
  installShellHook,
  normalizeShell,
  removeManagedBlock,
  renderHookCommand,
  renderManagedHookBlock,
  uninstallShellHook,
  upsertManagedBlock
} = require('../src/install-hook');

test('renders a managed zsh hook block', () => {
  const block = renderManagedHookBlock('zsh', {
    minSeconds: 12,
    webhook: false,
    bell: true
  });

  assert.match(block, new RegExp(BLOCK_START));
  assert.match(block, /eval "\$\(twn hook zsh --min-seconds 12 --no-webhook --bell\)"/);
  assert.match(block, new RegExp(BLOCK_END));
});

test('renders a managed fish hook block', () => {
  const block = renderManagedHookBlock('fish', { minSeconds: 3 });
  assert.match(block, /if type -q twn/);
  assert.match(block, /twn hook fish --min-seconds 3 \| source/);
});

test('renders hook command flags', () => {
  assert.equal(renderHookCommand('bash', {}), 'twn hook bash --min-seconds 0');
  assert.equal(
    renderHookCommand('bash', { minSeconds: 7, desktop: false, webhook: false }),
    'twn hook bash --min-seconds 7 --no-desktop --no-webhook'
  );
  assert.equal(
    renderHookCommand('zsh', { sound: 'Ping' }),
    'twn hook zsh --min-seconds 0 --sound Ping'
  );
  assert.equal(
    renderHookCommand('zsh', { sound: false }),
    'twn hook zsh --min-seconds 0 --no-sound'
  );
  assert.equal(
    renderHookCommand('zsh', { alert: true }),
    'twn hook zsh --min-seconds 0 --alert'
  );
  assert.equal(
    renderHookCommand('zsh', { alert: false }),
    'twn hook zsh --min-seconds 0 --no-alert'
  );
});

test('upserts managed block without duplicating it', () => {
  const first = upsertManagedBlock('export A=1\n', `${BLOCK_START}\nold\n${BLOCK_END}`);
  assert.equal(first.changed, true);
  assert.equal(first.hadBlock, false);

  const second = upsertManagedBlock(first.content, `${BLOCK_START}\nnew\n${BLOCK_END}`);
  assert.equal(second.changed, true);
  assert.equal(second.hadBlock, true);
  assert.equal(second.content.includes('new'), true);
  assert.equal((second.content.match(new RegExp(BLOCK_START, 'g')) || []).length, 1);
});

test('removes managed block only', () => {
  const content = `before\n${BLOCK_START}\nmanaged\n${BLOCK_END}\nafter\n`;
  const result = removeManagedBlock(content);
  assert.equal(result.changed, true);
  assert.equal(result.content.includes('managed'), false);
  assert.equal(result.content.includes('before'), true);
  assert.equal(result.content.includes('after'), true);
});

test('installs and uninstalls hook in a custom rc file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-install-'));
  const rcFile = path.join(tempDir, '.zshrc');
  fs.writeFileSync(rcFile, 'export EXISTING=1\n', 'utf8');

  const installed = installShellHook('zsh', {
    rcFile,
    minSeconds: 4,
    webhook: false
  });
  assert.equal(installed.action, 'installed');
  assert.equal(fs.readFileSync(rcFile, 'utf8').includes('twn hook zsh --min-seconds 4 --no-webhook'), true);

  const updated = installShellHook('zsh', {
    rcFile,
    minSeconds: 9,
    webhook: false
  });
  assert.equal(updated.action, 'updated');
  const updatedContent = fs.readFileSync(rcFile, 'utf8');
  assert.equal(updatedContent.includes('--min-seconds 9'), true);
  assert.equal((updatedContent.match(new RegExp(BLOCK_START, 'g')) || []).length, 1);

  const removed = uninstallShellHook('zsh', { rcFile });
  assert.equal(removed.action, 'removed');
  const finalContent = fs.readFileSync(rcFile, 'utf8');
  assert.equal(finalContent.includes(BLOCK_START), false);
  assert.equal(finalContent.includes('export EXISTING=1'), true);
});

test('dry-run does not write rc file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twn-dry-run-'));
  const rcFile = path.join(tempDir, '.zshrc');

  const result = installShellHook('zsh', {
    rcFile,
    dryRun: true
  });

  assert.equal(result.action, 'installed');
  assert.equal(fs.existsSync(rcFile), false);
});

test('normalizes supported shell names', () => {
  assert.equal(normalizeShell('/bin/zsh'), 'zsh');
  assert.equal(normalizeShell('bash'), 'bash');
  assert.equal(normalizeShell('/opt/homebrew/bin/fish'), 'fish');
  assert.throws(() => normalizeShell('powershell'), /Unsupported shell/);
});
