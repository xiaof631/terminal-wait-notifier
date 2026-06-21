const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PromptDetector, detectPrompt, stripAnsi } = require('../src/prompt-detector');

const fixturePath = path.join(__dirname, 'fixtures', 'prompt-detector', 'cases.json');

test('detects yes/no prompts', () => {
  const result = detectPrompt('Do you want to continue? [y/N]');
  assert.equal(result.detected, true);
  assert.equal(result.name, 'yes_no');
});

test('detects Chinese confirmation prompts', () => {
  const result = detectPrompt('是否继续执行？');
  assert.equal(result.detected, true);
  assert.equal(result.name, 'chinese_confirmation');
});

test('detects prompts split across output chunks', () => {
  const detector = new PromptDetector();
  assert.equal(detector.push('Deploy to production? [').detected, false);
  assert.equal(detector.push('y/N] ').detected, true);
});

test('does not flag ordinary command output', () => {
  const result = detectPrompt('Installing packages\nDone in 1.2s\n');
  assert.equal(result.detected, false);
});

test('strips ANSI escape sequences before matching', () => {
  const result = detectPrompt('\u001b[33mAre you sure?\u001b[0m');
  assert.equal(result.detected, true);
  assert.equal(stripAnsi('\u001b[31mred\u001b[0m'), 'red');
});

test('detects prompt fixtures from common terminal tools', () => {
  const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  for (const item of cases) {
    const result = detectPrompt(item.output);
    assert.equal(result.detected, true, item.name);
    assert.equal(result.name, item.detector, item.name);
    assert.ok(result.sample.length <= 260, item.name);
  }
});
