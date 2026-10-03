'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { downloadHost } = require('../scripts/download-host');

test('host download retries a transient network timeout and returns the executable', async () => {
  let calls = 0;
  const delays = [];
  const executable = await downloadHost('1.96.0', {
    async download(options) {
      assert.equal(options.version, '1.96.0');
      if (++calls === 1) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      return '/test/code';
    },
    wait: async ms => delays.push(ms), log() {}
  });
  assert.equal(executable, '/test/code');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
});

test('persistent download failures stop after three attempts', async () => {
  let calls = 0;
  await assert.rejects(downloadHost('stable', {
    async download() { calls++; throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); },
    wait: async () => {}, log() {}
  }), /timeout/);
  assert.equal(calls, 3);
});

test('non-network download errors fail immediately', async () => {
  let calls = 0;
  await assert.rejects(downloadHost('unknown', {
    async download() { calls++; throw new Error('Invalid version'); },
    wait: async () => assert.fail('no retry'), log() {}
  }), /Invalid version/);
  assert.equal(calls, 1);
});
