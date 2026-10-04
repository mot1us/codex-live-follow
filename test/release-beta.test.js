'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { releaseBeta } = require('../scripts/release-beta');
const manifest = require('../package.json');

const env = {
  GITHUB_REPOSITORY: 'mot1us/codex-live-follow',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main'
};
const missingRelease = { status: 1, stderr: 'release not found' };
const missingTag = { status: 1, stderr: 'HTTP 404: Not Found' };

function fixture(t, replies = [missingRelease, missingTag, { status: 0, stdout: 'release URL' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-follow-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist'));
  const assets = [`specter-${manifest.version}.vsix`,
    `specter-${manifest.version}.vsix.sha256`,
    'inspect-line.js', 'inspect-line.js.sha256', 'inspection-setup.md'];
  for (const name of assets) fs.writeFileSync(path.join(root, 'dist', name), 'test fixture');
  const calls = [];
  const options = { root, env, log() {}, run(args) { calls.push(args); return replies[calls.length - 1]; } };
  return { root, calls, options };
}

test('beta publication is limited to an exact main push in the owner repository', () => {
  for (const change of [{ GITHUB_REPOSITORY: 'other/fork' }, { GITHUB_SHA: 'main' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/feature' }]) {
    assert.throws(() => releaseBeta({ env: { ...env, ...change }, run() { assert.fail('gh must not run'); } }), /exact commit/);
  }
});

test('reruns preserve existing public releases and drafts without upload', t => {
  for (const isDraft of [false, true]) {
    const { options, calls } = fixture(t, [{ status: 0, stdout: JSON.stringify({ isDraft }) }]);
    releaseBeta(options);
    assert.equal(calls.length, 1);
  }
});

test('lookup errors and conflicting tags cannot publish a release', t => {
  for (const replies of [
    [{ status: 1, stderr: 'authentication token not found' }],
    [missingRelease, { status: 1, stderr: 'HTTP 403: Forbidden' }],
    [missingRelease, { status: 0, stdout: JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } }) }]
  ]) {
    const { options, calls } = fixture(t, replies);
    assert.throws(() => releaseBeta(options));
    assert.equal(calls.some(args => args[0] === 'release' && args[1] === 'create'), false);
  }
});

test('missing assets stop publication', t => {
  const { root, options, calls } = fixture(t);
  fs.unlinkSync(path.join(root, 'dist', 'inspect-line.js'));
  assert.throws(() => releaseBeta(options));
  assert.equal(calls.length, 2);
});

test('new beta targets the tested commit and includes every public asset', t => {
  const { options, calls, root } = fixture(t);
  releaseBeta(options);
  const create = calls[2];
  assert.deepEqual(create.slice(0, 3), ['release', 'create', `v${manifest.version}`]);
  assert.equal(create[create.indexOf('--target') + 1], env.GITHUB_SHA);
  assert.ok(create.includes('--prerelease'));
  assert.ok(create.includes('--latest=false'));
  assert.equal(create.includes('--draft'), false);
  for (const name of fs.readdirSync(path.join(root, 'dist'))) assert.ok(create.includes(path.join(root, 'dist', name)));
  assert.deepEqual(create.slice(-2), ['--repo', env.GITHUB_REPOSITORY]);
});
