'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DebouncedReads } = require('../src/debounce');

test('a 10,000-file burst keeps only the latest bounded batch and uses one timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const timer = global.setTimeout;
  let timers = 0;
  t.mock.method(global, 'setTimeout', (...args) => { timers++; return timer(...args); });
  const ready = [];
  const dropped = [];
  const reads = new DebouncedReads(batch => ready.push(...batch), key => dropped.push(key));
  t.after(() => reads.clear());
  for (let i = 0; i < 10000; i++) reads.schedule(String(i), i);
  assert.equal(reads.pending.size, 256);
  assert.equal(timers, 1);
  assert.equal(dropped.length, 9744);
  t.mock.timers.tick(90);
  assert.deepEqual(ready, Array.from({ length: 256 }, (_, i) => 9744 + i));
  assert.equal(reads.pending.size, 0);
});

test('repeated saves debounce per file without delaying other files', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const ready = [];
  const reads = new DebouncedReads(batch => ready.push(...batch), () => assert.fail('coalescing is not overflow'));
  t.after(() => reads.clear());
  reads.schedule('a', 'old a');
  reads.schedule('b', 'b');
  t.mock.timers.tick(80);
  reads.schedule('a', 'new a');
  t.mock.timers.tick(10);
  assert.deepEqual(ready, ['b']);
  t.mock.timers.tick(80);
  assert.deepEqual(ready, ['b', 'new a']);
  reads.schedule('deleted', 'deleted');
  reads.delete('deleted');
  reads.schedule('reset', 'reset');
  reads.clear();
  t.mock.timers.tick(1000);
  assert.deepEqual(ready, ['b', 'new a']);
});
