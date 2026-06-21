const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BLOCK_START = '# >>> terminal-wait-notifier >>>';
const BLOCK_END = '# <<< terminal-wait-notifier <<<';

function installShellHook(shell, options = {}) {
  const normalizedShell = normalizeShell(shell);
  const rcFile = resolveRcFile(normalizedShell, options.rcFile);
  const block = renderManagedHookBlock(normalizedShell, options);
  const existing = readIfExists(rcFile);
  const result = upsertManagedBlock(existing, block);

  if (!options.dryRun && result.changed) {
    fs.mkdirSync(path.dirname(rcFile), { recursive: true });
    fs.writeFileSync(rcFile, result.content, 'utf8');
  }

  return {
    shell: normalizedShell,
    rcFile,
    block,
    changed: result.changed,
    hadBlock: result.hadBlock,
    dryRun: Boolean(options.dryRun),
    action: result.changed ? (result.hadBlock ? 'updated' : 'installed') : 'unchanged'
  };
}

function uninstallShellHook(shell, options = {}) {
  const normalizedShell = normalizeShell(shell);
  const rcFile = resolveRcFile(normalizedShell, options.rcFile);

  if (!fs.existsSync(rcFile)) {
    return {
      shell: normalizedShell,
      rcFile,
      changed: false,
      dryRun: Boolean(options.dryRun),
      action: 'missing'
    };
  }

  const existing = fs.readFileSync(rcFile, 'utf8');
  const result = removeManagedBlock(existing);

  if (!options.dryRun && result.changed) {
    fs.writeFileSync(rcFile, result.content, 'utf8');
  }

  return {
    shell: normalizedShell,
    rcFile,
    changed: result.changed,
    dryRun: Boolean(options.dryRun),
    action: result.changed ? 'removed' : 'not-found'
  };
}

function renderManagedHookBlock(shell, options = {}) {
  const command = renderHookCommand(shell, options);

  if (shell === 'fish') {
    return `${BLOCK_START}
# Managed by terminal-wait-notifier. Remove with: twn uninstall-hook
if type -q twn
  ${command} | source
end
${BLOCK_END}`;
  }

  return `${BLOCK_START}
# Managed by terminal-wait-notifier. Remove with: twn uninstall-hook
if command -v twn >/dev/null 2>&1; then
  eval "$(${command})"
fi
${BLOCK_END}`;
}

function renderHookCommand(shell, options = {}) {
  const flags = [
    `--min-seconds ${Number.isFinite(options.minSeconds) ? options.minSeconds : 30}`,
    options.desktop === false ? '--no-desktop' : '',
    options.webhook === false ? '--no-webhook' : '',
    options.bell === true ? '--bell' : ''
  ].filter(Boolean);

  return ['twn', 'hook', shell, ...flags].join(' ');
}

function resolveRcFile(shell, rcFile) {
  if (rcFile) return expandHome(rcFile);

  const home = os.homedir();
  if (shell === 'zsh') {
    return path.join(process.env.ZDOTDIR || home, '.zshrc');
  }
  if (shell === 'bash') {
    return process.platform === 'darwin'
      ? path.join(home, '.bash_profile')
      : path.join(home, '.bashrc');
  }
  if (shell === 'fish') {
    return path.join(home, '.config', 'fish', 'config.fish');
  }
  throw new Error(`Unsupported shell: ${shell}`);
}

function normalizeShell(shell) {
  const value = String(shell || '').trim();
  if (value.endsWith('/zsh') || value === 'zsh') return 'zsh';
  if (value.endsWith('/bash') || value === 'bash') return 'bash';
  if (value.endsWith('/fish') || value === 'fish') return 'fish';
  throw new Error(`Unsupported shell: ${shell || '(empty)'}. Use zsh, bash, or fish.`);
}

function upsertManagedBlock(content, block) {
  const normalizedBlock = `${block.trim()}\n`;
  const pattern = managedBlockPattern();
  const hadBlock = pattern.test(content);

  if (hadBlock) {
    pattern.lastIndex = 0;
    const next = content.replace(pattern, normalizedBlock);
    return { content: next, changed: next !== content, hadBlock };
  }

  const prefix = content.length === 0 ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return {
    content: `${content}${prefix}${normalizedBlock}`,
    changed: true,
    hadBlock: false
  };
}

function removeManagedBlock(content) {
  const pattern = managedBlockPattern();
  if (!pattern.test(content)) {
    return { content, changed: false };
  }
  pattern.lastIndex = 0;
  const next = content
    .replace(pattern, '')
    .replace(/\n{3,}/g, '\n\n');
  return { content: next, changed: next !== content };
}

function managedBlockPattern() {
  return new RegExp(`\\n?${escapeRegex(BLOCK_START)}[\\s\\S]*?${escapeRegex(BLOCK_END)}\\n?`, 'm');
}

function readIfExists(file) {
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function expandHome(file) {
  if (file === '~') return os.homedir();
  if (file.startsWith('~/')) return path.join(os.homedir(), file.slice(2));
  return path.resolve(file);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  BLOCK_START,
  BLOCK_END,
  installShellHook,
  uninstallShellHook,
  renderManagedHookBlock,
  renderHookCommand,
  resolveRcFile,
  normalizeShell,
  upsertManagedBlock,
  removeManagedBlock
};
