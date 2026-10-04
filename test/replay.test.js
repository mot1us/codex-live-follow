'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { makeReplayPlan } = require('../src/replay');

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
