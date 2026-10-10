'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceFiles, DIRECTORY_LIMIT } = require('../src/source-scan');
const { createVscodeMock } = require('./helpers/vscode');

test('startup streams across roots, skips symlinks, and stops at the eligible file limit', async () => {
  const mock = createVscodeMock();
  const second = { uri: mock.vscode.Uri.file('/other'), name: 'other' };
  mock.vscode.workspace.workspaceFolders.push(second);
  mock.hooks.readDirectory = async uri => uri.path === '/workspace'
    ? [['excluded.map', 1], ['linked', 66], ['first.js', 1]]
    : uri.path === '/other' ? [['second.js', 1], ['third.js', 1]]
      : assert.fail('directory symlinks must not be followed');
  const found = [];
  for await (const uri of sourceFiles(mock.vscode, mock.vscode.workspace.workspaceFolders,
    uri => uri.path.endsWith('.map'), 2, () => true)) found.push(uri.path);
  assert.deepEqual(found, ['/workspace/first.js', '/other/second.js']);
});

test('startup directory traversal remains bounded even with no eligible files', async () => {
  const mock = createVscodeMock();
  let calls = 0;
  mock.hooks.readDirectory = async uri => {
    calls++;
    return uri.path === '/workspace'
      ? Array.from({ length: DIRECTORY_LIMIT + 100 }, (_, i) => [`empty-${i}`, 2]) : [];
  };
  const found = [];
  for await (const uri of sourceFiles(mock.vscode, mock.vscode.workspace.workspaceFolders,
    () => false, 1200, () => true)) found.push(uri);
  assert.equal(calls, DIRECTORY_LIMIT);
  assert.equal(found.length, 0);
});
