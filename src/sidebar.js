'use strict';

const { randomBytes } = require('node:crypto');

const VIEW_ID = 'codexLiveFollow.sidebar';
const BOOLEAN_SETTINGS = new Set([
  'enabled', 'pauseOnInteraction', 'pauseWhenUnfocused', 'ignoreEditorSaves'
]);

class FollowSidebar {
  constructor(vscode, context, controller) {
    this.api = vscode;
    this.context = context;
    this.controller = controller;
    this.disposables = [controller.onDidChangeState(() => this.publish())];
    this.viewDisposables = [];
    this.disposed = false;
    this.ready = false;
  }

  resolveWebviewView(view) {
    if (this.disposed) return;
    this.clearView();
    this.view = view;
    const assets = this.api.Uri.joinPath(this.context.extensionUri, 'assets');
    view.webview.options = { enableScripts: true, localResourceRoots: [assets] };
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage(message => {
        void this.handleMessage(message).catch(error => {
          this.controller.log(`Sidebar action failed: ${String(error)}`);
          if (this.view === view) void view.webview.postMessage({
            type: 'error', message: 'Could not update the controls. Open diagnostic output for details.'
          });
        });
      }),
      view.onDidChangeVisibility(() => {
        if (!view.visible) this.ready = false;
        this.lastState = undefined;
        this.publish();
      }),
      view.onDidDispose(() => { if (this.view === view) this.clearView(); })
    );
    view.webview.html = this.html(view.webview, assets);
  }

  async open() {
    await this.api.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  async handleMessage(message) {
    if (this.disposed || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      this.ready = true;
      this.lastState = undefined;
      this.publish();
      return;
    }
    if (message.type === 'setting') {
      const { key, value } = message;
      const valid = (BOOLEAN_SETTINGS.has(key) && typeof value === 'boolean') ||
        (key === 'mode' && (value === 'typing' || value === 'follow')) ||
        (key === 'typingCharsPerSecond' && typeof value === 'number' &&
          Number.isFinite(value) && value >= 20 && value <= 400);
      if (!valid) return;
      if (key === 'enabled') {
        await this.api.commands.executeCommand(`codexLiveFollow.${value ? 'resume' : 'pause'}`);
      } else await this.controller.setSetting(key, value);
    } else if (message.type === 'action') {
      if (message.action === 'skip') await this.api.commands.executeCommand('codexLiveFollow.skipReplay');
      else if (message.action === 'output') await this.api.commands.executeCommand('codexLiveFollow.showOutput');
      else if (message.action === 'settings') await this.api.commands.executeCommand('codexLiveFollow.settings');
      else return;
    } else return;
    this.publish();
  }

  publish() {
    if (this.disposed || !this.view?.visible) return;
    const state = this.controller.getState();
    const signature = JSON.stringify(state);
    if (signature === this.lastState) return;
    this.lastState = signature;
    void this.view.webview.postMessage({ type: 'state', state }).then(undefined, () => {
      this.lastState = undefined;
    });
  }

  html(webview, assets) {
    const nonce = randomBytes(18).toString('base64');
    const css = webview.asWebviewUri(this.api.Uri.joinPath(assets, 'sidebar.css'));
    const script = webview.asWebviewUri(this.api.Uri.joinPath(assets, 'sidebar.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${css}">
  <title>Live Follow Controls</title>
</head>
<body>
  <main>
    <header class="intro">
      <span class="eyebrow">CODEX LIVE FOLLOW</span>
      <h1>Watch code take shape.</h1>
      <p>Follow saved edits as they happen in your workspace.</p>
    </header>

    <section class="status-card" aria-labelledby="status-title" data-status="preparing">
      <div class="status-heading"><span class="status-dot" aria-hidden="true"></span><h2 id="status-title" role="status">Connecting…</h2></div>
      <p id="status-detail">Getting the latest playback status.</p>
      <p id="current-file" class="file" hidden></p>
      <progress id="progress" max="100" value="0" aria-label="Typing replay progress" hidden></progress>
      <div class="queue-row"><span id="queue">No pending changes</span><button id="skip" class="text-button" disabled>Skip replay</button></div>
    </section>

    <section class="controls" aria-label="Playback controls">
      <div class="toggle-row"><div><label for="enabled" class="control-label">Follow edits</label><p>Pause or resume following.</p></div><input id="enabled" type="checkbox" role="switch" disabled></div>
      <div class="field"><label class="control-label" for="mode">Replay mode</label><select id="mode" disabled><option value="typing">Typing replay</option><option value="follow">Follow changed lines</option></select></div>
      <div class="field"><div class="label-row"><label class="control-label" for="speed">Typing speed</label><output id="speed-value" for="speed">120 chars/s</output></div><input id="speed" type="range" min="20" max="400" step="1" value="120" disabled><div class="scale"><span>Relaxed</span><span>Fast</span></div><p class="hint">Mode and speed apply to the next replay.</p></div>
    </section>

    <section class="preferences" aria-labelledby="preferences-title">
      <h2 id="preferences-title">While you work</h2>
      <label class="check-row"><input id="pauseOnInteraction" type="checkbox" disabled><span>Pause while I edit</span></label>
      <label class="check-row"><input id="pauseWhenUnfocused" type="checkbox" disabled><span>Wait when VS Code is in the background</span></label>
      <label class="check-row"><input id="ignoreEditorSaves" type="checkbox" disabled><span>Ignore files I save in this window</span></label>
    </section>

    <p id="error" role="alert" hidden></p>
    <footer><button id="settings" class="secondary-button">All settings</button><button id="output" class="text-button">Diagnostic output</button><p id="settings-scope">Changes made here are saved for this workspace.</p></footer>
  </main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  clearView() {
    this.ready = false;
    this.view = undefined;
    this.lastState = undefined;
    for (const disposable of this.viewDisposables) disposable.dispose();
    this.viewDisposables = [];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearView();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }
}

module.exports = { FollowSidebar, VIEW_ID };
