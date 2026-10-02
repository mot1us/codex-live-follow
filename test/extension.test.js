'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { LiveFollow } = require('../src/controller');
const { createVscodeMock } = require('./helpers/vscode');

test('the VS Code entry point registers commands and disposes its controller', async t => {
  const mock = createVscodeMock();
  const extensionPath = require.resolve('../src/extension');
  const originalLoad = Module._load;
  delete require.cache[extensionPath];
  let extension;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === 'vscode') return mock.vscode;
      return originalLoad.call(this, request, parent, isMain);
    };
    extension = require(extensionPath);
  } finally {
    Module._load = originalLoad;
  }
  t.after(() => {
    extension.deactivate();
    mock.dispose();
    delete require.cache[extensionPath];
  });

  await extension.activate(mock.context);
  const controller = mock.context.subscriptions.find(item => item instanceof LiveFollow);
  assert.ok(controller, 'controller must be registered with the extension context for cleanup');
  assert.ok(mock.commands.has('codexLiveFollow.toggle'));
  assert.ok(mock.commands.has('codexLiveFollow.controls'));
  assert.ok(mock.commands.has('codexLiveFollow.skipReplay'));
  assert.equal(mock.watchers.filter(watcher => !watcher.disposed).length, 1);

  await mock.commands.get('codexLiveFollow.pause')();
  assert.equal(controller.enabled, false);
  await mock.commands.get('codexLiveFollow.resume')();
  assert.equal(controller.enabled, true);

  extension.deactivate();
  assert.equal(controller.disposed, true);
  assert.equal(mock.watchers.filter(watcher => !watcher.disposed).length, 0);
  assert.equal(mock.commands.size, 0);
  extension.deactivate();
});
