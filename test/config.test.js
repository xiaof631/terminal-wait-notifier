const assert = require('node:assert/strict');
const test = require('node:test');
const { buildNotifyOptions, parseSoundOption } = require('../src/config');

test('parses notification sound option values', () => {
  assert.equal(parseSoundOption(undefined, false), false);
  assert.equal(parseSoundOption(true, false), 'Glass');
  assert.equal(parseSoundOption('1', false), 'Glass');
  assert.equal(parseSoundOption('Ping', false), 'Ping');
  assert.equal(parseSoundOption('silent', 'Glass'), false);
  assert.equal(parseSoundOption(false, 'Glass'), false);
});

test('builds alert notification options', () => {
  assert.equal(buildNotifyOptions({ alert: true }).alert, true);
  assert.equal(buildNotifyOptions({ alert: false }).alert, false);
  assert.equal(buildNotifyOptions({ alert: true, alertTimeoutSeconds: 4 }).alertTimeoutSeconds, 4);
});

test('activates the terminal by default and respects override flags', () => {
  assert.equal(buildNotifyOptions({}).activate, true);
  assert.equal(buildNotifyOptions({ activate: false }).activate, false);
  assert.equal(buildNotifyOptions({ activate: true }).activate, true);
});

test('passes through the terminal bundle id override', () => {
  assert.equal(buildNotifyOptions({ terminalBundleId: 'com.example.Term' }).terminalBundleId, 'com.example.Term');
  assert.equal(buildNotifyOptions({}).terminalBundleId, undefined);
});
