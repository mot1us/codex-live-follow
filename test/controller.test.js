'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LiveFollow } = require('../src/controller');
const { createVscodeMock, deferred, until } = require('./helpers/vscode');

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options) {
  const mock = createVscodeMock(options);
  const controller = new LiveFollow(mock.vscode, mock.context);
  t.after(() => { controller.dispose(); mock.dispose(); });
  return { mock, controller };
}

async function settleRead(controller) {
  await until(() => controller.pendingReads.size === 0, 'file debounce did not finish');
  await until(() => controller.reading.size === 0, 'file reads did not finish');
  await tick();
}

test('configuration changes pause and resume the controller', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  await mock.configure('enabled', false);
  assert.equal(controller.enabled, false);
  await mock.configure('enabled', true);
  assert.equal(controller.enabled, true);
});

test('disposal during bootstrap cannot install a live watcher afterward', async t => {
  const { mock, controller } = fixture(t);
  const files = deferred();
  mock.hooks.findFiles = () => files.promise;
  const starting = controller.start();
  controller.dispose();
  files.resolve([]);
  await starting;
  assert.equal(mock.watchers.filter(watcher => !watcher.disposed).length, 0);
  assert.equal(controller.snapshots.size, 0);
});

test('overlapping workspace resets leave exactly one watcher set', async t => {
  const { mock, controller } = fixture(t);
  const firstFiles = deferred();
  const secondFiles = deferred();
  let searches = 0;
  mock.hooks.findFiles = () => ++searches === 1 ? firstFiles.promise : secondFiles.promise;
  const first = controller.resetWorkspace();
  const second = controller.resetWorkspace();
  secondFiles.resolve([]);
  await second;
  firstFiles.resolve([]);
  await first;
  assert.equal(mock.watchers.filter(watcher => !watcher.disposed).length, 1);
});

test('removing the last workspace during bootstrap leaves no watcher or snapshot', async t => {
  const { mock, controller } = fixture(t);
  const files = deferred();
  mock.hooks.findFiles = () => files.promise;
  const first = controller.resetWorkspace();
  mock.vscode.workspace.workspaceFolders = undefined;
  await controller.resetWorkspace();
  files.resolve([]);
  await first;
  assert.equal(mock.watchers.filter(watcher => !watcher.disposed).length, 0);
  assert.equal(controller.snapshots.size, 0);
});

test('an older asynchronous read cannot overwrite a newer file revision', async t => {
  const { mock, controller } = fixture(t, { config: { enabled: false } });
  const uri = mock.uri('race.js');
  mock.put(uri, 'original');
  await controller.start();
  const olderRead = deferred();
  let reads = 0;
  mock.hooks.readFile = async () => {
    if (++reads === 1) return olderRead.promise;
    return Buffer.from('newest');
  };
  mock.write(uri, 'older');
  await until(() => reads === 1, 'first file read did not start');
  mock.write(uri, 'newest');
  await until(() => controller.snapshots.get(uri.toString()) === 'newest', 'new revision was not recorded');
  olderRead.resolve(Buffer.from('older'));
  await tick();
  assert.equal(controller.snapshots.get(uri.toString()), 'newest');
});

test('a file change during bootstrap is observed and its snapshot stays current', async t => {
  const { mock, controller } = fixture(t, { config: { enabled: false } });
  const uri = mock.uri('bootstrap.js');
  mock.put(uri, 'original');
  const originalRead = deferred();
  let reads = 0;
  mock.hooks.readFile = async () => {
    if (++reads === 1) return originalRead.promise;
    return Buffer.from('written during bootstrap');
  };
  const starting = controller.start();
  await until(() => reads === 1, 'bootstrap read did not start');
  mock.write(uri, 'written during bootstrap');
  await until(() => controller.snapshots.get(uri.toString()) === 'written during bootstrap',
    'watcher missed a write during bootstrap');
  originalRead.resolve(Buffer.from('original'));
  await starting;
  assert.equal(controller.snapshots.get(uri.toString()), 'written during bootstrap');
});

test('deleting a file invalidates a read already in flight', async t => {
  const { mock, controller } = fixture(t);
  const uri = mock.uri('deleted.js');
  mock.put(uri, 'before');
  await controller.start();
  const reading = deferred();
  let readStarted = false;
  mock.hooks.readFile = async () => { readStarted = true; return reading.promise; };
  mock.write(uri, 'after');
  await until(() => readStarted, 'file read did not start');
  mock.files.delete(uri.toString());
  for (const watcher of mock.watchers) {
    if (!watcher.disposed) watcher.remove.fire(uri);
  }
  reading.resolve(Buffer.from('after'));
  await tick();
  assert.equal(controller.snapshots.has(uri.toString()), false);
  assert.equal(controller.queue.length, 0);
  assert.equal(mock.shown.length, 0);
});

