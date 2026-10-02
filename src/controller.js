'use strict';

const { createHash } = require('node:crypto');
const { changedHunks } = require('./diff');
const { makeReplayPlan } = require('./replay');
const { FollowSidebar, VIEW_ID } = require('./sidebar');

const SNAPSHOT_LIMIT = 1200;
const SNAPSHOT_BYTES = 32 * 1024 * 1024;
const QUEUE_LIMIT = 12;
const QUEUE_BYTES = 8 * 1024 * 1024;
const FRAME_MS = 50;
const SCHEME = 'codex-live-follow';
const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.venv',
  'venv', 'target', 'coverage', '__pycache__', '.vscode-test', '.cache', '.vscode'
]);
const digest = text => createHash('sha256').update(text).digest('hex');

class LiveFollow {
  constructor(vscode, context) {
    this.api = vscode;
    this.context = context;
    this.snapshots = new Map();
    this.trackedBytes = 0;
    this.revisions = new Map();
    this.reading = new Map();
    this.readSerial = 0;
    this.pendingReads = new Map();
    this.savedByEditor = new Map();
    this.queue = [];
    this.watchers = [];
    this.disposables = [];
    this.replayContents = new Map();
    this.replayCounter = 0;
    this.generation = 0;
    this.enabled = this.config('enabled', true);
    this.disposed = false;
    this.playing = false;
    this.initializing = false;
    this.quietUntil = 0;
    this.windowFocused = vscode.window.state?.focused !== false;
    this.output = vscode.window.createOutputChannel('Codex Live Follow');
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.status.name = 'Codex Live Follow';
    this.status.command = 'codexLiveFollow.controls';
    this.replayEmitter = new vscode.EventEmitter();
    this.stateEmitter = new vscode.EventEmitter();
    this.onDidChangeState = this.stateEmitter.event;
    this.highlight = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Full
    });
    this.disposables.push(this.output, this.status, this.replayEmitter, this.stateEmitter, this.highlight);
    this.updateStatus();
    this.status.show();
  }

  config(key, fallback) {
    return this.api.workspace.getConfiguration('codexLiveFollow').get(key, fallback);
  }

  numberConfig(key, fallback, min, max) {
    const value = this.config(key, fallback);
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value)) : fallback;
  }

  log(message) {
    if (!this.disposed) this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  getState() {
    let status = 'watching';
    let title = 'Watching for edits';
    let detail = 'Saved workspace changes will appear in the editor.';
    if (!this.enabled) {
      status = 'paused'; title = 'Following paused'; detail = 'Turn Follow edits on when you are ready.';
    } else if (!this.api.workspace.workspaceFolders?.length) {
      status = 'empty'; title = 'Open a workspace folder'; detail = 'Open the folder where your agent is editing files.';
    } else if (this.initializing) {
      status = 'preparing'; title = 'Preparing workspace'; detail = 'Reading existing files before following new edits.';
    } else if (this.isWaiting()) {
      status = 'waiting';
      const background = !this.windowFocused && this.config('pauseWhenUnfocused', true);
      title = background ? 'Waiting for this window' : 'Waiting while you work';
      detail = background ? 'Following resumes when you return to VS Code.' :
        `Following resumes after ${this.numberConfig('idleDelayMs', 3000, 500, 60000) / 1000} seconds of editor inactivity.`;
    } else if (this.currentJob && !this.currentJob.cancelled) {
      status = 'playing'; title = 'Following an edit'; detail = 'Showing the latest saved change.';
    }
    const job = this.currentJob && !this.currentJob.cancelled ? this.currentJob : undefined;
    return {
      enabled: this.enabled, status, title, detail,
      configurationScope: this.api.workspace.workspaceFolders?.length ? 'workspace' : 'user',
      file: job ? this.api.workspace.asRelativePath(job.uri, false) : '',
      pending: this.queue.length, canSkip: status === 'playing',
      progress: status === 'playing' && typeof job?.progress === 'number' ? job.progress : null,
      mode: this.config('mode', 'typing'),
      speed: this.numberConfig('typingCharsPerSecond', 120, 20, 400),
      pauseOnInteraction: this.config('pauseOnInteraction', true),
      pauseWhenUnfocused: this.config('pauseWhenUnfocused', true),
      ignoreEditorSaves: this.config('ignoreEditorSaves', true)
    };
  }

  updateStatus(detail) {
    if (this.disposed) return;
    if (!this.enabled) this.status.text = '$(eye-closed) Follow paused';
    else if (!this.api.workspace.workspaceFolders?.length) this.status.text = '$(folder) Open a folder';
    else if (this.initializing) this.status.text = '$(sync~spin) Follow preparing';
    else if (this.isWaiting()) this.status.text = '$(debug-pause) Follow waiting';
    else if (this.currentJob) this.status.text = '$(play) Following edits';
    else this.status.text = this.config('mode', 'typing') === 'typing'
      ? '$(keyboard) Type edits' : '$(eye) Follow edits';
    this.status.tooltip = `Codex Live Follow: ${detail || this.getState().detail}\nClick to open the Live Follow sidebar.`;
    this.status.accessibilityInformation = { label: this.status.tooltip };
    this.stateEmitter.fire();
  }

  async setSetting(key, value) {
    const target = this.api.workspace.workspaceFolders?.length
      ? this.api.ConfigurationTarget.Workspace : this.api.ConfigurationTarget.Global;
    await this.api.workspace.getConfiguration('codexLiveFollow').update(key, value, target);
    if (key === 'enabled') this.applyConfiguration();
  }

  async start() {
    // Migrate the prototype's hidden pause flag without overriding explicit settings.
    const legacy = this.context.workspaceState.get('enabled');
    if (legacy !== undefined) {
      const setting = this.api.workspace.getConfiguration('codexLiveFollow').inspect('enabled');
      if (setting && setting.workspaceValue === undefined && setting.globalValue === undefined &&
        setting.workspaceFolderValue === undefined) await this.setSetting('enabled', legacy);
      await this.context.workspaceState.update('enabled', undefined);
    }
    if (this.disposed) return;
    const { workspace, window, commands } = this.api;
    this.disposables.push(workspace.registerTextDocumentContentProvider(SCHEME, {
      onDidChange: this.replayEmitter.event,
      provideTextDocumentContent: uri => this.replayContents.get(uri.toString()) || ''
    }));
    const register = (name, handler) => this.disposables.push(commands.registerCommand(
      `codexLiveFollow.${name}`, handler
    ));
    register('toggle', () => this.setSetting('enabled', !this.enabled));
    register('pause', () => this.setSetting('enabled', false));
    register('resume', () => { this.quietUntil = 0; return this.setSetting('enabled', true); });
    this.sidebar = new FollowSidebar(this.api, this.context, this);
    this.disposables.push(this.sidebar, window.registerWebviewViewProvider(VIEW_ID, this.sidebar));
    register('controls', () => this.sidebar.open());
    register('openSidebar', () => this.sidebar.open());
    register('settings', () => commands.executeCommand('workbench.action.openSettings', 'codexLiveFollow'));
    register('setSpeed', () => this.chooseSpeed());
    register('setMode', () => this.chooseMode());
    register('showOutput', () => this.output.show(true));
    register('skipReplay', () => {
      if (this.currentJob) { this.currentJob.skip = true; this.currentJob.wake?.(); }
    });
    this.disposables.push(
      workspace.onDidChangeWorkspaceFolders(() => { void this.resetWorkspace(); }),
      workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('codexLiveFollow')) return;
        this.applyConfiguration();
        if (event.affectsConfiguration('codexLiveFollow.excludeDirectories') ||
          event.affectsConfiguration('codexLiveFollow.maxFileSizeKB')) void this.resetWorkspace();
      }),
      workspace.onDidSaveTextDocument(document => {
        if (!this.config('ignoreEditorSaves', true) || this.isIgnored(document.uri)) return;
        const key = document.uri.toString();
        this.queue = this.queue.filter(job => job.uri.toString() !== key);
        if (this.currentJob?.uri.toString() === key) this.cancelCurrent();
        this.savedByEditor.set(key, {
          hash: digest(document.getText()), expires: Date.now() + 10000
        });
        while (this.savedByEditor.size > SNAPSHOT_LIMIT) {
          this.savedByEditor.delete(this.savedByEditor.keys().next().value);
        }
        this.updateStatus();
      }),
      workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.scheme !== SCHEME && event.document.isDirty && event.contentChanges.length) {
          this.userActivity('editing a document');
        }
      }),
      workspace.onDidCloseTextDocument(document => {
        if (document.uri.scheme === SCHEME) this.replayContents.delete(document.uri.toString());
      }),
      window.onDidChangeTextEditorSelection(event => {
        const kinds = this.api.TextEditorSelectionChangeKind;
        if (event.kind === kinds.Keyboard || event.kind === kinds.Mouse) this.userActivity('editor selection');
      }),
      window.onDidChangeActiveTextEditor(editor => {
        const ownUri = this.pendingShowUri || this.currentJob?.presentedUri;
        if (ownUri && (editor?.document.uri.toString() === ownUri || (!editor &&
          (this.pendingShowUri || window.visibleTextEditors.some(item => item.document.uri.toString() === ownUri))))) return;
        if (this.closingReplayUri && !this.api.window.tabGroups.all.some(group =>
          group.tabs.some(tab => tab.input?.uri?.toString() === this.closingReplayUri))) {
          this.closingReplayUri = undefined;
          return;
        }
        this.userActivity('editor navigation');
      }),
      window.onDidChangeWindowState(state => {
        this.windowFocused = state.focused;
        if (!state.focused && this.config('pauseWhenUnfocused', true)) this.cancelCurrent();
        this.updateStatus();
        if (state.focused) void this.playQueue();
      })
    );
    await this.resetWorkspace();
    this.log('Started. File writes are detected locally in the workspace extension host.');
  }

  applyConfiguration() {
    if (this.disposed) return;
    const enabled = this.config('enabled', true);
    if (this.enabled !== enabled) this.cancelCurrent();
    this.enabled = enabled;
    if (!this.enabled) { this.queue.length = 0; this.clearHighlight(); }
    this.updateStatus();
    if (this.enabled) void this.playQueue();
  }

  userActivity(reason = 'editor interaction') {
    if (this.disposed || !this.config('pauseOnInteraction', true)) return;
    if (this.currentJob && !this.currentJob.cancelled) this.log(`Replay paused for ${reason}.`);
    this.quietUntil = Date.now() + this.numberConfig('idleDelayMs', 3000, 500, 60000);
    this.cancelCurrent();
    this.clearHighlight();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.quietUntil = 0;
      this.updateStatus();
      void this.playQueue();
    }, Math.max(0, this.quietUntil - Date.now()));
    this.updateStatus();
  }

  isWaiting() {
    return Date.now() < this.quietUntil ||
      (!this.windowFocused && this.config('pauseWhenUnfocused', true));
  }

  cancelCurrent() {
    if (this.currentJob) {
      this.currentJob.cancelled = true;
      this.currentJob.wake?.();
    }
  }

  valid(job) {
    return !this.disposed && this.enabled && !job.cancelled &&
      job.generation === this.generation && !this.isWaiting();
  }

  async resetWorkspace() {
    const generation = ++this.generation;
    this.cancelCurrent();
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    for (const timer of this.pendingReads.values()) clearTimeout(timer);
    this.pendingReads.clear();
    this.revisions.clear();
    this.reading.clear();
    this.snapshots.clear();
    this.savedByEditor.clear();
    this.trackedBytes = 0;
    this.queue.length = 0;
    this.clearHighlight();
    const folders = [...(this.api.workspace.workspaceFolders || [])];
    this.initializing = folders.length > 0;
    this.updateStatus();
    if (!folders.length || this.disposed) return;
    // Subscribe first so file writes during the initial scan are not missed.
    for (const folder of folders) {
      const watcher = this.api.workspace.createFileSystemWatcher(new this.api.RelativePattern(folder, '**/*'));
      watcher.onDidChange(uri => this.scheduleRead(uri));
      watcher.onDidCreate(uri => this.scheduleRead(uri));
      watcher.onDidDelete(uri => this.forget(uri));
      this.watchers.push(watcher);
    }
    try {
      const files = await this.api.workspace.findFiles('**/*',
        '**/{.git,node_modules,dist,build,out,.next,.venv,venv,target,coverage,__pycache__,.vscode-test,.cache,.vscode}/**',
        SNAPSHOT_LIMIT);
      if (this.disposed || generation !== this.generation) return;
      let next = 0;
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (next < files.length && !this.disposed && generation === this.generation) {
          const uri = files[next++];
          if (this.isIgnored(uri)) continue;
          const key = uri.toString();
          const revision = this.revisions.get(key);
          const text = await this.readText(uri);
          if (this.disposed || generation !== this.generation) return;
          if (text !== null && revision === this.revisions.get(key) && !this.snapshots.has(key)) {
            this.remember(uri, text);
          }
        }
      }));
    } catch (error) {
      this.log(`Could not finish initial scan: ${String(error)}`);
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.initializing = false;
        for (const key of this.revisions.keys()) this.releaseRevision(key);
        this.updateStatus();
        void this.playQueue();
      }
    }
  }

  isIgnored(uri) {
    if (uri.scheme === SCHEME || !this.api.workspace.getWorkspaceFolder(uri)) return true;
    const relative = this.api.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
    const extra = this.config('excludeDirectories', []);
    const excluded = Array.isArray(extra) ? extra : [];
    return relative.split('/').some(part => SKIP_DIRECTORIES.has(part) || excluded.includes(part)) ||
      /\.(vsix|lock)$/i.test(relative);
  }

  isDirty(uri) {
    return this.api.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString() && doc.isDirty);
  }

  async readText(uri) {
    try {
      const limit = this.numberConfig('maxFileSizeKB', 512, 16, 4096) * 1024;
      const stat = await this.api.workspace.fs.stat(uri);
      if (!(stat.type & this.api.FileType.File) || stat.size > limit) return null;
      const bytes = await this.api.workspace.fs.readFile(uri);
      if (bytes.byteLength > limit || bytes.includes(0)) return null;
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return null; }
  }

  remember(uri, text) {
    const key = uri.toString();
    if (this.snapshots.has(key)) this.trackedBytes -= Buffer.byteLength(this.snapshots.get(key));
    this.snapshots.delete(key);
    this.snapshots.set(key, text);
    this.trackedBytes += Buffer.byteLength(text);
    while (this.snapshots.size > SNAPSHOT_LIMIT || this.trackedBytes > SNAPSHOT_BYTES) {
      const oldest = this.snapshots.keys().next().value;
      this.trackedBytes -= Buffer.byteLength(this.snapshots.get(oldest));
      this.snapshots.delete(oldest);
    }
  }

  forget(uri) {
    const key = uri.toString();
    clearTimeout(this.pendingReads.get(key));
    this.pendingReads.delete(key);
    // Keep a tombstone during bootstrap so a delayed initial read cannot resurrect a deletion.
    if (this.initializing) this.revisions.set(key, ++this.readSerial);
    else this.revisions.delete(key);
    if (this.snapshots.has(key)) this.trackedBytes -= Buffer.byteLength(this.snapshots.get(key));
    this.snapshots.delete(key);
    this.savedByEditor.delete(key);
    this.queue = this.queue.filter(job => job.uri.toString() !== key);
    if (this.currentJob?.uri.toString() === key) this.cancelCurrent();
    this.updateStatus();
  }

  scheduleRead(uri) {
    if (this.disposed || this.isIgnored(uri)) return;
    const key = uri.toString();
    const revision = ++this.readSerial;
    this.revisions.set(key, revision);
    clearTimeout(this.pendingReads.get(key));
    const generation = this.generation;
    this.pendingReads.set(key, setTimeout(() => {
      this.pendingReads.delete(key);
      void this.handleWrite(uri, revision, generation).catch(error => this.log(`Read failed: ${String(error)}`));
    }, 90));
  }

  async handleWrite(uri, revision, generation) {
    const key = uri.toString();
    const reads = this.reading.get(key) || new Set();
    reads.add(revision);
    this.reading.set(key, reads);
    try {
      const current = await this.readText(uri);
      if (this.disposed || generation !== this.generation || revision !== this.revisions.get(key)) return;
      if (current === null || this.isIgnored(uri)) return;
      const previous = this.snapshots.get(key);
      this.remember(uri, current);
      const saved = this.savedByEditor.get(key);
      if (saved) this.savedByEditor.delete(key);
      if (!this.enabled || previous === current || this.isDirty(uri)) return;
      if (this.config('ignoreEditorSaves', true) && saved?.expires > Date.now() && saved.hash === digest(current)) return;
      const queued = this.queue.find(job => job.uri.toString() === key);
      const active = this.currentJob?.uri.toString() === key ? this.currentJob : undefined;
      // Preserve the earliest unseen baseline when multiple writes are coalesced.
      const before = queued?.before ?? active?.displayedText ?? previous ?? '';
      this.queue = this.queue.filter(job => job.uri.toString() !== key);
      if (active) this.cancelCurrent();
      const job = { uri, before, after: current, generation,
        bytes: Buffer.byteLength(before) + Buffer.byteLength(current) };
      this.queue.push(job);
      let bytes = this.queue.reduce((sum, pending) => sum + pending.bytes, 0);
      while (this.queue.length > QUEUE_LIMIT || bytes > QUEUE_BYTES) bytes -= this.queue.shift().bytes;
      this.updateStatus();
      void this.playQueue();
    } finally {
      reads.delete(revision);
      if (this.reading.get(key) === reads && !reads.size) this.reading.delete(key);
      this.releaseRevision(key);
    }
  }

  releaseRevision(key) {
    if (!this.initializing && !this.pendingReads.has(key) && !this.reading.has(key)) this.revisions.delete(key);
  }

  clearHighlight() {
    clearTimeout(this.highlightTimer);
    try { this.highlightedEditor?.setDecorations(this.highlight, []); } catch { /* Editor closed. */ }
    this.highlightedEditor = undefined;
  }

  delay(ms, job) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); if (job.wake === done) job.wake = undefined; resolve(); };
      const timer = setTimeout(done, ms);
      job.wake = done;
      if (!this.valid(job) || job.skip) done();
    });
  }

  async playQueue() {
    if (this.playing || this.initializing || this.disposed || !this.enabled || this.isWaiting()) return;
    this.playing = true;
    try {
      while (this.queue.length && this.enabled && !this.disposed && !this.initializing && !this.isWaiting()) {
        const job = this.queue.shift();
        if (job.generation !== this.generation || this.isDirty(job.uri) || this.isIgnored(job.uri)) continue;
        this.currentJob = job;
        this.updateStatus();
        try {
          const hunks = changedHunks(job.before, job.after).slice(0, 6);
          if (this.config('mode', 'typing') === 'typing') await this.playTyping(job, hunks[0]);
          else for (const hunk of hunks) {
            if (!this.valid(job)) break;
            await this.showChange(job, hunk);
          }
        } catch (error) {
          this.log(`Could not show ${this.api.workspace.asRelativePath(job.uri)}: ${String(error)}`);
        } finally {
          this.currentJob = undefined;
        }
      }
    } finally {
      this.playing = false;
      this.updateStatus();
      // A reset or config change may have enqueued work while this job unwound.
      if (this.queue.length && !this.initializing && !this.disposed && this.enabled && !this.isWaiting()) {
        void this.playQueue();
      }
    }
  }

  async present(document, job) {
    if (!this.valid(job) || this.isDirty(job.uri)) return undefined;
    this.pendingShowUri = document.uri.toString();
    job.presentedUri = this.pendingShowUri;
    try {
      const editor = await this.api.window.showTextDocument(document, {
        preview: true, preserveFocus: true, viewColumn: this.api.ViewColumn.One
      });
      if (!this.valid(job) || this.isDirty(job.uri)) return undefined;
      return editor;
    } finally {
      this.pendingShowUri = undefined;
    }
  }

  async showChange(job, hunk) {
    if (!this.valid(job) || this.isDirty(job.uri)) return;
    const document = await this.api.workspace.openTextDocument(job.uri);
    const editor = await this.present(document, job);
    if (!editor || !this.valid(job)) return;
    const last = Math.max(0, document.lineCount - 1);
    const start = Math.min(hunk?.start ?? 0, last);
    const end = Math.min(Math.max((hunk?.end ?? 1) - 1, start), last);
    const range = new this.api.Range(start, 0, end, document.lineAt(end).text.length);
    this.clearHighlight();
    editor.revealRange(range, this.api.TextEditorRevealType.InCenterIfOutsideViewport);
    editor.setDecorations(this.highlight, [range]);
    this.highlightedEditor = editor;
    this.highlightTimer = setTimeout(() => this.clearHighlight(),
      this.numberConfig('highlightDurationMs', 1400, 250, 10000));
    await this.delay(this.numberConfig('minimumDisplayMs', 450, 100, 5000), job);
  }

  async closeReplay(uri) {
    const key = uri.toString();
    const tabs = this.api.window.tabGroups.all.flatMap(group => group.tabs)
      .filter(tab => tab.input?.uri?.toString() === key);
    this.closingReplayUri = key;
    try {
      if (!tabs.length || await this.api.window.tabGroups.close(tabs, true)) this.replayContents.delete(key);
    } catch (error) {
      // Retain complete content if VS Code cannot close its tab. A later close frees it.
      this.log(`Could not close replay preview: ${String(error)}`);
    } finally {
      this.closingReplayUri = undefined;
    }
  }

  async playTyping(job, hunk) {
    if (!this.valid(job) || this.isDirty(job.uri)) return;
    const plan = makeReplayPlan(job.before, job.after);
    if (!plan.typed.length || plan.typed.length > this.numberConfig('maxReplayCharacters', 20000, 100, 100000) ||
      this.replayContents.size >= 8) {
      if (plan.typed.length) this.log('Change exceeds replay limits; showing changed lines directly.');
      await this.showChange(job, hunk);
      return;
    }
    const uri = job.uri.with({ scheme: SCHEME, query: `replay=${++this.replayCounter}`, fragment: '' });
    const key = uri.toString();
    this.replayContents.set(key, plan.head + plan.tail);
    job.displayedText = plan.head + plan.tail;
    try {
      this.clearHighlight();
      const document = await this.api.workspace.openTextDocument(uri);
      const editor = await this.present(document, job);
      if (!editor) return;
      job.progress = 0;
      this.updateStatus();
      const rate = Math.max(this.numberConfig('typingCharsPerSecond', 120, 20, 400),
        plan.typed.length * 1000 / this.numberConfig('maxReplayDurationMs', 12000, 1000, 60000));
      const started = Date.now() - FRAME_MS;
      let written = plan.head;
      let index = 0;
      const headLines = plan.head.split('\n');
      let line = headLines.length - 1;
      let column = headLines[line].length;
      while (index < plan.typed.length && this.valid(job) && !job.skip) {
        const next = Math.min(plan.typed.length, Math.max(index + 1, Math.floor((Date.now() - started) * rate / 1000)));
        const chunk = plan.typed.slice(index, next).join('');
        const lines = chunk.split('\n');
        if (lines.length > 1) { line += lines.length - 1; column = lines[lines.length - 1].length; }
        else column += chunk.length;
        written += chunk;
        index = next;
        job.progress = Math.floor(index * 100 / plan.typed.length);
        this.stateEmitter.fire();
        job.displayedText = written + plan.tail;
        this.replayContents.set(key, job.displayedText);
        this.replayEmitter.fire(uri);
        // Virtual documents refresh asynchronously. Clamp the cursor to the current model.
        const visibleLine = Math.min(line, document.lineCount - 1);
        const visibleColumn = Math.min(column, document.lineAt(visibleLine).text.length);
        editor.selection = new this.api.Selection(visibleLine, visibleColumn, visibleLine, visibleColumn);
        editor.revealRange(new this.api.Range(visibleLine, visibleColumn, visibleLine, visibleColumn),
          this.api.TextEditorRevealType.InCenterIfOutsideViewport);
        if (index < plan.typed.length) await this.delay(FRAME_MS, job);
      }
      if (this.valid(job)) {
        job.progress = 100;
        this.updateStatus();
        this.replayContents.set(key, job.after);
        this.replayEmitter.fire(uri);
        await this.delay(150, job);
        await this.showChange(job, hunk);
      }
    } finally {
      // Never leave an incomplete read-only document behind when the user takes over.
      this.replayContents.set(key, this.snapshots.get(job.uri.toString()) ?? job.after);
      if (!this.disposed) this.replayEmitter.fire(uri);
      await this.closeReplay(uri);
    }
  }

  async chooseMode() {
    const selected = await this.api.window.showQuickPick([
      { label: 'Typing replay', description: 'Animate saved changes', value: 'typing' },
      { label: 'Follow changed lines', description: 'Jump without typing animation', value: 'follow' }
    ], { title: 'Codex Live Follow: Replay Mode', placeHolder: 'Choose how edits appear' });
    if (selected) await this.setSetting('mode', selected.value);
  }

  async chooseSpeed() {
    const selected = await this.api.window.showQuickPick([
      { label: 'Relaxed', description: '60 characters per second', value: 60 },
      { label: 'Normal', description: '120 characters per second', value: 120 },
      { label: 'Fast', description: '240 characters per second', value: 240 },
      { label: 'Very fast', description: '400 characters per second', value: 400 }
    ], { title: 'Codex Live Follow: Typing Speed', placeHolder: 'Long changes still finish within the duration limit' });
    if (selected) await this.setSetting('typingCharsPerSecond', selected.value);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.cancelCurrent();
    clearTimeout(this.idleTimer);
    this.clearHighlight();
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    for (const timer of this.pendingReads.values()) clearTimeout(timer);
    this.pendingReads.clear();
    this.queue.length = 0;
    this.snapshots.clear();
    this.trackedBytes = 0;
    this.revisions.clear();
    this.reading.clear();
    this.savedByEditor.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }
}

module.exports = { LiveFollow };
