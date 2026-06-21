const { runCommand } = require('./run-command');
const { sendNotification } = require('./notify');
const { renderShellHook } = require('./shell-hook');
const { installShellHook, uninstallShellHook } = require('./install-hook');
const { notifyCodexHook } = require('./codex-notify');
const { installCodexHook } = require('./codex-install-hook');
const { notifyAiCliHook } = require('./ai-hook-notify');
const { installAiCliHooks, DEFAULT_AI_CLIS } = require('./ai-cli-integrations');

const BUILTIN_COMMANDS = new Set([
  'run',
  'notify',
  'hook',
  'install-hook',
  'uninstall-hook',
  'codex-hook',
  'install-codex-hook',
  'ai-hook',
  'install-ai-hooks',
  'help',
  'version'
]);

async function main(argv) {
  const args = Array.from(argv);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    process.stdout.write(helpText());
    return;
  }

  if (args[0] === '--version' || args[0] === '-v' || args[0] === 'version') {
    process.stdout.write(`${require('../package.json').version}\n`);
    return;
  }

  if (args[0] === '--') {
    const exitCode = await runCommand(args.slice(1), {});
    process.exitCode = exitCode;
    return;
  }

  const command = BUILTIN_COMMANDS.has(args[0]) ? args.shift() : 'run';

  if (command === 'run') {
    const { commandArgs, options } = parseRunArgs(args);
    const exitCode = await runCommand(commandArgs, options);
    process.exitCode = exitCode;
    return;
  }

  if (command === 'notify') {
    const { message, options } = parseNotifyArgs(args);
    await sendNotification({
      event: 'manual',
      level: options.level || 'info',
      title: options.title || 'Terminal reminder',
      message: message || options.message || 'Notification test from terminal-wait-notifier',
      cwd: process.cwd()
    }, options);
    return;
  }

  if (command === 'hook') {
    const { shell, options } = parseHookArgs(args);
    process.stdout.write(renderShellHook(shell, options));
    return;
  }

  if (command === 'install-hook') {
    const { shell, options } = parseHookInstallArgs(args, { uninstall: false });
    const result = installShellHook(shell, options);
    printHookInstallResult(result);
    return;
  }

  if (command === 'uninstall-hook') {
    const { shell, options } = parseHookInstallArgs(args, { uninstall: true });
    const result = uninstallShellHook(shell, options);
    printHookUninstallResult(result);
    return;
  }

  if (command === 'codex-hook') {
    const options = parseCodexHookArgs(args);
    await notifyCodexHook({
      title: options.title,
      message: options.message,
      notifyOptions: options
    });
    return;
  }

  if (command === 'install-codex-hook') {
    const options = parseCodexHookInstallArgs(args);
    const result = await installCodexHook(options);
    printCodexHookInstallResult(result);
    return;
  }

  if (command === 'ai-hook') {
    const options = parseAiHookArgs(args);
    await notifyAiCliHook({
      cli: options.cli,
      title: options.title,
      message: options.message,
      notifyOptions: options
    });
    process.stdout.write('{}\n');
    return;
  }

  if (command === 'install-ai-hooks') {
    const options = parseAiHooksInstallArgs(args);
    const results = await installAiCliHooks(options);
    printAiHooksInstallResults(results);
    return;
  }

  throw usageError(`Unknown command: ${command}`);
}

function parseRunArgs(args) {
  const options = {};
  const commandArgs = [];
  let readingCommand = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!readingCommand && arg === '--') {
      readingCommand = true;
      continue;
    }

    if (!readingCommand && arg.startsWith('--')) {
      switch (arg) {
        case '--title':
          options.title = requireValue(args, ++index, arg);
          break;
        case '--label':
          options.label = requireValue(args, ++index, arg);
          break;
        case '--cwd':
          options.cwd = requireValue(args, ++index, arg);
          break;
        case '--min-seconds':
          options.minSeconds = parseNumber(requireValue(args, ++index, arg), arg);
          break;
        case '--prompt-throttle-seconds':
          options.promptThrottleSeconds = parseNumber(requireValue(args, ++index, arg), arg);
          break;
        case '--webhook-url':
          options.webhookUrl = requireValue(args, ++index, arg);
          break;
        case '--shell':
          options.shell = true;
          break;
        case '--no-prompt':
          options.prompt = false;
          break;
        case '--no-desktop':
          options.desktop = false;
          break;
        case '--no-webhook':
          options.webhook = false;
          break;
        case '--bell':
          options.bell = true;
          break;
        default:
          throw usageError(`Unknown run option: ${arg}`);
      }
      continue;
    }

    readingCommand = true;
    commandArgs.push(arg);
  }

  if (commandArgs.length === 0) {
    throw usageError('Missing command. Use: twn run -- <command> [args...]');
  }

  return { commandArgs, options };
}

