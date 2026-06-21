const { runCommand } = require('./run-command');
const { sendNotification } = require('./notify');
const { renderShellHook } = require('./shell-hook');
const { installShellHook, uninstallShellHook } = require('./install-hook');

const BUILTIN_COMMANDS = new Set(['run', 'notify', 'hook', 'install-hook', 'uninstall-hook', 'help', 'version']);

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

Examples:
  twn install-hook zsh --min-seconds 30
  twn run -- npm install
  tw npm install   # after twn install-hook zsh
  twn run --shell -- "npm test && npm run build"
  TWN_WEBHOOK_URL=https://example.com/hook twn run -- terraform apply
  eval "$(twn hook zsh --min-seconds 30)"
`;
}

module.exports = {
  main,
  parseRunArgs,
  parseNotifyArgs,
  parseHookArgs,
  parseHookInstallArgs,
  helpText
};
