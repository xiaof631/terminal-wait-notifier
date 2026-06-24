function buildNotifyOptions(options = {}) {
  return {
    desktop: options.desktop !== undefined ? options.desktop : envEnabled('TWN_DESKTOP', true),
    webhook: options.webhook !== undefined ? options.webhook : envEnabled('TWN_WEBHOOK', true),
    webhookUrl: options.webhookUrl || process.env.TWN_WEBHOOK_URL,
    webhookHeaders: parseHeaders(process.env.TWN_WEBHOOK_HEADERS),
    webhookTimeoutMs: parsePositiveInt(process.env.TWN_WEBHOOK_TIMEOUT_MS, 5000),
    bell: options.bell !== undefined ? options.bell : envEnabled('TWN_BELL', false),
    sound: parseSoundOption(pickSoundOption(options), false),
    alert: options.alert !== undefined ? options.alert : envEnabled('TWN_ALERT', false),
    alertTimeoutSeconds: options.alertTimeoutSeconds !== undefined
      ? options.alertTimeoutSeconds
      : parsePositiveInt(process.env.TWN_ALERT_TIMEOUT_SECONDS, 10),
    activate: options.activate !== undefined ? options.activate : envEnabled('TWN_ACTIVATE', true),
    terminalBundleId: options.terminalBundleId || process.env.TWN_TERMINAL_BUNDLE_ID
  };
}

function buildRunOptions(options = {}) {
  return {
    ...buildNotifyOptions(options),
    title: options.title || process.env.TWN_TITLE || 'Terminal command',
    label: options.label,
    cwd: options.cwd || process.cwd(),
    shell: Boolean(options.shell),
    prompt: options.prompt !== undefined ? options.prompt : envEnabled('TWN_PROMPT_DETECTION', true),
    minSeconds: options.minSeconds !== undefined
      ? options.minSeconds
      : parsePositiveInt(process.env.TWN_MIN_SECONDS, 0),
    promptThrottleSeconds: options.promptThrottleSeconds !== undefined
      ? options.promptThrottleSeconds
      : parsePositiveInt(process.env.TWN_PROMPT_THROTTLE_SECONDS, 60)
  };
}

function envEnabled(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseHeaders(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function pickSoundOption(options = {}) {
  if (options.sound !== undefined) return options.sound;
  if (process.env.TWN_SOUND !== undefined) return process.env.TWN_SOUND;
  return options.defaultSound;
}

function parseSoundOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Glass' : false;

  const normalized = String(value).trim();
  if (!normalized) return fallback;
  if (['0', 'false', 'no', 'off', 'none', 'silent'].includes(normalized.toLowerCase())) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase())) {
    return 'Glass';
  }
  return normalized;
}

module.exports = {
  buildNotifyOptions,
  buildRunOptions,
  envEnabled,
  parsePositiveInt,
  parseHeaders,
  parseSoundOption
};