function parseNotifyArgs(args) {
  const options = {};
  const messageParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      switch (arg) {
        case '--title':
          options.title = requireValue(args, ++index, arg);
          break;
        case '--message':
          options.message = requireValue(args, ++index, arg);
          break;
        case '--level':
          options.level = requireValue(args, ++index, arg);
          break;
        case '--webhook-url':
          options.webhookUrl = requireValue(args, ++index, arg);
          break;
        case '--no-desktop':
          options.desktop = false;
          break;
        case '--no-webhook':
          options.webhook = false;
          break;
        case '--bell':
          options.bell = true;
          break;
        default:
          throw usageError(`Unknown notify option: ${arg}`);
      }
      continue;
    }
    messageParts.push(arg);
  }

  return { message: messageParts.join(' '), options };
}

function parseHookArgs(args) {
  const options = {};
  let shell = args[0] && !args[0].startsWith('--') ? args.shift() : undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--min-seconds':
        options.minSeconds = parseNumber(requireValue(args, ++index, arg), arg);
        break;
      case '--no-desktop':
        options.desktop = false;
        break;
      case '--no-webhook':
        options.webhook = false;
        break;
      case '--bell':
        options.bell = true;
        break;
      default:
        throw usageError(`Unknown hook option: ${arg}`);
    }
  }

  if (!shell) {
    shell = guessShell();
  }

  return { shell, options };
}

function parseHookInstallArgs(args, mode = {}) {
  const options = {};
  let shell;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--') && !shell) {
      shell = arg;
      continue;
    }

    switch (arg) {
      case '--shell':
        shell = requireValue(args, ++index, arg);
        break;
      case '--rc-file':
        options.rcFile = requireValue(args, ++index, arg);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--min-seconds':
        if (mode.uninstall) throw usageError(`${arg} is only supported by install-hook`);
        options.minSeconds = parseNumber(requireValue(args, ++index, arg), arg);
        break;
      case '--no-desktop':
        if (mode.uninstall) throw usageError(`${arg} is only supported by install-hook`);
        options.desktop = false;
        break;
      case '--no-webhook':
        if (mode.uninstall) throw usageError(`${arg} is only supported by install-hook`);
        options.webhook = false;
        break;
      case '--bell':
        if (mode.uninstall) throw usageError(`${arg} is only supported by install-hook`);
        options.bell = true;
        break;
      default:
        throw usageError(`Unknown ${mode.uninstall ? 'uninstall-hook' : 'install-hook'} option: ${arg}`);
    }
  }

  if (!shell) {
    shell = guessShell();
  }

  return { shell, options };
}

function parseCodexHookArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--title':
        options.title = requireValue(args, ++index, arg);
        break;
      case '--message':
        options.message = requireValue(args, ++index, arg);
        break;
      case '--webhook-url':
        options.webhookUrl = requireValue(args, ++index, arg);
        break;
      case '--no-desktop':
        options.desktop = false;
        break;
      case '--no-webhook':
        options.webhook = false;
        break;
      case '--bell':
        options.bell = true;
        break;
      default:
        throw usageError(`Unknown codex-hook option: ${arg}`);
    }
  }

  return options;
}

function parseCodexHookInstallArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--codex':
        options.codexCommand = requireValue(args, ++index, arg);
        break;
      case '--command':
        options.hookCommand = requireValue(args, ++index, arg);
        break;
      case '--timeout':
        options.timeout = parseNumber(requireValue(args, ++index, arg), arg);
        break;
      case '--status-message':
        options.statusMessage = requireValue(args, ++index, arg);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw usageError(`Unknown install-codex-hook option: ${arg}`);
    }
  }

  return options;
}

function parseAiHookArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--cli':
        options.cli = requireValue(args, ++index, arg);
        break;
      case '--title':
        options.title = requireValue(args, ++index, arg);
        break;
      case '--message':
        options.message = requireValue(args, ++index, arg);
        break;
      case '--webhook-url':
        options.webhookUrl = requireValue(args, ++index, arg);
        break;
      case '--no-desktop':
        options.desktop = false;
        break;
      case '--no-webhook':
        options.webhook = false;
        break;
      case '--bell':
        options.bell = true;
        break;
      default:
        throw usageError(`Unknown ai-hook option: ${arg}`);
    }
  }

  if (!options.cli) {
    throw usageError('Missing --cli for ai-hook');
  }

  return options;
}

function parseAiHooksInstallArgs(args) {
  const options = {
    clis: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--cli':
        options.clis.push(requireValue(args, ++index, arg));
        break;
      case '--only-existing':
        options.onlyExisting = true;
        break;
      case '--no-codex':
        options.skipCodex = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw usageError(`Unknown install-ai-hooks option: ${arg}`);
    }
  }

  if (options.clis.length === 0) {
    options.clis = DEFAULT_AI_CLIS;
  }

  return options;
}

function printHookInstallResult(result) {
  if (result.dryRun) {
    process.stdout.write(`Would ${result.hadBlock ? 'update' : 'install'} terminal-wait-notifier ${result.shell} hook in ${result.rcFile}:\n\n${result.block}\n`);
    return;
  }

  if (result.action === 'unchanged') {
    process.stdout.write(`terminal-wait-notifier hook is already installed in ${result.rcFile}\n`);
    return;
  }

  process.stdout.write(`terminal-wait-notifier hook ${result.action} in ${result.rcFile}\nRestart your terminal, or run: source ${result.rcFile}\n`);
}

function printHookUninstallResult(result) {
  if (result.dryRun) {
    process.stdout.write(`Would remove terminal-wait-notifier ${result.shell} hook from ${result.rcFile}\n`);
    return;
  }

  if (result.action === 'missing') {
    process.stdout.write(`No rc file found at ${result.rcFile}\n`);
    return;
  }

  if (result.action === 'not-found') {
    process.stdout.write(`No terminal-wait-notifier hook found in ${result.rcFile}\n`);
    return;
  }

  process.stdout.write(`terminal-wait-notifier hook removed from ${result.rcFile}\nRestart your terminal, or run: source ${result.rcFile}\n`);
}

function printCodexHookInstallResult(result) {
  if (result.dryRun) {
    process.stdout.write(`Would ${actionVerb(result.action)} terminal-wait-notifier Codex Stop hook in ${result.filePath || 'Codex config'}\n`);
    return;
  }

  process.stdout.write(`terminal-wait-notifier Codex Stop hook ${result.action} in ${result.filePath || 'Codex config'}\n`);

  if (result.hook && result.hook.trustStatus && !['trusted', 'managed'].includes(result.hook.trustStatus)) {
    process.stdout.write('Codex will ask you to review and trust this hook before it can run.\n');
  }

  for (const warning of result.warnings || []) {
    process.stdout.write(`Codex warning: ${warning}\n`);
  }
}

function printAiHooksInstallResults(results) {
  for (const result of results) {
    if (result.action === 'skipped') {
      process.stdout.write(`${result.displayName} hook skipped: ${result.reason}\n`);
      continue;
    }
    if (result.action === 'failed') {
      process.stdout.write(`${result.displayName} hook failed: ${result.error}\n`);
      continue;
    }

    if (result.dryRun) {
      process.stdout.write(`${result.displayName} hook would ${actionVerb(result.action)} in ${result.filePath || 'settings'}\n`);
    } else {
      process.stdout.write(`${result.displayName} hook ${result.action} in ${result.filePath || 'settings'}\n`);
    }
    if (result.hook && result.hook.trustStatus && !['trusted', 'managed'].includes(result.hook.trustStatus)) {
      process.stdout.write(`${result.displayName} may ask you to review and trust this hook before it can run.\n`);
    }
  }
}

