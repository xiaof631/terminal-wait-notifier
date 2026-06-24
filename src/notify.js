const { spawn, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { buildNotifyOptions } = require('./config');

let terminalNotifierAvailable;

async function sendNotification(event, rawOptions = {}) {
  const options = buildNotifyOptions(rawOptions);
  const normalized = normalizeEvent(event);

  if (options.bell) {
    process.stderr.write('\u0007');
  }

  if (options.sound) {
    playNotificationSound(options.sound);
  }

  if (options.desktop) {
    sendDesktopNotification(normalized, options);
  }

  if (options.alert) {
    sendDesktopAlert(normalized, options);
  }

  if (options.webhook && options.webhookUrl) {
    await sendWebhook(normalized, options);
  }

  if (!options.desktop && (!options.webhook || !options.webhookUrl)) {
    process.stderr.write(`[twn] ${normalized.title}: ${normalized.message}\n`);
  }
}

function normalizeEvent(event) {
  const now = new Date().toISOString();
  return {
    source: 'terminal-wait-notifier',
    event: event.event || 'notification',
    level: event.level || 'info',
    title: String(event.title || 'Terminal reminder'),
    message: String(event.message || ''),
    command: event.command,
    exitCode: event.exitCode,
    signal: event.signal,
    status: event.status,
    durationMs: event.durationMs,
    cwd: event.cwd || process.cwd(),
    host: os.hostname(),
    timestamp: event.timestamp || now,
    meta: event.meta || undefined
  };
}

function sendDesktopNotification(event, options = {}) {
  if (process.platform === 'darwin') {
    const sound = typeof options.sound === 'string' ? options.sound : undefined;
    if (options.activate !== false && isTerminalNotifierAvailable()) {
      const bundleId = resolveBundleId(options.terminalBundleId, process.env);
      detachedSpawn('terminal-notifier', buildTerminalNotifierArgs(event, bundleId, sound));
      return;
    }

    if (options.activate !== false && !isTerminalNotifierAvailable()) {
      suggestTerminalNotifierInstall();
    }

    const script = [
      'display notification',
      osaString(event.message),
      'with title',
      osaString(event.title),
      'subtitle',
      osaString(event.level)
    ].join(' ');
    detachedSpawn('osascript', ['-e', script]);
    return;
  }

  if (process.platform === 'linux') {
    detachedSpawn('notify-send', [event.title, event.message]);
    return;
  }

  if (process.platform === 'win32') {
    detachedSpawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      windowsToastScript(event.title, event.message)
    ]);
  }
}

function sendDesktopAlert(event, options = {}) {
  if (process.platform !== 'darwin') return;

  const timeoutSeconds = Number.isFinite(options.alertTimeoutSeconds)
    ? options.alertTimeoutSeconds
    : 10;
  detachedSpawn('osascript', ['-e', darwinAlertScript(event, timeoutSeconds)]);
}

function darwinAlertScript(event, timeoutSeconds = 10) {
  return [
    'display alert',
    osaString(event.title),
    'message',
    osaString(event.message),
    'as informational',
    'giving up after',
    String(Math.max(1, timeoutSeconds))
  ].join(' ');
}

function playNotificationSound(soundName) {
  const sound = String(soundName || '').trim();
  if (!sound) return;

  if (process.platform === 'darwin') {
    detachedSpawn('afplay', [darwinSoundPath(sound)]);
    return;
  }

  if (process.platform === 'linux') {
    detachedSpawn('canberra-gtk-play', ['-i', sound === 'Glass' ? 'complete' : sound]);
    return;
  }

  if (process.platform === 'win32') {
    detachedSpawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '[console]::beep(880,200)'
    ]);
  }
}

function darwinSoundPath(soundName) {
  const value = String(soundName || '').trim();
  if (path.isAbsolute(value)) return value;

  const basename = path.basename(value).replace(/\.(aiff|aif|caf|wav|mp3)$/i, '');
  const safeName = /^[A-Za-z0-9 _-]+$/.test(basename) ? basename : 'Glass';
  return path.join('/System/Library/Sounds', `${safeName}.aiff`);
}

function detachedSpawn(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.on('error', () => {});
  child.unref();
}

