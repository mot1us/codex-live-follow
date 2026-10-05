'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compileGlobs, escapeGlob } = require('../src/ignore');

test('ignore patterns match files and folders at the intended depth', () => {
  const match = compileGlobs(['**/*.map', 'generated/**', 'src/file?.js']);
  for (const path of ['index.map', 'a/b/index.map', 'generated', 'generated/deep/file.js', 'src/file1.js']) {
    assert.equal(match(path), true, path);
  }
  for (const path of ['src/file12.js', 'src/deep/file1.js', 'other/generated/file.js', 'index.map.js']) {
    assert.equal(match(path), false, path);
  }
});

test('right-click literal paths do not become wildcard exclusions', () => {
  const file = 'src/strange*file?.js';
  const match = compileGlobs([escapeGlob(file)]);
  assert.ok(match(file));
  assert.equal(match('src/strange-other-file1.js'), false);
  assert.equal(compileGlobs([null, 42, '', 'a'.repeat(1025)])('anything'), false);
});
