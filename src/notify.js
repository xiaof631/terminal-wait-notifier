const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { buildNotifyOptions } = require('./config');

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
    sendDesktopNotification(normalized);
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

function sendDesktopNotification(event) {
  if (process.platform === 'darwin') {
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
  darwinSoundPath
};
