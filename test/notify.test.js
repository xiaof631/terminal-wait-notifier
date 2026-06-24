const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  darwinAlertScript,
  darwinSoundPath,
  buildTerminalNotifierArgs,
  darwinSoundName,
  mapTermProgram,
  resolveBundleIdFromEnv
} = require('../src/notify');

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

test('builds terminal-notifier args with activate bundle id and sound', () => {
  const event = { title: 'Done', message: 'Build ok', level: 'success' };
  assert.deepEqual(
    buildTerminalNotifierArgs(event, 'com.apple.Terminal', 'Glass'),
    [
      '-title', 'Done',
      '-message', 'Build ok',
      '-subtitle', 'success',
      '-ignoreDnD',
      '-activate', 'com.apple.Terminal',
      '-sound', 'Glass'
    ]
  );
});

test('omits activate when no bundle id and skips empty sound', () => {
  assert.deepEqual(
    buildTerminalNotifierArgs({ title: 'T', message: 'm', level: 'info' }, undefined, undefined),
    ['-title', 'T', '-message', 'm', '-subtitle', 'info', '-ignoreDnD']
  );
});

test('normalizes sound name for terminal-notifier', () => {
  assert.equal(darwinSoundName('Glass'), 'Glass');
  assert.equal(darwinSoundName('Ping.aiff'), 'Ping');
  assert.equal(darwinSoundName('/tmp/custom.wav'), 'Glass');
  assert.equal(darwinSoundName(''), undefined);
});

test('maps known terminal program names to bundle ids', () => {
  assert.equal(mapTermProgram('Apple_Terminal'), 'com.apple.Terminal');
  assert.equal(mapTermProgram('iTerm.app'), 'com.googlecode.iterm2');
  assert.equal(mapTermProgram('vscode'), 'com.microsoft.VSCode');
  assert.equal(mapTermProgram('WarpTerminal'), 'dev.warp.Warp-Stable');
  assert.equal(mapTermProgram('UnknownApp'), undefined);
  assert.equal(mapTermProgram(undefined), undefined);
});

test('resolves bundle id from env with the documented priority', () => {
  assert.equal(resolveBundleIdFromEnv({ TWN_TERMINAL_BUNDLE_ID: 'com.x.Y' }), 'com.x.Y');
  assert.equal(
    resolveBundleIdFromEnv({ TWN_TERMINAL_BUNDLE_ID: 'com.x.Y', __CFBundleIdentifier: 'com.a.B' }),
    'com.x.Y'
  );
  assert.equal(resolveBundleIdFromEnv({ __CFBundleIdentifier: 'com.a.B' }), 'com.a.B');
  assert.equal(resolveBundleIdFromEnv({ TERM_PROGRAM: 'iTerm.app' }), 'com.googlecode.iterm2');
  assert.equal(resolveBundleIdFromEnv({}), undefined);
});