test('deleting a file during bootstrap does not restore its stale snapshot', async t => {
  const { mock, controller } = fixture(t);
  const uri = mock.uri('bootstrap-delete.js');
  mock.put(uri, 'deleted content');
  const reading = deferred();
  let readStarted = false;
  mock.hooks.readFile = async () => { readStarted = true; return reading.promise; };
  const starting = controller.start();
  await until(() => readStarted, 'bootstrap read did not start');
  mock.remove(uri);
  reading.resolve(Buffer.from('deleted content'));
  await starting;
  assert.equal(controller.snapshots.has(uri.toString()), false);
  assert.equal(controller.revisions.size, 0);
});

test('read and delete bursts release per-file revision bookkeeping', async t => {
  const { mock, controller } = fixture(t, { config: { enabled: false } });
  await controller.start();
  const uris = Array.from({ length: 150 }, (_, index) => mock.uri(`burst-${index}.js`));
  for (const uri of uris) mock.write(uri, 'first content', true);
  await settleRead(controller);
  assert.equal(controller.snapshots.size, uris.length);
  assert.equal(controller.revisions.size, 0);
  assert.equal(controller.reading.size, 0);

  for (const uri of uris) {
    mock.write(uri, 'content pending when deleted');
    mock.remove(uri);
  }
  await settleRead(controller);
  assert.equal(controller.pendingReads.size, 0);
  assert.equal(controller.snapshots.size, 0);
  assert.equal(controller.revisions.size, 0);
  assert.equal(controller.reading.size, 0);
});

test('pausing while a document opens prevents a late editor change', async t => {
  const { mock, controller } = fixture(t, { config: { mode: 'follow' } });
  const uri = mock.uri('paused.js');
  mock.put(uri, 'before');
  await controller.start();
  const opening = deferred();
  let openStarted = false;
  mock.hooks.openTextDocument = async () => { openStarted = true; await opening.promise; };
  mock.write(uri, 'after');
  await until(() => openStarted, 'changed document did not start opening');
  await mock.configure('enabled', false);
  opening.resolve();
  await until(() => !controller.playing, 'paused display did not finish');
  assert.equal(mock.shown.length, 0);
});

test('typing emits partial and complete text then cleans up its virtual document', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  const uri = mock.uri('typing.js');
  const content = 'const color = "green";\nconsole.log(color);\n';
  mock.write(uri, content, true);
  await until(() => mock.frames.some(frame => frame.text === content), 'typing never reached the saved text');
  await until(() => !controller.playing, 'typing job did not finish');
  assert.ok(mock.frames.some(frame => frame.text.length > 0 && frame.text !== content));
  assert.equal(mock.shown.at(-1).document.uri.toString(), uri.toString());
  assert.equal(controller.replayContents.size, 0);
  assert.ok(mock.vscode.window.tabGroups.all.every(group =>
    group.tabs.every(tab => tab.input.uri.scheme !== 'codex-live-follow')));
});

test('pausing midway through typing cleans up the partial virtual editor', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  const uri = mock.uri('long.js');
  mock.write(uri, 'const value = 1;\n'.repeat(100), true);
  await until(() => mock.frames.length > 0, 'typing never started');
  await mock.configure('enabled', false);
  await until(() => !controller.playing, 'paused typing job did not finish');
  assert.equal(controller.replayContents.size, 0);
  assert.ok(mock.vscode.window.tabGroups.all.every(group =>
    group.tabs.every(tab => tab.input.uri.scheme !== 'codex-live-follow')));
  assert.equal(controller.quietUntil, 0, 'closing an owned preview must not count as user activity');
});

test('queued saves of the same file coalesce to the latest contents', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  const active = mock.uri('active.js');
  const queued = mock.uri('queued.js');
  mock.write(active, 'const value = 1;\n'.repeat(100), true);
  await until(() => mock.frames.length > 0, 'initial replay did not start');
  mock.write(queued, 'const queued = "first";\n', true);
  await until(() => controller.queue.some(job => job.uri.toString() === queued.toString()),
    'first queued write was not recorded');
  const latest = 'const queued = "latest";\n';
  mock.write(queued, latest);
  await until(() => controller.queue.some(job => job.uri.toString() === queued.toString() && job.after === latest),
    'latest queued write was not recorded');
  assert.equal(controller.queue.filter(job => job.uri.toString() === queued.toString()).length, 1);
  await until(() => mock.frames.some(frame => frame.uri.path === queued.path && frame.text === latest),
    'latest queued contents were not replayed', 4000);
  await until(() => !controller.playing, 'coalesced replay did not finish');
});

