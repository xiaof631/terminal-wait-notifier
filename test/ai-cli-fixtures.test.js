const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  JSON_SETTINGS_INTEGRATIONS,
  mergeHookIntoSettings
} = require('../src/ai-cli-integrations');
const {
  getUserStopHooks,
  mergeCodexStopHooks
} = require('../src/codex-install-hook');
const { buildAiCliEvent } = require('../src/ai-hook-notify');
const { buildCodexEvent } = require('../src/codex-notify');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'ai-cli-hooks');

function readFixture(cli, name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, cli, name), 'utf8'));
}

function countCommand(groups, command) {
  return groups.reduce((count, group) => (
    count + group.hooks.filter((hook) => hook.command === command).length
  ), 0);
}

test('Codex fixture documents app-server Stop hook merge and payload summary', () => {
  const settings = readFixture('codex', 'settings.json');
  const expected = readFixture('codex', 'settings-merged.json');
  const payload = readFixture('codex', 'payload.json');

  const merged = mergeCodexStopHooks(getUserStopHooks(settings));
  const event = buildCodexEvent(payload);

  assert.deepEqual(merged, expected);
  assert.equal(countCommand(merged, 'twn codex-hook'), 1);
  assert.equal(event.title, 'Codex');
  assert.equal(event.message, 'All Codex edits are complete. Tests passed.');
  assert.equal(event.cwd, '/tmp/codex-project');
  assert.equal(event.meta.eventName, 'stop');
  assert.equal(event.meta.sessionId, 'codex-session-1');
  assert.equal(event.meta.turnId, 'codex-turn-1');
  assert.equal(event.meta.transcriptPath, '/tmp/codex-transcript.jsonl');
});

const JSON_CLI_EXPECTATIONS = {
  qwen: {
    title: 'Qwen Code',
    message: 'Qwen finished the requested checks.',
    cwd: '/tmp/qwen-project',
    eventName: 'Stop'
  },
  gemini: {
    title: 'Gemini CLI',
    message: 'Gemini summary is ready.',
    cwd: '/tmp/gemini-project',
    eventName: 'AfterAgent'
  },
  claude: {
    title: 'Claude Code',
    message: 'Completed: write release notes',
    cwd: '/tmp/claude-project',
    eventName: 'Stop'
  },
  qoder: {
    title: 'Qoder CLI',
    message: 'Qoder completed the implementation pass.',
    cwd: '/tmp/qoder-project',
    eventName: 'Stop'
  }
};

for (const [cli, expectation] of Object.entries(JSON_CLI_EXPECTATIONS)) {
  test(`${cli} fixture documents JSON settings merge and payload summary`, () => {
    const settings = readFixture(cli, 'settings.json');
    const expected = readFixture(cli, 'settings-merged.json');
    const payload = readFixture(cli, 'payload.json');
    const integration = JSON_SETTINGS_INTEGRATIONS[cli];

    const merged = mergeHookIntoSettings(settings, integration);
    const event = buildAiCliEvent(cli, payload);

    assert.deepEqual(merged, expected);
    assert.equal(countCommand(merged.hooks[integration.eventName], integration.command), 1);
    assert.equal(event.title, expectation.title);
    assert.equal(event.message, expectation.message);
    assert.equal(event.cwd, expectation.cwd);
    assert.equal(event.meta.eventName, expectation.eventName);
  });
}