function actionVerb(action) {
  if (action === 'installed') return 'install';
  if (action === 'updated') return 'update';
  if (action === 'unchanged') return 'leave unchanged';
  return action;
}

function requireValue(args, index, flag) {
  if (index >= args.length || args[index] === '') {
    throw usageError(`Missing value for ${flag}`);
  }
  return args[index];
}

function parseNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw usageError(`${flag} must be a non-negative number`);
  }
  return parsed;
}

function guessShell() {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return process.platform === 'win32' ? 'powershell' : 'sh';
}

function usageError(message) {
  const error = new Error(`${message}\n\n${helpText()}`);
  error.exitCode = 2;
  return error;
}

function helpText() {
  return `terminal-wait-notifier

Usage:
  twn run [options] -- <command> [args...]
  twn -- <command> [args...]
  twn notify [message] [options]
  twn hook [zsh|bash|fish] [options]
  twn install-hook [zsh|bash|fish] [options]
  twn uninstall-hook [zsh|bash|fish] [options]
  twn codex-hook [options]
  twn install-codex-hook [options]
  twn ai-hook --cli <name> [options]
  twn install-ai-hooks [options]

Run options:
  --title <text>                  Notification title
  --label <text>                  Friendly command label
  --cwd <path>                    Working directory
  --min-seconds <n>               Notify on completion only after n seconds
  --prompt-throttle-seconds <n>   Minimum seconds between prompt reminders
  --webhook-url <url>             Push notification webhook endpoint
  --shell                         Run the command through the user's shell
  --no-prompt                     Disable waiting-confirmation detection
  --no-desktop                    Disable desktop notification
  --no-webhook                    Disable webhook push
  --bell                          Also ring the terminal bell

Hook install options:
  --shell <name>                  Shell to configure: zsh, bash, or fish
  --rc-file <path>                Shell config file to edit
  --min-seconds <n>               Notify on completion only after n seconds
  --dry-run                       Print the managed block without writing
  --no-desktop                    Disable desktop notification in the hook
  --no-webhook                    Disable webhook push in the hook
  --bell                          Also ring the terminal bell from the hook

Codex notification options:
  --title <text>                  Notification title for codex-hook
  --message <text>                Override Codex hook notification message
  --webhook-url <url>             Push notification webhook endpoint
  --no-desktop                    Disable desktop notification
  --no-webhook                    Disable webhook push
  --bell                          Also ring the terminal bell

Codex install options:
  --codex <command>               Codex executable for install-codex-hook
  --command <command>             Hook command Codex should run
  --timeout <seconds>             Hook timeout in seconds
  --status-message <text>         Status shown by Codex while the hook runs
  --dry-run                       Compute Codex hook changes without writing

AI CLI hook options:
  --cli <name>                    AI CLI name: codex, qwen, gemini, claude, qoder
  --only-existing                 Only install hooks for CLIs with an existing settings directory
  --no-codex                      Skip Codex when running install-ai-hooks
  --dry-run                       Compute hook changes without writing

Examples:
  npm install -g terminal-wait-notifier
  twn run -- npm install
  tw npm install   # after opening a new terminal
  twn install-ai-hooks
  twn install-codex-hook
  twn run --shell -- "npm test && npm run build"
  TWN_WEBHOOK_URL=https://example.com/hook twn run -- terraform apply
  TWN_SKIP_AUTO_HOOK=1 npm install -g terminal-wait-notifier
  eval "$(twn hook zsh --min-seconds 0)"
`;
}

module.exports = {
  main,
  parseRunArgs,
  parseNotifyArgs,
  parseHookArgs,
  parseHookInstallArgs,
  parseCodexHookArgs,
  parseCodexHookInstallArgs,
  parseAiHookArgs,
  parseAiHooksInstallArgs,
  helpText
};