test('external changes do not replace a dirty editor with playback', async t => {
  const { mock, controller } = fixture(t);
  const uri = mock.uri('dirty.js');
  mock.put(uri, 'saved');
  await controller.start();
  const document = await mock.vscode.workspace.openTextDocument(uri);
  document.isDirty = true;
  document.text = 'my unsaved work';
  mock.write(uri, 'external update');
  await settleRead(controller);
  assert.equal(document.text, 'my unsaved work');
  assert.equal(mock.shown.length, 0);
  assert.equal(controller.queue.length, 0);
});

test('an editor save updates the snapshot without replaying the user’s own edit', async t => {
  const { mock, controller } = fixture(t);
  const uri = mock.uri('my-edit.js');
  mock.put(uri, 'before');
  await controller.start();
  const document = await mock.vscode.workspace.openTextDocument(uri);
  document.text = 'my saved edit';
  document.version++;
  mock.events.saveDocument.fire(document);
  mock.write(uri, document.getText());
  await settleRead(controller);
  assert.equal(controller.snapshots.get(uri.toString()), 'my saved edit');
  assert.equal(mock.shown.length, 0);
  assert.equal(controller.queue.length, 0);
});

test('a user save replaces a queued external edit before following resumes from idle', async t => {
  const { mock, controller } = fixture(t, { config: { idleDelayMs: 500 } });
  const uri = mock.uri('saved-over-queued.js');
  mock.put(uri, 'original');
  await controller.start();
  controller.userActivity();
  mock.write(uri, 'external edit waiting to replay');
  await until(() => controller.queue.length === 1, 'external edit was not queued while waiting');
  const document = await mock.vscode.workspace.openTextDocument(uri);
  document.text = 'my saved replacement';
  document.isDirty = true;
  mock.events.changeDocument.fire({ document, contentChanges: [{ text: document.text }] });
  document.isDirty = false;
  mock.events.saveDocument.fire(document);
  mock.write(uri, document.getText());
  await settleRead(controller);
  await until(() => !controller.isWaiting(), 'controller did not return from idle');
  await tick();
  assert.equal(controller.snapshots.get(uri.toString()), 'my saved replacement');
  assert.equal(controller.queue.length, 0);
  assert.equal(controller.playing, false);
  assert.equal(mock.frames.length, 0);
  assert.equal(mock.shown.length, 0);
});

test('writes wait in the background and play when the window regains focus', async t => {
  const { mock, controller } = fixture(t, { config: { mode: 'follow' } });
  await controller.start();
  const uri = mock.uri('background.js');
  mock.events.windowState.fire({ focused: false });
  mock.write(uri, 'const queued = true;\n', true);
  await settleRead(controller);
  assert.equal(controller.queue.length, 1);
  assert.equal(mock.shown.length, 0);
  assert.equal(controller.isWaiting(), true);
  mock.events.windowState.fire({ focused: true });
  await until(() => mock.shown.length === 1, 'background edit did not resume');
  await until(() => !controller.playing, 'resumed edit did not finish');
  assert.equal(mock.shown[0].document.uri.toString(), uri.toString());
  assert.equal(controller.queue.length, 0);
});

test('own editor transitions do not interrupt replay while a sidebar has focus', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  mock.hooks.showTextDocument = () => mock.events.activeEditor.fire(undefined);
  const uri = mock.uri('sidebar-focus.js');
  const text = 'const smallIdea = "Make something good";\n'.repeat(12);
  mock.write(uri, text, true);
  await until(() => mock.frames.some(frame => frame.text.length > 0 && frame.text.length < text.length),
    'sidebar focus interrupted opening the replay');
  // The host can deliver its editor-change event after showTextDocument resolves.
  mock.events.activeEditor.fire(mock.shown.at(-1).editor);
  await until(() => !controller.playing, 'replay did not complete');
  assert.ok(mock.frames.some(frame => frame.text === text), 'replay must finish typing');
  assert.equal(mock.shown.at(-1).document.uri.toString(), uri.toString());
  assert.equal(controller.quietUntil, 0);
});

test('user navigation cancels playback while retaining the selected file', async t => {
  const { mock, controller } = fixture(t);
  const destination = mock.uri('my-work.js');
  mock.put(destination, 'const myWork = true;\n');
  await controller.start();
  const animated = mock.uri('animated.js');
  mock.write(animated, 'const value = 1;\n'.repeat(100), true);
  await until(() => mock.frames.length > 0, 'typing did not start');
  const document = await mock.vscode.workspace.openTextDocument(destination);
  await mock.vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  await until(() => !controller.playing, 'navigation did not stop the replay');
  assert.equal(mock.vscode.window.activeTextEditor.document.uri.toString(), destination.toString());
  assert.equal(mock.shown.at(-1).document.uri.toString(), destination.toString());
  assert.equal(controller.replayContents.size, 0);
  assert.equal(controller.isWaiting(), true);
});

