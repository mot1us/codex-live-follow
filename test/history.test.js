'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RecentEdits } = require('../src/history');

test('recent source snapshots stay within both limits and clear completely', () => {
  const history = new RecentEdits();
  for (let i = 0; i < 30; i++) history.add({ uri: i, before: 'a', after: 'b', bytes: 2 });
  assert.equal(history.entries.length, 20);
  assert.equal(history.bytes, 40);
  const newest = history.entries[0];
  history.markSkipped(newest.id);
  assert.equal(history.get(newest.id).skipped, true);
  history.add({ uri: 'large', before: '', after: '', bytes: 4 * 1024 * 1024 });
  assert.equal(history.entries.length, 1);
  assert.equal(history.add({ bytes: 4 * 1024 * 1024 + 1 }), undefined);
  history.clear();
  assert.equal(history.bytes, 0);
  assert.equal(history.entries.length, 0);
  assert.equal(history.get(newest.id), undefined);
});