async function sendWebhook(event, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.webhookTimeoutMs);

  try {
    const response = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...options.webhookHeaders
      },
      body: JSON.stringify(event),
      signal: controller.signal
    });

    if (!response.ok) {
      process.stderr.write(`[twn] webhook failed with HTTP ${response.status}\n`);
    }
  } catch (error) {
    process.stderr.write(`[twn] webhook failed: ${error.message}\n`);
  } finally {
    clearTimeout(timeout);
  }
}

function osaString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function isTerminalNotifierAvailable() {
  if (terminalNotifierAvailable !== undefined) return terminalNotifierAvailable;
  if (process.platform !== 'darwin') {
    terminalNotifierAvailable = false;
    return false;
  }
  try {
    const result = spawnSync('command', ['-v', 'terminal-notifier'], {
      stdio: 'ignore',
      shell: process.env.SHELL || '/bin/sh'
    });
    terminalNotifierAvailable = result.status === 0;
  } catch {
    terminalNotifierAvailable = false;
  }
  return terminalNotifierAvailable;
}

let installHintShown = false;
function suggestTerminalNotifierInstall() {
  if (installHintShown) return;
  installHintShown = true;
  process.stderr.write(
    '[twn] 点击通知激活终端需要 terminal-notifier：brew install terminal-notifier\n'
  );
}

const TERM_PROGRAM_TO_BUNDLE_ID = {
  Apple_Terminal: 'com.apple.Terminal',
  'iTerm.app': 'com.googlecode.iterm2',
  'iTerm2': 'com.googlecode.iterm2',
  vscode: 'com.microsoft.VSCode',
  Windsurf: 'code.url.windsurf',
  WarpTerminal: 'dev.warp.Warp-Stable',
  Hyper: 'co.zeit.hyper',
  'Ghostty.app': 'com.mitchellh.ghostty',
  'kitty.app': 'net.kovidgoyal.kitty',
  'alacritty.app': 'org.alacritty'
};

function mapTermProgram(termProgram) {
  if (!termProgram) return undefined;
  return TERM_PROGRAM_TO_BUNDLE_ID[termProgram];
}

function resolveBundleIdFromEnv(env) {
  const override = String(env.TWN_TERMINAL_BUNDLE_ID || '').trim();
  if (override) return override;
  const cfBundle = String(env.__CFBundleIdentifier || '').trim();
  if (cfBundle) return cfBundle;
  return mapTermProgram(env.TERM_PROGRAM);
}

function resolveBundleId(override, env) {
  const value = String(override || '').trim();
  if (value) return value;
  return resolveBundleIdFromEnv(env);
}

function buildTerminalNotifierArgs(event, bundleId, sound) {
  const args = [
    '-title', String(event.title || 'Terminal reminder'),
    '-message', String(event.message || ''),
    '-subtitle', String(event.level || ''),
    '-ignoreDnD'
  ];
  if (bundleId) {
    args.push('-activate', bundleId);
  }
  if (sound) {
    args.push('-sound', darwinSoundName(sound));
  }
  return args;
}

function darwinSoundName(soundName) {
  const value = String(soundName || '').trim();
  if (!value) return undefined;
  if (path.isAbsolute(value)) return 'Glass';
  const basename = path.basename(value).replace(/\.(aiff|aif|caf|wav|mp3)$/i, '');
  return /^[A-Za-z0-9 _-]+$/.test(basename) ? basename : 'Glass';
}

function windowsToastScript(title, message) {
  const escapedTitle = powershellString(title);
  const escapedMessage = powershellString(message);
  return [
    '[void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");',
    '[void] [System.Reflection.Assembly]::LoadWithPartialName("System.Drawing");',
    '$n = New-Object System.Windows.Forms.NotifyIcon;',
    '$n.Icon = [System.Drawing.SystemIcons]::Information;',
    '$n.Visible = $true;',
    `$n.ShowBalloonTip(8000, ${escapedTitle}, ${escapedMessage}, [System.Windows.Forms.ToolTipIcon]::Info);`,
    'Start-Sleep -Seconds 2;',
    '$n.Dispose();'
  ].join(' ');
}

function powershellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = {
  sendNotification,
  normalizeEvent,
  sendWebhook,
  sendDesktopNotification,
  sendDesktopAlert,
  darwinAlertScript,
  playNotificationSound,
  darwinSoundPath,
  buildTerminalNotifierArgs,
  mapTermProgram,
  resolveBundleIdFromEnv,
  resolveBundleId,
  darwinSoundName
};
