'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LiveFollow } = require('../src/controller');
const { VIEW_ID } = require('../src/sidebar');
const { createVscodeMock, until } = require('./helpers/vscode');

async function setup(t) {
  const mock = createVscodeMock();
  const controller = new LiveFollow(mock.vscode, mock.context);
  t.after(() => { controller.dispose(); mock.dispose(); });
  await controller.start();
  const messages = [];
  const received = new mock.vscode.EventEmitter();
  const visibility = new mock.vscode.EventEmitter();
  const disposed = new mock.vscode.EventEmitter();
  const view = {
    visible: true,
    onDidChangeVisibility: visibility.event,
    onDidDispose: disposed.event,
    webview: {
      cspSource: 'vscode-webview://test',
      asWebviewUri: uri => uri.toString(),
      onDidReceiveMessage: received.event,
      async postMessage(message) { messages.push(message); return true; }
    }
  };
  const sidebar = mock.viewProviders.get(VIEW_ID);
  assert.ok(sidebar, 'registered sidebar provider');
  sidebar.resolveWebviewView(view);
  await sidebar.handleMessage({ type: 'ready' });
  return { mock, controller, sidebar, view, messages, visibility, disposed };
}

test('sidebar controls persist settings and stay in sync with commands and Settings', async t => {
  const { mock, sidebar, messages } = await setup(t);
  assert.equal(messages.at(-1).state.enabled, true);
  await sidebar.handleMessage({ type: 'setting', key: 'enabled', value: false });
  assert.equal(mock.config.enabled, false);
  assert.equal(messages.at(-1).state.status, 'paused');
  await mock.commands.get('codexLiveFollow.resume')();
  assert.equal(messages.at(-1).state.enabled, true);
  await sidebar.handleMessage({ type: 'setting', key: 'mode', value: 'follow' });
  await sidebar.handleMessage({ type: 'setting', key: 'typingCharsPerSecond', value: 240 });
  await sidebar.handleMessage({ type: 'setting', key: 'pauseOnInteraction', value: false });
  assert.equal(mock.config.mode, 'follow');
  assert.equal(mock.config.typingCharsPerSecond, 240);
  assert.equal(mock.config.pauseOnInteraction, false);
  await mock.configure('typingCharsPerSecond', 60);
  assert.equal(messages.at(-1).state.speed, 60);
});

test('sidebar rejects unknown settings, malformed values, and arbitrary commands', async t => {
  const { mock, sidebar } = await setup(t);
  const before = { ...mock.config };
  for (const message of [
    null, { type: 'setting', key: 'enabled', value: 'false' },
    { type: 'setting', key: 'mode', value: 'execute' },
    { type: 'setting', key: 'typingCharsPerSecond', value: 401 },
    { type: 'setting', key: 'typingCharsPerSecond', value: NaN },
    { type: 'setting', key: 'maxFileSizeKB', value: 9999 },
    { type: 'action', action: 'workbench.action.files.save' }
  ]) await sidebar.handleMessage(message);
  assert.deepEqual(mock.config, before);
});

test('live sidebar tracks typing, skip, queued writes, and background waiting', async t => {
  const { mock, controller, sidebar, messages } = await setup(t);
  const uri = mock.uri('demo.js');
  mock.write(uri, 'console.log("Following a saved edit");\n'.repeat(10), true);
  await until(() => messages.some(message => message.state?.progress > 0), 'sidebar gets real typing progress');
  assert.equal(messages.at(-1).state.file, 'demo.js');
  assert.equal(messages.at(-1).state.canSkip, true);
  await sidebar.handleMessage({ type: 'action', action: 'skip' });
  await until(() => !controller.playing, 'skip finishes the replay');
  assert.equal(messages.at(-1).state.status, 'watching');
  assert.equal(messages.at(-1).state.canSkip, false);
  mock.events.windowState.fire({ focused: false });
  mock.write(mock.uri('queued.js'), 'const queued = true;\n', true);
  await until(() => messages.at(-1).state.pending === 1, 'sidebar reports waiting queue');
  assert.equal(messages.at(-1).state.status, 'waiting');
  assert.match(messages.at(-1).state.title, /window/);
});

test('hidden sidebar stops updates, catches up on reveal, and releases view listeners', async t => {
  const { mock, controller, sidebar, view, messages, visibility, disposed } = await setup(t);
  const prior = messages.length;
  controller.updateStatus();
  assert.equal(messages.length, prior, 'unchanged state is not posted twice');
  view.visible = false;
  visibility.fire();
  await mock.configure('enabled', false);
  assert.equal(messages.length, prior, 'hidden webview gets no updates');
  view.visible = true;
  visibility.fire();
  assert.equal(messages.at(-1).state.enabled, false);
  disposed.fire();
  const after = messages.length;
  await mock.configure('enabled', true);
  assert.equal(messages.length, after);
  assert.equal(visibility.listeners.size, 0);
  sidebar.dispose();
});

test('status bar and Open Controls use the contributed sidebar without a Quick Pick', async t => {
  const { mock, controller } = await setup(t);
  let focused = 0;
  mock.commands.set(`${VIEW_ID}.focus`, () => { focused++; });
  mock.vscode.window.showQuickPick = () => { throw new Error('controls should open the sidebar'); };
  assert.equal(controller.status.command, 'codexLiveFollow.controls');
  await mock.commands.get('codexLiveFollow.controls')();
  await mock.commands.get('codexLiveFollow.openSidebar')();
  assert.equal(focused, 2);
});
