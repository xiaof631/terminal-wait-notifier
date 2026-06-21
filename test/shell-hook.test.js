const assert = require('node:assert/strict');
const test = require('node:test');
const { renderShellHook } = require('../src/shell-hook');

test('zsh hook includes tw shortcut and duplicate guard', () => {
  const hook = renderShellHook('zsh', { minSeconds: 5, webhook: false });
  assert.match(hook, /tw\(\) \{/);
  assert.match(hook, /command twn run --min-seconds 5 --no-webhook -- "\$@"/);
  assert.match(hook, /tw\\ \*/);
  assert.match(hook, /elapsed >= 5/);
});

test('bash hook includes tw shortcut and wrapped-command guard', () => {
  const hook = renderShellHook('bash', { minSeconds: 7, desktop: false });
  assert.match(hook, /tw\(\) \{/);
  assert.match(hook, /TWN_WRAPPED_RUNNING=1\n  command twn run --min-seconds 7 --no-desktop -- "\$@"/);
  assert.match(hook, /twn run/);
  assert.match(hook, /elapsed >= 7/);
});

test('fish hook includes tw shortcut and duplicate guard', () => {
  const hook = renderShellHook('fish', { minSeconds: 9, bell: true });
  assert.match(hook, /function tw/);
  assert.match(hook, /command twn run --min-seconds 9 --bell -- \$argv/);
  assert.match(hook, /string match -qr/);
  assert.match(hook, /test "\$elapsed" -ge 9/);
});
