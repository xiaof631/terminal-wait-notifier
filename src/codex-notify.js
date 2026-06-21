const { sendNotification } = require('./notify');

const DEFAULT_CODEX_TITLE = 'Codex';
const DEFAULT_CODEX_MESSAGE = 'Codex task completed';

async function notifyCodexHook(options = {}) {
  const stdin = options.stdin || process.stdin;
  const raw = await readStdin(stdin);
  const payload = parseJsonObject(raw);
  const event = buildCodexEvent(payload, {
    cwd: options.cwd || process.cwd(),
    title: options.title,
    message: options.message
  });
  const notifier = options.sendNotification || sendNotification;

  await notifier(event, options.notifyOptions || {});
  return event;
}

function buildCodexEvent(payload = {}, context = {}) {
  const eventName = pickString(payload, ['hook_event_name', 'hookEventName', 'eventName', 'event']) || 'stop';
  const cwd = pickString(payload, ['cwd', 'workdir', 'workspace']) || context.cwd || process.cwd();
  const message = context.message || summarizeCodexPayload(payload);

  return {
    event: 'codex-stop',
    level: 'info',
    title: context.title || DEFAULT_CODEX_TITLE,
    message,
    cwd,
    meta: {
      eventName,
      sessionId: pickString(payload, ['session_id', 'sessionId']),
      turnId: pickString(payload, ['turn_id', 'turnId']),
      transcriptPath: pickString(payload, ['transcript_path', 'transcriptPath']),
      rawKeys: Object.keys(payload).slice(0, 20)
    }
  };
}

function summarizeCodexPayload(payload = {}) {
  const assistantMessage = pickString(payload, [
    'last_assistant_message',
    'lastAssistantMessage',
    'assistant_message',
    'assistantMessage',
    'message',
    'summary'
  ]);
  if (assistantMessage) {
    return truncate(collapseWhitespace(assistantMessage), 180);
  }

  const prompt = pickString(payload, ['prompt', 'user_prompt', 'userPrompt']);
  if (prompt) {
    return `Completed: ${truncate(collapseWhitespace(prompt), 140)}`;
  }

  return DEFAULT_CODEX_MESSAGE;
}

function parseJsonObject(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStdin(stream) {
  if (!stream || stream.isTTY) return Promise.resolve('');
  if (stream.readableEnded) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.setEncoding?.('utf8');
    stream.on('data', (chunk) => chunks.push(String(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(chunks.join('')));
  });
}

function pickString(object, keys) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}

module.exports = {
  DEFAULT_CODEX_MESSAGE,
  DEFAULT_CODEX_TITLE,
  notifyCodexHook,
  buildCodexEvent,
  summarizeCodexPayload,
  parseJsonObject,
  readStdin,
  collapseWhitespace,
  truncate
};
