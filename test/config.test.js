const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSoundOption } = require('../src/config');

test('parses notification sound option values', () => {
  assert.equal(parseSoundOption(undefined, false), false);
  assert.equal(parseSoundOption(true, false), 'Glass');
  assert.equal(parseSoundOption('1', false), 'Glass');
  assert.equal(parseSoundOption('Ping', false), 'Ping');
  assert.equal(parseSoundOption('silent', 'Glass'), false);
  assert.equal(parseSoundOption(false, 'Glass'), false);
});
