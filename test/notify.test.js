const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { darwinAlertScript, darwinSoundPath } = require('../src/notify');

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

test('builds macOS alert script with timeout', () => {
  assert.equal(
    darwinAlertScript({ title: 'Done', message: 'Build finished' }, 7),
    'display alert "Done" message "Build finished" as informational giving up after 7'
  );
  assert.match(
    darwinAlertScript({ title: 'Quote "test"', message: 'Path C:\\tmp' }, 0),
    /giving up after 1$/
  );
});
