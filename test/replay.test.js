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
