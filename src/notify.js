const { spawn } = require('node:child_process');
const os = require('node:os');
const { buildNotifyOptions } = require('./config');

async function sendNotification(event, rawOptions = {}) {
  const options = buildNotifyOptions(rawOptions);
  const normalized = normalizeEvent(event);

  if (options.bell) {
    process.stderr.write('\u0007');
  }

  if (options.desktop) {
    sendDesktopNotification(normalized);
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
  sendDesktopNotification
};
