'use strict';

const { createHash } = require('node:crypto');
const { changedHunks } = require('./diff');
const { makeReplayStages } = require('./replay');
const { RecentEdits } = require('./history');
const { compileGlobs, escapeGlob } = require('./ignore');
const { setupInspection } = require('./setup');
const { FollowSidebar, VIEW_ID } = require('./sidebar');
const { InspectionFeed } = require('./inspection');
const { ReadPool } = require('./read-pool');
const demo = require('./demo');

const SNAPSHOT_LIMIT = 1200;
const SNAPSHOT_BYTES = 32 * 1024 * 1024;
const QUEUE_LIMIT = 12;
const QUEUE_BYTES = 8 * 1024 * 1024;
const FRAME_MS = 50;
const READ_LIMIT = 8;
const FRAME_BYTES = 128 * 1024;
const SCHEME = 'codex-live-follow';
const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.venv',
  'venv', 'target', 'coverage', '__pycache__', '.vscode-test', '.cache', '.vscode', '.codex-live-follow'
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
    this.readPool = new ReadPool(READ_LIMIT);
    this.readSerial = 0;
    this.pendingReads = new Map();
    this.savedByEditor = new Map();
    this.queue = [];
    this.history = new RecentEdits();
    this.skipped = 0;
    this.globCache = new Map();
    this.watchers = [];
    this.disposables = [];
    this.inspections = new InspectionFeed(vscode, (event, current) => this.handleInspection(event, current));
    this.disposables.push(this.inspections);
    this.replayContents = new Map();
    this.replayCounter = 0;
    this.generation = 0;
    this.enabled = this.readEnabled();
    this.disposed = false;
    this.playing = false;
    this.initializing = false;
    this.quietUntil = 0;
    this.windowFocused = vscode.window.state?.focused !== false;
    this.output = vscode.window.createOutputChannel('Specter');
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.status.name = 'Specter';
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

  hasProjectDecision() {
    const setting = this.api.workspace.getConfiguration('codexLiveFollow').inspect('enabled');
    return typeof setting?.workspaceValue === 'boolean' ||
      typeof setting?.workspaceFolderValue === 'boolean' ||
      typeof this.context.workspaceState.get('followDecision') === 'boolean';
  }

  readEnabled() {
    const setting = this.api.workspace.getConfiguration('codexLiveFollow').inspect('enabled');
    const explicit = typeof setting?.workspaceValue === 'boolean' ||
      typeof setting?.workspaceFolderValue === 'boolean';
    const approved = explicit || this.context.workspaceState.get('followDecision') === true;
    return approved && this.config('enabled', true);
  }

  async askFirstUse() {
    if (this.disposed || this.promptPending || !this.api.workspace.workspaceFolders?.length ||
      this.hasProjectDecision()) return;
    this.promptPending = true;
    try {
      // Dismissing the invitation keeps the project paused and avoids repeated prompts.
      await this.context.workspaceState.update('followDecision', false);
      const generation = this.generation;
      const choice = await this.api.window.showInformationMessage(
        'Enable Specter for this project? It will replay saved changes and open the edited files.',
        'Enable for this project', 'Keep paused');
      if (this.disposed || generation !== this.generation) return;
      if (choice === 'Enable for this project') await this.setSetting('enabled', true);
    } catch (error) {
      this.log(`Could not show first-use controls: ${String(error)}`);
    } finally {
      this.promptPending = false;
      this.applyConfiguration();
    }
  }

  numberConfig(key, fallback, min, max) {
    const value = this.config(key, fallback);
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value)) : fallback;
  }

  log(message) {
    if (!this.disposed) this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  typingSpeed() {
    return this.liveSpeed ?? this.numberConfig('typingCharsPerSecond', 120, 20, 400);
  }

  previewSpeed(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 400) return;
    this.liveSpeed = value;
    this.updateStatus();
  }

  clearSpeedPreview() {
    if (this.liveSpeed === undefined) return;
    this.liveSpeed = undefined;
    this.updateStatus();
  }

  getState() {
    let status = 'watching';
    let title = 'Waiting for saves';
    let detail = 'The next saved change will show up here.';
    if (!this.api.workspace.workspaceFolders?.length && !this.demoJob) {
      status = 'empty'; title = 'Open a project folder'; detail = 'Open a project to get started.';
    } else if (!this.enabled && !this.demoJob) {
      status = 'paused'; title = 'Paused'; detail = 'Enable replay to show saved edits.';
    } else if (this.initializing) {
      status = 'preparing'; title = 'Reading project files'; detail = 'Getting ready to watch for changes.';
    } else if (this.isWaiting()) {
      status = 'waiting';
      const background = !this.windowFocused && this.config('pauseWhenUnfocused', true);
      title = background ? 'Waiting for this window' : 'Waiting while you work';
      detail = background ? 'Resumes when you come back to VS Code.' :
        `Resumes after ${this.numberConfig('idleDelayMs', 3000, 500, 60000) / 1000} seconds idle.`;
    } else if (this.currentJob && !this.currentJob.cancelled) {
      status = 'playing'; title = 'Replaying an edit'; detail = 'Showing the latest save.';
      if (this.currentJob.truncated) detail = 'Replay hit its time limit; showing the saved file.';
      if (this.currentJob.kind === 'inspection') {
        status = 'inspecting';
        title = this.currentJob.phase === 'suspect' ? 'Checking a hunch' : 'Taking a look';
        detail = this.currentJob.message;
      }
      if (this.currentJob.demo) {
        title = status === 'inspecting' ? 'Testing a line inspection' : 'Testing typing replay';
        if (status === 'playing') detail = '30-second demo. Try the speed slider or Skip current.';
      }
    }
    const job = this.currentJob && !this.currentJob.cancelled ? this.currentJob : undefined;
    return {
      enabled: this.enabled, status, title, detail,
      configurationScope: this.api.workspace.workspaceFolders?.length ? 'workspace' : 'user',
      file: job ? (job.demo ? 'Specter-test.js' : this.api.workspace.asRelativePath(job.uri, false)) : '',
      line: job?.kind === 'inspection' ? job.line : null,
      pending: this.queue.length, canSkip: status === 'playing' || status === 'inspecting',
      progress: status === 'playing' && typeof job?.progress === 'number' ? job.progress : null,
      mode: this.config('mode', 'typing'),
      speed: this.typingSpeed(),
      pauseOnInteraction: this.config('pauseOnInteraction', true),
      pauseWhenUnfocused: this.config('pauseWhenUnfocused', true),
      ignoreEditorSaves: this.config('ignoreEditorSaves', true),
      replayPane: this.config('replayPane', 'current'),
      skipped: this.skipped,
      testing: !!this.demoJob,
      recent: this.history.entries.map(entry => ({ id: entry.id,
        file: this.api.workspace.asRelativePath(entry.uri, true), time: entry.time, skipped: entry.skipped }))
    };
  }

  updateStatus() {
    if (this.disposed) return;
    if (this.demoJob) this.status.text = '$(beaker) Specter: testing';
    else if (!this.enabled) this.status.text = '$(eye-closed) Specter: paused';
    else if (!this.api.workspace.workspaceFolders?.length) this.status.text = '$(folder) Open a folder';
    else if (this.initializing) this.status.text = '$(sync~spin) Specter: starting';
    else if (this.isWaiting()) this.status.text = '$(debug-pause) Specter: waiting';
    else if (this.currentJob?.kind === 'inspection') this.status.text = '$(search) Taking a look';
    else if (this.currentJob) this.status.text = '$(play) Specter: replaying';
    else this.status.text = this.config('mode', 'typing') === 'typing'
      ? '$(keyboard) Specter' : '$(eye) Specter';
    this.status.tooltip = `Specter: ${this.getState().detail}\nClick for controls.`;
    this.status.accessibilityInformation = { label: this.status.tooltip };
    this.stateEmitter.fire();
  }

  async setSetting(key, value) {
    if (key === 'enabled' && this.api.workspace.workspaceFolders?.length) {
      await this.context.workspaceState.update('followDecision', value);
    }
    const target = this.api.workspace.workspaceFolders?.length
      ? this.api.ConfigurationTarget.Workspace : this.api.ConfigurationTarget.Global;
    try {
      await this.api.workspace.getConfiguration('codexLiveFollow').update(key, value, target);
    } finally {
      if (key === 'typingCharsPerSecond' && this.liveSpeed === value) this.clearSpeedPreview();
    }
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
    register('pause', () => {
      this.cancelCurrent();
      this.demoJob = undefined;
      return this.setSetting('enabled', false);
    });
    register('resume', () => { this.quietUntil = 0; return this.setSetting('enabled', true); });
    this.sidebar = new FollowSidebar(this.api, this.context, this);
    this.disposables.push(this.sidebar, window.registerWebviewViewProvider(VIEW_ID, this.sidebar));
    register('controls', () => this.sidebar.open());
    register('openSidebar', () => this.sidebar.open());
    register('settings', () => commands.executeCommand('workbench.action.openSettings', 'codexLiveFollow'));
    register('setSpeed', () => this.chooseSpeed());
    register('setMode', () => this.chooseMode());
    register('showOutput', () => this.output.show(true));
    register('ignore', uri => this.ignorePath(uri));
    register('setupInspection', () => setupInspection(this.api, this.context));
    register('testSpecter', () => this.testSpecter());
    register('replayRecent', id => this.replayRecent(id));
    register('clearRecent', () => {
      this.history.clear();
      this.skipped = 0;
      this.queue = this.queue.filter(job => !job.historical);
      if (this.currentJob?.historical) this.cancelCurrent();
      this.updateStatus();
    });
    register('skipReplay', () => {
      if (this.currentJob) { this.currentJob.skip = true; this.currentJob.wake?.(); }
    });
    this.disposables.push(
      workspace.onDidChangeWorkspaceFolders(() => {
        void this.resetWorkspace().then(() => this.askFirstUse());
      }),
      workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('codexLiveFollow')) return;
        this.applyConfiguration();
        if (event.affectsConfiguration('codexLiveFollow.excludeDirectories') ||
          event.affectsConfiguration('codexLiveFollow.excludeGlobs') ||
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
    void this.askFirstUse();
    this.log('Started. File writes are detected locally in the workspace extension host.');
  }

  applyConfiguration() {
    if (this.disposed) return;
    const enabled = this.readEnabled();
    if (this.enabled !== enabled) this.cancelCurrent();
    this.enabled = enabled;
    if (!this.enabled) { this.queue.length = 0; this.clearHighlight(); }
    this.updateStatus();
    if (this.enabled) void this.playQueue();
  }

  userActivity(reason = 'editor interaction') {
    if (this.disposed || !this.config('pauseOnInteraction', true)) return;
    if (this.pendingPresentation) this.pendingPresentation.restore = this.navigationEditor();
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
    return !this.disposed && (this.enabled || job.demo) && !job.cancelled &&
      job.generation === this.generation && !this.isWaiting();
  }

  async resetWorkspace() {
    const generation = ++this.generation;
    this.inspections.reset();
    this.cancelCurrent();
    this.demoJob = undefined;
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    for (const timer of this.pendingReads.values()) clearTimeout(timer);
    this.pendingReads.clear();
    this.readPool.clear();
    this.revisions.clear();
    this.reading.clear();
    this.snapshots.clear();
    this.savedByEditor.clear();
    this.trackedBytes = 0;
    this.queue.length = 0;
    this.history.clear();
    this.skipped = 0;
    this.globCache.clear();
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
        '**/{.git,node_modules,dist,build,out,.next,.venv,venv,target,coverage,__pycache__,.vscode-test,.cache,.vscode,.codex-live-follow}/**',
        SNAPSHOT_LIMIT);
      if (this.disposed || generation !== this.generation) return;
      let next = 0;
      await Promise.all(Array.from({ length: READ_LIMIT }, async () => {
        while (next < files.length && !this.disposed && generation === this.generation) {
          const uri = files[next++];
          if (this.isIgnored(uri)) continue;
          const key = uri.toString();
          const revision = this.revisions.get(key);
          const text = await this.readText(uri, () => generation === this.generation &&
            revision === this.revisions.get(key));
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
    const folder = this.api.workspace.getWorkspaceFolder(uri);
    const relative = uri.path.slice(folder.uri.path.length + 1);
    const patterns = this.api.workspace.getConfiguration('codexLiveFollow', uri).get('excludeGlobs', []);
    const signature = JSON.stringify(patterns);
    if (!this.globCache.has(signature)) {
      if (this.globCache.size >= 20) this.globCache.clear();
      this.globCache.set(signature, compileGlobs(patterns));
    }
    const extra = this.config('excludeDirectories', []);
    const excluded = Array.isArray(extra) ? extra : [];
    return relative.split('/').some(part => SKIP_DIRECTORIES.has(part) || excluded.includes(part)) ||
      /\.(vsix|lock)$/i.test(relative) || this.globCache.get(signature)(relative);
  }

  isDirty(uri) {
    return this.api.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString() && doc.isDirty);
  }

  readText(uri, current = () => true, key, onOverflow) {
    const valid = () => !this.disposed && current();
    return this.readPool.run(async () => {
      try {
        const limit = this.numberConfig('maxFileSizeKB', 512, 16, 4096) * 1024;
        const stat = await this.api.workspace.fs.stat(uri);
        if (!valid() || !(stat.type & this.api.FileType.File) || stat.size > limit) return null;
        const bytes = await this.api.workspace.fs.readFile(uri);
        if (!valid() || bytes.byteLength > limit || bytes.includes(0)) return null;
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch { return null; }
    }, valid, key, onOverflow);
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
    if (this.disposed) return;
    if (this.inspections.schedule(uri, this.generation) || this.isIgnored(uri)) return;
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
      const current = await this.readText(uri, () => generation === this.generation &&
        revision === this.revisions.get(key), `write:${key}`, () => {
          this.skipped++;
          this.updateStatus();
        });
      if (this.disposed || generation !== this.generation || revision !== this.revisions.get(key)) return;
      if (current === null || this.isIgnored(uri)) return;
      const previous = this.snapshots.get(key);
      this.remember(uri, current);
      const saved = this.savedByEditor.get(key);
      if (saved) this.savedByEditor.delete(key);
      if (!this.enabled || previous === current || this.isDirty(uri)) return;
      if (this.config('ignoreEditorSaves', true) && saved?.expires > Date.now() && saved.hash === digest(current)) return;
      const queued = this.queue.find(job => job.kind !== 'inspection' && !job.historical && job.uri.toString() === key);
      const active = this.currentJob?.uri.toString() === key ? this.currentJob : undefined;
      // Preserve the earliest unseen baseline when multiple writes are coalesced.
      const before = queued?.before ?? (active?.historical ? undefined : active?.displayedText) ?? previous ?? '';
      this.queue = this.queue.filter(job => job.uri.toString() !== key);
      if (active) this.cancelCurrent();
      const job = { uri, before, after: current, generation,
        bytes: Buffer.byteLength(before) + Buffer.byteLength(current) };
      job.historyId = this.history.add(job);
      this.enqueue(job);
    } finally {
      reads.delete(revision);
      if (this.reading.get(key) === reads && !reads.size) this.reading.delete(key);
      this.releaseRevision(key);
    }
  }

  releaseRevision(key) {
    if (!this.initializing && !this.pendingReads.has(key) && !this.reading.has(key)) this.revisions.delete(key);
  }

  async handleInspection(event, current = () => true) {
    if (this.disposed || !this.enabled || event.generation !== this.generation ||
      !current() || this.isIgnored(event.uri) || this.isDirty(event.uri)) return;
    if (await this.readText(event.uri, () => current() && this.enabled &&
      event.generation === this.generation) === null || this.disposed || !this.enabled ||
      !current() || event.generation !== this.generation || this.isDirty(event.uri)) return;
    this.enqueue({ ...event, kind: 'inspection', bytes: Buffer.byteLength(event.message) });
  }

  enqueue(job) {
    if (job.kind === 'inspection') {
      const project = this.api.workspace.getWorkspaceFolder(job.uri)?.uri.toString();
      this.queue = this.queue.filter(pending => pending.kind !== 'inspection' ||
        this.api.workspace.getWorkspaceFolder(pending.uri)?.uri.toString() !== project);
      this.queue.push(job);
    } else {
      const inspection = this.queue.findIndex(pending => pending.kind === 'inspection');
      this.queue.splice(inspection < 0 ? this.queue.length : inspection, 0, job);
    }
    let bytes = this.queue.reduce((sum, pending) => sum + pending.bytes, 0);
    while (this.queue.length > QUEUE_LIMIT || bytes > QUEUE_BYTES) {
      const inspection = this.queue.findIndex(pending => pending.kind === 'inspection');
      const [dropped] = this.queue.splice(inspection < 0 ? 0 : inspection, 1);
      bytes -= dropped.bytes;
      if (dropped.kind !== 'inspection') {
        this.skipped++;
        this.history.markSkipped(dropped.historyId);
      }
    }
    this.updateStatus();
    void this.playQueue();
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
    if (this.playing || this.initializing || this.disposed ||
      (!this.enabled && !this.demoJob) || this.isWaiting()) return;
    this.playing = true;
    try {
      while (((this.queue.length && this.enabled) || this.demoJob) &&
        !this.disposed && !this.initializing && !this.isWaiting()) {
        const job = this.demoJob || this.queue.shift();
        if (job.generation !== this.generation || (!job.demo && (this.isDirty(job.uri) || this.isIgnored(job.uri)))) {
          if (this.demoJob === job) this.demoJob = undefined;
          continue;
        }
        this.currentJob = job;
        this.updateStatus();
        try {
          if (job.demo) {
            await this.playTyping(job);
            if (this.valid(job) && !job.skip) {
              job.kind = 'inspection';
              job.line = 2;
              job.phase = 'inspect';
              job.message = 'This sample inspection highlights line 2.';
              this.updateStatus();
              await this.showChange(job, { start: 1, end: 2 });
            }
            continue;
          } else if (job.kind === 'inspection') {
            await this.showChange(job, { start: job.line - 1, end: job.endLine });
            continue;
          }
          if (this.config('mode', 'typing') === 'typing') await this.playTyping(job);
          else for (const hunk of changedHunks(job.before, job.after).slice(0, 6)) {
            if (!this.valid(job) || job.skip) break;
            await this.showChange(job, hunk);
          }
        } catch (error) {
          this.log(`Could not show ${this.api.workspace.asRelativePath(job.uri)}: ${String(error)}`);
        } finally {
          if (this.demoJob === job) this.demoJob = undefined;
          this.currentJob = undefined;
        }
      }
    } finally {
      this.playing = false;
      this.updateStatus();
      // A reset or config change may have enqueued work while this job unwound.
      if (((this.queue.length && this.enabled) || this.demoJob) &&
        !this.initializing && !this.disposed && !this.isWaiting()) {
        void this.playQueue();
      }
    }
  }

  async present(document, job) {
    if (!this.valid(job) || this.isDirty(job.uri)) return undefined;
    const presentation = { restore: this.navigationEditor() };
    this.pendingPresentation = presentation;
    this.pendingShowUri = document.uri.toString();
    job.presentedUri = this.pendingShowUri;
    try {
      if (!this.api.window.tabGroups.all.some(group => group.viewColumn === this.replayColumn)) {
        this.replayColumn = undefined;
      }
      const editor = await this.api.window.showTextDocument(document, {
        preview: true, preserveFocus: true,
        viewColumn: this.config('replayPane', 'current') === 'beside'
          ? this.replayColumn ?? this.api.ViewColumn.Beside : this.api.ViewColumn.Active
      });
      if (this.config('replayPane', 'current') === 'beside') this.replayColumn = editor.viewColumn;
      if (!this.valid(job) || this.isDirty(job.uri)) {
        await this.restoreNavigation(presentation, editor);
        return undefined;
      }
      return editor;
    } finally {
      this.pendingShowUri = undefined;
      this.pendingPresentation = undefined;
    }
  }

  navigationEditor() {
    const { window } = this.api;
    return window.activeTextEditor ?? window.visibleTextEditors.find(editor =>
      editor.viewColumn === window.tabGroups.activeTabGroup.viewColumn);
  }

  async restoreNavigation(presentation, lateEditor) {
    // showTextDocument cannot be cancelled. Repair only a display that displaced
    // the user's editor, and keep any newer navigation made during the repair.
    while (!this.disposed && this.navigationEditor()?.document === lateEditor.document) {
      const target = presentation.restore;
      if (!target || target.document.uri.toString() === lateEditor.document.uri.toString() ||
        target.document.uri.scheme === SCHEME) return;
      const document = target.document.isClosed
        ? await this.api.workspace.openTextDocument(target.document.uri) : target.document;
      if (this.disposed) return;
      if (target !== presentation.restore) continue;
      if (this.navigationEditor()?.document !== lateEditor.document) return;
      this.pendingShowUri = document.uri.toString();
      lateEditor = await this.api.window.showTextDocument(document, {
        preview: false, preserveFocus: true, viewColumn: target.viewColumn,
        selection: target.selection
      });
    }
  }

  async showChange(job, hunk) {
    if (!this.valid(job) || this.isDirty(job.uri)) return;
    const uri = job.historical ? job.uri.with({ scheme: SCHEME,
      query: `history=${++this.replayCounter}`, fragment: '' }) : job.uri;
    if (job.historical) this.replayContents.set(uri.toString(), job.after);
    try {
      const document = await this.api.workspace.openTextDocument(uri);
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
      const displayMs = job.demo ? demo.inspectionMs : job.kind === 'inspection'
        ? this.numberConfig('inspectionDisplayMs', 1500, 300, 10000)
        : this.numberConfig('minimumDisplayMs', 450, 100, 5000);
      this.highlightTimer = setTimeout(() => this.clearHighlight(),
        Math.max(displayMs, this.numberConfig('highlightDurationMs', 1400, 250, 10000)));
      await this.delay(displayMs, job);
    } finally {
      if (job.historical) await this.closeReplay(uri);
    }
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

  async playTyping(job) {
    if (!this.valid(job) || this.isDirty(job.uri)) return;
    const stages = makeReplayStages(job.before, job.after,
      job.demo ? demo.maxCharacters : this.numberConfig('maxReplayCharacters', 20000, 100, 100000));
    const count = stages.reduce((sum, stage) => sum + stage.typed.length, 0);
    if (!count || stages.some(stage => stage.limited) || this.replayContents.size >= 8) {
      if (count || stages.some(stage => stage.limited)) this.log('Change exceeds replay limits; showing changed lines directly.');
      for (const { hunk: changed } of stages.slice(0, 6)) {
        if (!this.valid(job) || job.skip) break;
        await this.showChange(job, changed);
      }
      return;
    }
    const uri = job.uri.with({ scheme: SCHEME, query: `replay=${++this.replayCounter}`, fragment: '' });
    const key = uri.toString();
    job.displayedText = job.before;
    this.replayContents.set(key, job.before);
    try {
      this.clearHighlight();
      const document = await this.api.workspace.openTextDocument(uri);
      const editor = await this.present(document, job);
      if (!editor) return;
      job.progress = 0;
      this.updateStatus();
      const duration = job.demo ? demo.durationMs : this.numberConfig('maxReplayDurationMs', 12000, 1000, 60000);
      const started = Date.now();
      const frameMs = Math.min(250, Math.max(FRAME_MS,
        Math.ceil(Math.max(Buffer.byteLength(job.before), Buffer.byteLength(job.after)) / FRAME_BYTES) * FRAME_MS));
      const waitFrame = () => this.delay(Math.min(frameMs, Math.max(0, duration - (Date.now() - started))), job);
      let lastFrame = started - FRAME_MS;
      let allowance = 0;
      let completed = 0;
      stagesLoop: for (const stage of stages) {
        if (!this.valid(job) || job.skip) break;
        const head = job.displayedText.slice(0, stage.start);
        const tail = job.displayedText.slice(stage.start + stage.deleteCount);
        let written = head;
        let index = 0;
        const headLines = head.split('\n');
        let line = headLines.length - 1;
        let column = headLines[line].length;
        // Deletions also produce a frame; untouched blocks stay in place throughout.
        job.displayedText = written + tail;
        this.replayContents.set(key, job.displayedText);
        this.replayEmitter.fire(uri);
        do {
          const now = Date.now();
          if (now - started >= duration) {
            job.truncated = true;
            break stagesLoop;
          }
          // Account for this frame at the current speed. Changing the slider
          // must not recalculate all elapsed time and jump through code.
          allowance += Math.max(0, now - lastFrame) * this.typingSpeed() / 1000;
          lastFrame = now;
          const target = Math.floor(allowance) - completed;
          const next = Math.min(stage.typed.length, Math.max(index, target));
          if (next === index && index < stage.typed.length) {
            await waitFrame();
            continue;
          }
          const chunk = stage.typed.slice(index, next).join('');
          const lines = chunk.split('\n');
          if (lines.length > 1) { line += lines.length - 1; column = lines.at(-1).length; }
          else column += chunk.length;
          written += chunk;
          index = next;
          job.progress = job.demo ? Math.min(99, Math.floor((now - started) * 100 / duration))
            : Math.floor((completed + index) * 100 / count);
          job.displayedText = written + tail;
          this.replayContents.set(key, job.displayedText);
          this.replayEmitter.fire(uri);
          this.stateEmitter.fire();
          const visibleLine = Math.min(line, document.lineCount - 1);
          const visibleColumn = Math.min(column, document.lineAt(visibleLine).text.length);
          editor.selection = new this.api.Selection(visibleLine, visibleColumn, visibleLine, visibleColumn);
          editor.revealRange(new this.api.Range(visibleLine, visibleColumn, visibleLine, visibleColumn),
            this.api.TextEditorRevealType.InCenterIfOutsideViewport);
          if (index < stage.typed.length) await waitFrame();
        } while (index < stage.typed.length && this.valid(job) && !job.skip);
        completed += stage.typed.length;
      }
      if (this.valid(job)) {
        job.displayedText = job.after;
        job.progress = 100;
        this.replayContents.set(key, job.after);
        this.replayEmitter.fire(uri);
        this.updateStatus();
        await this.delay(150, job);
        if (job.historical) await this.delay(this.numberConfig('minimumDisplayMs', 450, 100, 5000), job);
        else await this.showChange(job, stages[0]?.hunk);
      }
    } finally {
      // A historical replay is a read-only snapshot, never a restore operation.
      this.replayContents.set(key, job.historical ? job.after : this.snapshots.get(job.uri.toString()) ?? job.after);
      if (!this.disposed) this.replayEmitter.fire(uri);
      await this.closeReplay(uri);
    }
  }

  async replayRecent(id) {
    if (id === undefined) {
      const selected = await this.api.window.showQuickPick(this.history.entries.map(entry => ({
        label: this.api.workspace.asRelativePath(entry.uri, true),
        description: new Date(entry.time).toLocaleTimeString(), id: entry.id
      })), { title: 'Specter: Replay a recent edit' });
      id = selected?.id;
    }
    const entry = typeof id === 'string' && this.history.get(id);
    if (!entry || !this.enabled || this.isDirty(entry.uri) || this.isIgnored(entry.uri)) return;
    this.enqueue({ uri: entry.uri, before: entry.before, after: entry.after,
      bytes: entry.bytes, generation: this.generation, historical: true });
  }

  testSpecter() {
    if (this.disposed || this.demoJob) return;
    // The sample uses only virtual documents; it never enters snapshots or history.
    this.demoJob = {
      uri: this.api.Uri.joinPath(this.context.extensionUri, 'Specter-test.js').with({ scheme: SCHEME }),
      before: demo.before,
      after: demo.after,
      generation: this.generation, demo: true, historical: true
    };
    clearTimeout(this.idleTimer);
    this.quietUntil = 0;
    this.updateStatus();
    void this.playQueue();
  }

  async ignorePath(uri) {
    uri ||= this.api.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file') return;
    const folder = this.api.workspace.getWorkspaceFolder(uri);
    if (!folder) return;
    const relative = uri.path.slice(folder.uri.path.length + 1);
    if (!relative) return;
    const stat = await this.api.workspace.fs.stat(uri);
    const pattern = escapeGlob(relative) + (stat.type & this.api.FileType.Directory ? '/**' : '');
    const config = this.api.workspace.getConfiguration('codexLiveFollow', uri);
    const existing = config.get('excludeGlobs', []);
    const patterns = Array.isArray(existing) ? existing : [];
    if (!patterns.includes(pattern)) {
      if (patterns.length >= 200) {
        await this.api.window.showInformationMessage('The ignore list is full. Remove an entry in Specter settings first.');
        return;
      }
      await config.update('excludeGlobs', [...patterns, pattern], this.api.ConfigurationTarget.WorkspaceFolder);
    }
  }

  async chooseMode() {
    const selected = await this.api.window.showQuickPick([
      { label: 'Typing replay', description: 'Play back each saved edit', value: 'typing' },
      { label: 'Changed lines', description: 'Go straight to the edit', value: 'follow' }
    ], { title: 'Specter: Show Edits As', placeHolder: 'Choose how to display edits' });
    if (selected) await this.setSetting('mode', selected.value);
  }

  async chooseSpeed() {
    const selected = await this.api.window.showQuickPick([
      { label: 'Slow', description: '60 characters per second', value: 60 },
      { label: 'Normal', description: '120 characters per second', value: 120 },
      { label: 'Fast', description: '240 characters per second', value: 240 },
      { label: 'Very fast', description: '400 characters per second', value: 400 }
    ], { title: 'Specter: Typing Speed', placeHolder: 'Choose a speed. It updates the current replay too.' });
    if (selected) await this.setSetting('typingCharsPerSecond', selected.value);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.cancelCurrent();
    this.demoJob = undefined;
    clearTimeout(this.idleTimer);
    this.clearHighlight();
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    for (const timer of this.pendingReads.values()) clearTimeout(timer);
    this.pendingReads.clear();
    this.readPool.dispose();
    this.queue.length = 0;
    this.snapshots.clear();
    this.history.clear();
    this.globCache.clear();
    this.trackedBytes = 0;
    this.revisions.clear();
    this.reading.clear();
    this.savedByEditor.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }
}

module.exports = { LiveFollow };
