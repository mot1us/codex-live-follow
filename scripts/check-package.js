'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listFiles, PackageManager } = require('@vscode/vsce');

const root = path.resolve(__dirname, '..');

async function checkPackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(manifest.name, /^[a-z0-9][a-z0-9-]*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  assert.ok(manifest.publisher, 'A publisher identity is required.');
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0,
    'Runtime dependencies require changing the dependency-free package setup.');

  // A release tag must match the manifest before we make its installable asset.
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`,
      'Release tags must be v<package.json version>.');
  }

  const files = (await listFiles({ cwd: root, packageManager: PackageManager.None }))
    .map(file => file.replace(/\\/g, '/')).sort();
  const allowed = /^(?:package\.json|README\.md|CHANGELOG\.md|LICENSE\.txt|SECURITY\.md|src\/(?:[\w-]+\/)*[\w.-]+\.js|assets\/(?:[\w-]+\/)*[\w.-]+\.(?:png|svg|gif|jpg|jpeg|css|js))$/;
  const unexpected = files.filter(file => !allowed.test(file));
  assert.deepEqual(unexpected, [], `Unexpected files in package: ${unexpected.join(', ')}`);

  const runtimeFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true })
    .filter(file => file.endsWith('.js'))
    .map(file => `src/${file.replace(/\\/g, '/')}`);
  const required = ['package.json', 'README.md', 'LICENSE.txt',
    manifest.main.replace(/^\.\//, ''), ...runtimeFiles];
  required.push('assets/sidebar.js', 'assets/sidebar.css', 'assets/sidebar.svg');
  if (manifest.icon) required.push(manifest.icon.replace(/^\.\//, ''));
  for (const file of required) {
    assert.ok(files.includes(file), `Required extension file is missing: ${file}`);
  }
  console.log(`Package contents verified: ${files.length} files, no development dependencies or local artifacts.`);
  return { root, manifest, files };
}

if (require.main === module) {
  checkPackage().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { checkPackage };