test('user navigation during an asynchronous preview close is still respected', async t => {
  const { mock, controller } = fixture(t);
  const destination = mock.uri('work-during-close.js');
  mock.put(destination, 'const myWork = true;\n');
  await controller.start();
  const animated = mock.uri('closing.js');
  mock.write(animated, 'const value = 1;\n'.repeat(100), true);
  await until(() => mock.frames.length > 0, 'typing did not start');
  const closing = deferred();
  let closeStarted = false;
  mock.hooks.closeTabs = async () => { closeStarted = true; await closing.promise; };
  mock.write(animated, 'const latest = true;\n');
  await until(() => closeStarted, 'superseded preview did not start closing');
  const document = await mock.vscode.workspace.openTextDocument(destination);
  await mock.vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  closing.resolve();
  await until(() => !controller.playing, 'preview close did not finish');
  assert.equal(controller.isWaiting(), true, 'genuine navigation was mistaken for owned tab cleanup');
  assert.equal(mock.vscode.window.activeTextEditor.document.uri.toString(), destination.toString());
});

test('the resume command does not cancel the queued replay it just started', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  controller.userActivity();
  const uri = mock.uri('resume-queued.js');
  mock.write(uri, 'const queued = true;\n', true);
  await until(() => controller.queue.length === 1, 'write was not queued while waiting');
  const opening = deferred();
  mock.hooks.openTextDocument = () => opening.promise;
  await mock.commands.get('codexLiveFollow.resume')();
  opening.resolve();
  await until(() => !controller.playing, 'resumed replay did not finish');
  assert.ok(mock.shown.some(item => item.document.uri.toString() === uri.toString()),
    'resuming must display the queued file');
  assert.equal(controller.queue.length, 0);
});

test('superseding an active replay does not confuse owned tab closure with navigation', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  const uri = mock.uri('superseded.js');
  mock.write(uri, 'const value = 1;\n'.repeat(100), true);
  await until(() => mock.frames.length > 0, 'typing did not start');
  const latest = 'const latest = true;\n';
  mock.write(uri, latest);
  await until(() => mock.shown.some(item => item.document.uri.toString() === uri.toString()),
    'newest revision was delayed by false user activity');
  await until(() => !controller.playing, 'newest replay did not finish');
  assert.equal(mock.shown.at(-1).document.getText(), latest);
  assert.equal(controller.quietUntil, 0);
});

test('changing excluded directories removes old snapshots and ignores subsequent writes', async t => {
  const { mock, controller } = fixture(t, { config: { enabled: false } });
  const source = mock.uri('src/main.js');
  const generated = mock.uri('generated/bundle.js');
  mock.put(source, 'source');
  mock.put(generated, 'generated');
  await controller.start();
  assert.equal(controller.snapshots.has(generated.toString()), true);
  await mock.configure('excludeDirectories', ['generated']);
  await until(() => !controller.initializing, 'exclusion rescan did not finish');
  assert.equal(controller.snapshots.has(generated.toString()), false);
  mock.write(generated, 'ignored update');
  mock.write(source, 'source update');
  await settleRead(controller);
  assert.equal(controller.snapshots.has(generated.toString()), false);
  assert.equal(controller.snapshots.get(source.toString()), 'source update');
});

test('the pending queue drops older files when its count limit is reached', async t => {
  const { mock, controller } = fixture(t);
  await controller.start();
  mock.events.windowState.fire({ focused: false });
  const uris = Array.from({ length: 20 }, (_, index) => mock.uri(`queued-${index}.js`));
  for (const uri of uris) mock.write(uri, 'const pending = true;\n', true);
  await settleRead(controller);
  assert.equal(controller.queue.length, 12);
  assert.deepEqual(controller.queue.map(job => job.uri.toString()), uris.slice(-12).map(uri => uri.toString()));
  assert.equal(mock.shown.length, 0);
});

test('the pending queue is bounded by bytes as well as file count', async t => {
  const { mock, controller } = fixture(t, { config: { maxFileSizeKB: 4096 } });
  const uris = Array.from({ length: 10 }, (_, index) => mock.uri(`large-${index}.js`));
  const before = 'a'.repeat(512 * 1024);
  const after = 'b'.repeat(512 * 1024);
  for (const uri of uris) mock.put(uri, before);
  await controller.start();
  mock.events.windowState.fire({ focused: false });
  for (const uri of uris) mock.write(uri, after);
  await settleRead(controller);
  assert.ok(controller.queue.length < uris.length);
  assert.ok(controller.queue.reduce((bytes, job) => bytes + job.bytes, 0) <= 8 * 1024 * 1024);
  assert.equal(controller.queue.at(-1).uri.toString(), uris.at(-1).toString());
});
