function buildNotifyOptions(options = {}) {
  return {
    desktop: options.desktop !== undefined ? options.desktop : envEnabled('TWN_DESKTOP', true),
    webhook: options.webhook !== undefined ? options.webhook : envEnabled('TWN_WEBHOOK', true),
    webhookUrl: options.webhookUrl || process.env.TWN_WEBHOOK_URL,
    webhookHeaders: parseHeaders(process.env.TWN_WEBHOOK_HEADERS),
    webhookTimeoutMs: parsePositiveInt(process.env.TWN_WEBHOOK_TIMEOUT_MS, 5000),
    bell: options.bell !== undefined ? options.bell : envEnabled('TWN_BELL', false)
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

module.exports = {
  buildNotifyOptions,
  buildRunOptions,
  envEnabled,
  parsePositiveInt,
  parseHeaders
};
