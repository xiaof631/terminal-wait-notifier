const { spawn } = require('node:child_process');
const path = require('node:path');
const { PromptDetector } = require('./prompt-detector');
const { sendNotification } = require('./notify');
const { buildRunOptions } = require('./config');

async function runCommand(commandArgs, rawOptions = {}) {
  const options = buildRunOptions(rawOptions);
  const startedAt = Date.now();
  const commandText = formatCommand(commandArgs, options);
  const child = spawnCommand(commandArgs, options);
  const detector = new PromptDetector();
  let lastPromptNotificationAt = 0;

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      handlePromptChunk(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      handlePromptChunk(chunk);
    });
  }

  child.on('error', (error) => {
    process.stderr.write(`twn: failed to start ${commandArgs[0]}: ${error.message}\n`);
  });

  const result = await waitForExit(child);
  const durationMs = Date.now() - startedAt;
  const exitCode = typeof result.code === 'number' ? result.code : signalToExitCode(result.signal);

  if (durationMs >= options.minSeconds * 1000) {
    await sendNotification({
      event: 'command_completed',
      level: exitCode === 0 ? 'success' : 'error',
      title: options.title,
      message: `${labelFor(options, commandText)} finished with ${exitCode === 0 ? 'success' : `exit code ${exitCode}`} after ${formatDuration(durationMs)}.`,
      command: commandText,
      exitCode,
      signal: result.signal,
      status: exitCode === 0 ? 'success' : 'error',
      durationMs,
      cwd: options.cwd
    }, options);
  }

  return exitCode;

  function handlePromptChunk(chunk) {
    if (!options.prompt) return;
    const detection = detector.push(chunk);
    if (!detection.detected) return;

    const now = Date.now();
    if (now - lastPromptNotificationAt < options.promptThrottleSeconds * 1000) return;
    lastPromptNotificationAt = now;

    sendNotification({
      event: 'waiting_confirmation',
      level: 'waiting',
      title: `${options.title} needs input`,
      message: formatPromptNotificationMessage(labelFor(options, commandText), detection),
      command: commandText,
      status: 'waiting',
      durationMs: now - startedAt,
      cwd: options.cwd,
      meta: {
        detector: detection.name
      }
    }, options).catch(() => {});
  }
}

function spawnCommand(commandArgs, options) {
  if (options.shell) {
    const shellCommand = commandArgs.join(' ');
    return spawn(shellCommand, {
      cwd: path.resolve(options.cwd),
      env: process.env,
      shell: process.env.SHELL || true,
      stdio: ['inherit', 'pipe', 'pipe']
    });
  }

  return spawn(commandArgs[0], commandArgs.slice(1), {
    cwd: path.resolve(options.cwd),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe']
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once('error', (error) => finish({ code: 127, signal: null, error }));
    child.once('close', (code, signal) => finish({ code, signal }));
  });
}

function signalToExitCode(signal) {
  if (!signal) return 1;
  return 128 + (signalNumbers[signal] || 0);
}

const signalNumbers = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGSEGV: 11,
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15
};

function formatCommand(commandArgs, options = {}) {
  if (options.shell) return commandArgs.join(' ');
  return commandArgs.map(shellQuote).join(' ');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function labelFor(options, commandText) {
  return options.label || commandText;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ? `${hours}h ${minuteRest}m` : `${hours}h`;
}

function formatPromptNotificationMessage(label, detection = {}) {
  const detector = detection.name || 'prompt';
  const sample = detection.sample ? `: ${detection.sample}` : '';
  return `${label} may be waiting for input (${detector})${sample}`;
}

module.exports = {
  runCommand,
  spawnCommand,
  formatCommand,
  shellQuote,
  formatDuration,
  formatPromptNotificationMessage,
  signalToExitCode
};
