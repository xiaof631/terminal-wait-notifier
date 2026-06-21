const assert = require('node:assert/strict');
const test = require('node:test');
const { detectPrompt } = require('../src/prompt-detector');
const {
  formatCommand,
  formatDuration,
  formatPromptNotificationMessage,
  shellQuote,
  signalToExitCode
} = require('../src/run-command');

test('formats commands with shell quoting', () => {
  assert.equal(formatCommand(['npm', 'run', 'build']), 'npm run build');
  assert.equal(formatCommand(['node', '-e', 'console.log("ok")']), 'node -e \'console.log("ok")\'');
});

test('formats shell commands without extra quoting', () => {
  assert.equal(formatCommand(['npm test && npm run build'], { shell: true }), 'npm test && npm run build');
});

test('quotes single quotes safely', () => {
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test('formats durations', () => {
  assert.equal(formatDuration(2400), '2s');
  assert.equal(formatDuration(62_000), '1m 2s');
  assert.equal(formatDuration(3_600_000), '1h');
});

test('maps signals to shell-style exit codes', () => {
  assert.equal(signalToExitCode('SIGINT'), 130);
  assert.equal(signalToExitCode(undefined), 1);
});

test('formats waiting-input notification with detector name and truncated sample', () => {
  const detection = detectPrompt(`${'output '.repeat(40)}Are you sure you want to continue? ${'more '.repeat(80)}`);
  const message = formatPromptNotificationMessage('deploy', detection);

  assert.equal(detection.name, 'english_confirmation');
  assert.ok(detection.sample.length <= 260);
  assert.match(message, /^deploy may be waiting for input \(english_confirmation\): /);
  assert.ok(message.includes(detection.sample));
});
