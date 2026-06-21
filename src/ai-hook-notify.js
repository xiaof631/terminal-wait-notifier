const { sendNotification } = require('./notify');
const {
  collapseWhitespace,
  parseJsonObject,
  readStdin,
  truncate
} = require('./codex-notify');

const AI_CLI_LABELS = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  qoder: 'Qoder CLI',
  qwen: 'Qwen Code'
};

async function notifyAiCliHook(options = {}) {
  const cli = normalizeCliName(options.cli);
  const stdin = options.stdin || process.stdin;
  const raw = await readStdin(stdin);
  const payload = parseJsonObject(raw);
  const event = buildAiCliEvent(cli, payload, {
    cwd: options.cwd || process.cwd(),
    title: options.title,
    message: options.message
  });
  const notifier = options.sendNotification || sendNotification;

  await notifier(event, options.notifyOptions || {});
  return event;
}

function buildAiCliEvent(cli, payload = {}, context = {}) {
  const label = AI_CLI_LABELS[cli] || cli;
  const eventName = pickString(payload, [
    'hook_event_name',
    'hookEventName',
    'eventName',
    'event',
    'hookEvent'
  ]) || 'task-complete';
  const cwd = pickString(payload, ['cwd', 'workdir', 'workspace', 'project_dir']) || context.cwd || process.cwd();

  return {
    event: `${cli}-task-complete`,
    level: payload.error ? 'error' : 'info',
    title: context.title || label,
    message: context.message || summarizeAiCliPayload(cli, payload),
    cwd,
    meta: {
      cli,
      eventName,
      sessionId: pickString(payload, ['session_id', 'sessionId']),
      turnId: pickString(payload, ['turn_id', 'turnId']),
      transcriptPath: pickString(payload, ['transcript_path', 'transcriptPath']),
      rawKeys: Object.keys(payload).slice(0, 20)
    }
  };
}

function summarizeAiCliPayload(cli, payload = {}) {
  const directMessage = pickString(payload, [
    'last_assistant_message',
    'lastAssistantMessage',
    'prompt_response',
    'promptResponse',
    'assistant_message',
    'assistantMessage',
    'response',
    'message',
    'summary'
  ]);
  if (directMessage) {
    return truncate(collapseWhitespace(directMessage), 180);
  }

  const error = pickString(payload, ['error', 'error_details', 'errorDetails']);
  if (error) {
    return `Ended with error: ${truncate(collapseWhitespace(error), 140)}`;
  }

  const prompt = pickString(payload, ['prompt', 'user_prompt', 'userPrompt']);
  if (prompt) {
    return `Completed: ${truncate(collapseWhitespace(prompt), 140)}`;
  }

  const label = AI_CLI_LABELS[cli] || cli;
  return `${label} task completed`;
}

function normalizeCliName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('Missing CLI name. Use: twn ai-hook --cli <codex|qwen|gemini|claude|qoder>');
  }
  if (normalized === 'claude-code') return 'claude';
  if (normalized === 'qwen-code') return 'qwen';
  if (normalized === 'gemini-cli') return 'gemini';
  if (normalized === 'qodercli') return 'qoder';
  return normalized;
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

module.exports = {
  AI_CLI_LABELS,
  notifyAiCliHook,
  buildAiCliEvent,
  summarizeAiCliPayload,
  normalizeCliName
};
