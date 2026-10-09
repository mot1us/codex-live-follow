'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ReadPool } = require('../src/read-pool');
const { deferred, until } = require('./helpers/vscode');

test('superseded waiting reads settle immediately while a worker remains blocked', async t => {
  const pool = new ReadPool(1, 4);
  const gate = deferred();
  t.after(() => { pool.dispose(); gate.resolve(); });
  const active = pool.run(() => gate.promise, () => true);
  let revision = 0;
  let reads = 0;
  const requests = [];
  for (let i = 1; i <= 1000; i++) {
    revision = i;
    requests.push(pool.run(() => { reads++; return i; }, () => i === revision, 'same-file'));
  }
  assert.equal(pool.pending.size, 1);
  assert.deepEqual(await Promise.all(requests.slice(0, -1)), Array(999).fill(null));
  assert.equal(reads, 0, 'old requests settle without waiting for or starting I/O');
  gate.resolve('active');
  assert.equal(await requests.at(-1), 1000);
  assert.equal(await active, 'active');
  assert.equal(reads, 1);
});

test('distinct waiting reads stay bounded and overflow drops the oldest waiting work', async t => {
  const pool = new ReadPool(2, 3);
  const gate = deferred();
  t.after(() => { pool.dispose(); gate.resolve(); });
  const active = [pool.run(() => gate.promise, () => true), pool.run(() => gate.promise, () => true)];
  const dropped = [];
  const reads = [];
  const requests = Array.from({ length: 8 }, (_, i) => pool.run(() => {
    reads.push(i);
    return i;
  }, () => true, `file-${i}`, () => dropped.push(i)));
  assert.equal(pool.pending.size, 3);
  assert.deepEqual(dropped, [0, 1, 2, 3, 4]);
  assert.deepEqual(await Promise.all(requests.slice(0, 5)), Array(5).fill(null));
  gate.resolve();
  await Promise.all(active);
  assert.deepEqual(await Promise.all(requests.slice(5)), [5, 6, 7]);
  assert.deepEqual(reads, [5, 6, 7]);
  await until(() => pool.active === 0);
});
