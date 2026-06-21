const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');
const {
  buildCodexEvent,
  notifyCodexHook,
  parseJsonObject,
  summarizeCodexPayload
} = require('../src/codex-notify');

test('builds a Codex completion notification from hook payload', () => {
  const event = buildCodexEvent({
    eventName: 'stop',
    cwd: '/tmp/project',
    last_assistant_message: 'Done.\n\nTests passed.',
    sessionId: 'session-1',
    turnId: 'turn-1'
  });

  assert.equal(event.event, 'codex-stop');
  assert.equal(event.title, 'Codex');
  assert.equal(event.message, 'Done. Tests passed.');
  assert.equal(event.cwd, '/tmp/project');
  assert.equal(event.meta.sessionId, 'session-1');
  assert.equal(event.meta.turnId, 'turn-1');
});

test('falls back to prompt or default message', () => {
  assert.equal(summarizeCodexPayload({ prompt: 'run the test suite' }), 'Completed: run the test suite');
  assert.equal(summarizeCodexPayload({}), 'Codex task completed');
});

test('ignores invalid hook JSON', () => {
  assert.deepEqual(parseJsonObject('{not json'), {});
  assert.deepEqual(parseJsonObject('[]'), {});
});

test('notifyCodexHook sends a normalized notification', async () => {
  const calls = [];
  const stdin = Readable.from(['{"lastAssistantMessage":"All set","cwd":"/tmp/codex"}']);

  const event = await notifyCodexHook({
    stdin,
    sendNotification: async (...args) => calls.push(args)
  });

  assert.equal(event.message, 'All set');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].cwd, '/tmp/codex');
});
