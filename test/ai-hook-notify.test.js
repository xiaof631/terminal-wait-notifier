const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');
const {
  buildAiCliEvent,
  normalizeCliName,
  notifyAiCliHook,
  summarizeAiCliPayload
} = require('../src/ai-hook-notify');

test('builds an AI CLI completion notification from hook payload', () => {
  const event = buildAiCliEvent('qwen', {
    hook_event_name: 'Stop',
    cwd: '/tmp/project',
    last_assistant_message: 'Done.\n\nTests passed.',
    session_id: 'session-1',
    transcript_path: '/tmp/transcript.jsonl'
  });

  assert.equal(event.event, 'qwen-task-complete');
  assert.equal(event.title, 'Qwen Code');
  assert.equal(event.message, 'Done. Tests passed.');
  assert.equal(event.cwd, '/tmp/project');
  assert.equal(event.meta.eventName, 'Stop');
  assert.equal(event.meta.sessionId, 'session-1');
  assert.equal(event.meta.transcriptPath, '/tmp/transcript.jsonl');
});

test('summarizes common AI CLI hook payload fields', () => {
  assert.equal(summarizeAiCliPayload('gemini', { prompt_response: 'All set' }), 'All set');
  assert.equal(summarizeAiCliPayload('claude', { error: 'Permission denied' }), 'Ended with error: Permission denied');
  assert.equal(summarizeAiCliPayload('qoder', { prompt: 'run tests' }), 'Completed: run tests');
  assert.equal(summarizeAiCliPayload('codex', {}), 'Codex task completed');
});

test('normalizes supported CLI aliases', () => {
  assert.equal(normalizeCliName('claude-code'), 'claude');
  assert.equal(normalizeCliName('qwen-code'), 'qwen');
  assert.equal(normalizeCliName('gemini-cli'), 'gemini');
  assert.equal(normalizeCliName('qodercli'), 'qoder');
});

test('notifyAiCliHook sends a normalized notification', async () => {
  const calls = [];
  const stdin = Readable.from(['{"prompt_response":"Done","cwd":"/tmp/gemini"}']);

  const event = await notifyAiCliHook({
    cli: 'gemini',
    stdin,
    sendNotification: async (...args) => calls.push(args)
  });

  assert.equal(event.message, 'Done');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].title, 'Gemini CLI');
  assert.equal(calls[0][0].cwd, '/tmp/gemini');
});
