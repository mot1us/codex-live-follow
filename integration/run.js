'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

async function until(check, description, timeout = 10000, diagnostics = () => '') {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${description}${diagnostics()}`);
}

async function run() {
  const manifest = require('../package.json');
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'development extension is installed');
  const api = await extension.activate();
  assert.equal(api.getState().enabled, false, 'fresh projects must wait for the user to enable following');
  await vscode.commands.executeCommand('codexLiveFollow.resume');
  assert.equal(api.getState().enabled, true, 'the project choice enables following');
  console.log('PASS fresh-profile first-use pause and explicit project enable');
  const config = vscode.workspace.getConfiguration('codexLiveFollow');
  for (const [key, value] of Object.entries({
    enabled: true, pauseOnInteraction: true, pauseWhenUnfocused: false, idleDelayMs: 500,
    ignoreEditorSaves: true, typingCharsPerSecond: 400, maxReplayDurationMs: 1000,
    minimumDisplayMs: 100, inspectionDisplayMs: 10000, mode: 'typing'
  })) await config.update(key, value, vscode.ConfigurationTarget.Workspace);
  const startingDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(__dirname, '..', 'src', 'extension.js')));
  await vscode.window.showTextDocument(startingDocument, { preview: false });
  await vscode.commands.executeCommand('codexLiveFollow.controls');
  await until(() => api.areControlsReady(), 'sidebar HTML and scripts connect to the extension');
  assert.ok((await vscode.commands.getCommands(true)).includes('codexLiveFollow.sidebar.focus'));
  console.log('PASS dedicated Live Follow sidebar opens in the real host');
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const source = vscode.Uri.file(path.join(root, 'live-follow-host-test.js'));
  const frames = [];
  const subscription = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme === 'codex-live-follow' && event.document.uri.path === source.path) {
      frames.push(event.document.getText());
    }
  });
  const previewTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs)
    .filter(tab => tab.input?.uri?.scheme === 'codex-live-follow');
  try {
    const text = Array.from({ length: 30 }, (_, i) => `const message${i} = 'Hello from the real VS Code host';`).join('\n') + '\n';
    await fs.writeFile(source.fsPath, text);
    await until(() => frames.some(frame => frame.length > 0 && frame.length < text.length), 'partial typing frame');
    assert.equal(await fs.readFile(source.fsPath, 'utf8'), text, 'animation does not rewrite the real source');
    // VS Code normalizes virtual models to the host's EOL; disk bytes remain exact.
    await until(() => frames.some(frame => frame.replace(/\r\n/g, '\n') === text) && previewTabs().length === 0 &&
      vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === source.toString()),
    'complete replay, source reveal, and virtual tab cleanup', 10000, () => JSON.stringify({
      state: api.getState(), frameCount: frames.length,
      finalFrameLength: frames.at(-1)?.length, expectedLength: text.length,
      finalFrameUsesCRLF: frames.at(-1)?.includes('\r\n'),
      visibleEditors: vscode.window.visibleTextEditors.map(editor => editor.document.uri.toString()),
      source: source.toString(), replayTabs: previewTabs().length
    }));
    console.log('PASS real watcher → virtual typing frames → real file; disk untouched');

    const activity = path.join(root, '.codex-live-follow', 'activity.json');
    await fs.mkdir(path.dirname(activity), { recursive: true });
    const beforeInspection = frames.length;
    await fs.writeFile(activity, JSON.stringify({ id: 'host-inspection',
      path: path.basename(source.fsPath), line: 20,
      message: 'Inspecting a real source line', phase: 'suspect' }));
    await until(() => api.getState().status === 'inspecting' && api.getState().line === 20,
      'local inspection report reaches the real sidebar', 10000,
      () => JSON.stringify({ state: api.getState(),
        visibleEditors: vscode.window.visibleTextEditors.map(editor => editor.document.uri.toString()) }));
    await until(() => vscode.window.visibleTextEditors.some(editor =>
      editor.document.uri.toString() === source.toString() &&
      editor.visibleRanges.some(range => range.start.line <= 19 && range.end.line >= 19)),
    'reported line is visible in the real editor');
    assert.equal(frames.length, beforeInspection, 'inspections do not type or modify source');
    assert.equal(await fs.readFile(source.fsPath, 'utf8'), text);
    await vscode.commands.executeCommand('codexLiveFollow.skipReplay');
    await until(() => api.getState().status === 'watching', 'inspection skips promptly');
    console.log('PASS local inspection → real source line and sidebar; source untouched');

    await vscode.commands.executeCommand('codexLiveFollow.pause');
    assert.equal(vscode.workspace.getConfiguration('codexLiveFollow').get('enabled'), false);
    const priorFrames = frames.length;
    const pausedText = text + '// saved while following is paused\n';
    await fs.writeFile(source.fsPath, pausedText);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(frames.length, priorFrames, 'paused file writes do not replay');
    await vscode.commands.executeCommand('codexLiveFollow.resume');
    assert.equal(vscode.workspace.getConfiguration('codexLiveFollow').get('enabled'), true);
    const next = pausedText + '// A longer update to verify cancelling an active replay.\n'.repeat(40);
    await fs.writeFile(source.fsPath, next);
    await until(() => frames.length > priorFrames && previewTabs().length > 0, 'second replay starts');
    await vscode.commands.executeCommand('codexLiveFollow.pause');
    await until(() => previewTabs().length === 0, 'pause removes incomplete virtual tab');
    assert.equal(await fs.readFile(source.fsPath, 'utf8'), next);
    console.log('PASS pause/resume commands and cancellation cleanup');

    await vscode.commands.executeCommand('codexLiveFollow.resume');
    const document = await vscode.workspace.openTextDocument(source);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// unsaved user edit\n'));
    assert.ok(document.isDirty);
    const beforeDirtyWrite = frames.length;
    await fs.writeFile(source.fsPath, next + '// external write while editor is dirty\n');
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.ok(document.isDirty, 'external writes preserve unsaved edits');
    assert.equal(frames.length, beforeDirtyWrite, 'dirty file never becomes replay');
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// saved by the user\n'));
    await document.save();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(frames.length, beforeDirtyWrite, 'normal editor saves do not replay');
    console.log('PASS dirty-editor protection and editor-save suppression');
  } finally {
    subscription.dispose();
    await vscode.commands.executeCommand('codexLiveFollow.pause');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}

module.exports = { run };
