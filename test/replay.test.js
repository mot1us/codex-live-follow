'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { makeReplayPlan, makeReplayStages } = require('../src/replay');

test('replays a new file from empty content', () => {
  assert.deepEqual(makeReplayPlan('', '<h1>Hi</h1>'), {
    head: '', typed: Array.from('<h1>Hi</h1>'), tail: ''
  });
});

test('replays only changed characters in an existing file', () => {
  const plan = makeReplayPlan('let value = 1;\n', 'let value = 42;\n');
  assert.equal(plan.head, 'let value = ');
  assert.deepEqual(plan.typed, ['4', '2']);
  assert.equal(plan.tail, ';\n');
});

test('keeps Unicode characters intact', () => {
  const plan = makeReplayPlan('Hello\n', 'Hello 🌱\n');
  assert.deepEqual(plan.typed, [' ', '🌱']);
  assert.equal(plan.head + plan.typed.join('') + plan.tail, 'Hello 🌱\n');
});

test('changing either half of an emoji replays the whole character', () => {
  for (const [before, after] of [
    ['😀', '😁'], ['\u{1f600}', '\u{1fa00}'],
    ['\ud83d', '😀'], ['😀', '\ud83d'], ['\ude00', '😀'], ['😀', '\ude00']
  ]) {
    const plan = makeReplayPlan(`a${before}z`, `a${after}z`);
    assert.equal(plan.head, 'a');
    assert.deepEqual(plan.typed, Array.from(after));
    assert.equal(plan.tail, 'z');
  }
});

test('small changes in large files keep unchanged text out of the typing sequence', () => {
  const head = 'a'.repeat(200000);
  const tail = '🌱'.repeat(40000);
  const plan = makeReplayPlan(`${head}old${tail}`, `${head}new${tail}`);
  assert.equal(plan.head, head);
  assert.deepEqual(plan.typed, ['n', 'e', 'w']);
  assert.equal(plan.tail, tail);
});

test('separate blocks never type or remove the unchanged lines between them', () => {
  const before = 'const a = 1;\n// keep this exact line\nconst b = 2;\n';
  const after = 'const a = 42;\n// keep this exact line\nconst b = 99;\n';
  const stages = makeReplayStages(before, after);
  assert.equal(stages.length, 2);
  assert.equal(stages.flatMap(stage => stage.typed).join(''), '4299');
  let text = before;
  for (const stage of stages) {
    const head = text.slice(0, stage.start);
    const tail = text.slice(stage.start + stage.deleteCount);
    for (let i = 0; i <= stage.typed.length; i++) {
      text = head + stage.typed.slice(0, i).join('') + tail;
      assert.ok(text.includes('// keep this exact line\n'));
    }
  }
  assert.equal(text, after);
});

test('block offsets reconstruct insertions, deletions, CRLF, Unicode, and bounded fallback', () => {
  const cases = [
    ['a\nb\nc\nd\n', 'a\ninsert\nb\nc\nD\n'],
    ['a\nb\nc\nd\n', 'a\nc\nD\n'],
    ['a\r\nb\r\nc\r\n', 'A🌱\r\nb\r\nC😀\r\n'],
    ['a\r\nb\n', 'a\nb\r\n'], ['', 'hello\n'], ['hello\n', ''],
    ['😀\nsame\n😁', '😁\nsame\n😀']
  ];
  // Many repeated lines exercise ambiguous LCS matches and changing offsets.
  for (let i = 0; i < 100; i++) {
    const lines = Array.from({ length: 20 }, (_, j) => `${(i + j * 7) % 9}\n`);
    const changed = [...lines];
    changed.splice(i % 20, i % 4, 'new\n', '🌱\n');
    changed[(i + 11) % changed.length] = 'changed\n';
    cases.push([lines.join(''), changed.join('')]);
  }
  cases.push(['old\n'.repeat(500), 'new\n'.repeat(500)]);
  for (const [before, after] of cases) {
    let text = before;
    for (const stage of makeReplayStages(before, after)) {
      text = text.slice(0, stage.start) + stage.typed.join('') + text.slice(stage.start + stage.deleteCount);
    }
    assert.equal(text, after);
  }
  assert.ok(makeReplayStages(cases.at(-1)[0], cases.at(-1)[1])[0].coarse);
});

test('oversized and coarse replays return changed ranges without character arrays', () => {
  for (const [before, after, limit] of [
    ['', 'x'.repeat(4 * 1024 * 1024), 20000],
    ['a\nsame\nb\n', 'x'.repeat(80) + '\nsame\n' + 'y'.repeat(80) + '\n', 100],
    ['old\n'.repeat(500), 'new\n'.repeat(500), 20000]
  ]) {
    const stages = makeReplayStages(before, after, limit);
    assert.ok(stages.length > 0);
    assert.ok(stages.every(stage => stage.limited));
    assert.equal(stages.flatMap(stage => stage.typed).length, 0);
    assert.ok(stages.every(stage => stage.hunk.end > stage.hunk.start));
  }
});

test('typing limits count Unicode characters across all changed blocks', () => {
  const before = 'old\nsame\nold\n';
  const after = '🌱🌱\nsame\n🌱🌱\n';
  const allowed = makeReplayStages(before, after, 4);
  assert.equal(allowed.flatMap(stage => stage.typed).length, 4);
  let text = before;
  for (const stage of allowed) {
    text = text.slice(0, stage.start) + stage.typed.join('') + text.slice(stage.start + stage.deleteCount);
  }
  assert.equal(text, after);
  assert.ok(makeReplayStages(before, after, 3).every(stage => stage.limited));
});
