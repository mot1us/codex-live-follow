'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareSetup, applySetup, HELPER } = require('../src/setup');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'specter-setup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const helper = await fs.readFile(path.join(__dirname, '../src/inspection-helper.js'), 'utf8');
  return { root, helper };
}

test('guided setup preserves project instructions and ignore rules, and is idempotent', async t => {
  const { root, helper } = await fixture(t);
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# My project\r\nKeep these instructions.\r\n');
  await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\n');
  const changes = await prepareSetup(root, helper);
  await applySetup(root, changes);
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith('# My project\r\nKeep these instructions.\r\n'));
  assert.ok(agents.includes('node .specter/inspect-line.cjs'));
  assert.equal(agents.replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), 'node_modules/\n.codex-live-follow/\n');
  assert.equal(await fs.readFile(path.join(root, HELPER), 'utf8'), helper);
  assert.deepEqual(await prepareSetup(root, helper), []);
});

test('setup refuses conflicting helpers and symlinks before updating any instructions', async t => {
  const { root, helper } = await fixture(t);
  await fs.mkdir(path.join(root, '.specter'));
  await fs.writeFile(path.join(root, HELPER), '// custom helper');
  await assert.rejects(prepareSetup(root, helper), /different/);
  await fs.unlink(path.join(root, HELPER));
  await fs.writeFile(path.join(root, 'outside.md'), 'Leave me alone');
  try { await fs.symlink(path.join(root, 'outside.md'), path.join(root, 'AGENTS.md')); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  await assert.rejects(prepareSetup(root, helper), /regular file/);
  assert.equal(await fs.readFile(path.join(root, 'outside.md'), 'utf8'), 'Leave me alone');
  await fs.unlink(path.join(root, 'AGENTS.md'));
  await fs.rmdir(path.join(root, '.specter'));
  await fs.symlink(root, path.join(root, '.specter'), 'dir');
  await assert.rejects(prepareSetup(root, helper), /regular folder/);
});

test('setup refuses a project file edited while its confirmation was open', async t => {
  const { root, helper } = await fixture(t);
  const changes = await prepareSetup(root, helper);
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'New user instructions');
  await assert.rejects(applySetup(root, changes), /changed during setup/);
  assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), 'New user instructions');
  await assert.rejects(fs.stat(path.join(root, HELPER)), /ENOENT/);
});
