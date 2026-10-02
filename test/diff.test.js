'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { changedHunks } = require('../src/diff');

test('finds a changed line in the middle of a file', () => {
  assert.deepEqual(changedHunks('a\nb\nc', 'a\nB\nc'), [{ start: 1, end: 2 }]);
});

test('finds separate changes without highlighting unchanged middle lines', () => {
  assert.deepEqual(
    changedHunks('a\nb\nc\nd\ne', 'a\nB\nc\nd\nE'),
    [{ start: 1, end: 2 }, { start: 4, end: 5 }]
  );
});

test('shows the adjacent line for a deletion', () => {
  assert.deepEqual(changedHunks('a\nb\nc', 'a\nc'), [{ start: 1, end: 2 }]);
});

test('detects a new file and ignores unchanged text', () => {
  assert.deepEqual(changedHunks('', 'let x = 1;\n'), [{ start: 0, end: 1 }]);
  assert.deepEqual(changedHunks('same', 'same'), []);
});
