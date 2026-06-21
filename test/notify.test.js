const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { darwinSoundPath } = require('../src/notify');

test('resolves macOS system notification sound names', () => {
  assert.equal(
    darwinSoundPath('Glass'),
    path.join('/System/Library/Sounds', 'Glass.aiff')
  );
  assert.equal(
    darwinSoundPath('Ping.aiff'),
    path.join('/System/Library/Sounds', 'Ping.aiff')
  );
  assert.equal(darwinSoundPath('/tmp/custom.wav'), '/tmp/custom.wav');
});
