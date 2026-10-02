'use strict';

const path = require('node:path');

class Emitter {
  constructor() {
    this.listeners = new Set();
    this.event = listener => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }
  fire(value) {
    for (const listener of this.listeners) listener(value);
  }
  dispose() { this.listeners.clear(); }
}

class Uri {
  constructor(scheme, pathname, query = '') {
    this.scheme = scheme;
    this.path = pathname;
    this.fsPath = pathname;
    this.query = query;
  }
  static file(pathname) { return new Uri('file', pathname); }
  static joinPath(base, ...parts) { return base.with({ path: path.posix.join(base.path, ...parts) }); }
  with(changes) {
    return new Uri(changes.scheme ?? this.scheme, changes.path ?? this.path,
      changes.query ?? this.query);
  }
  toString() { return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ''}`; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function until(predicate, message = 'condition was not met', timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function createVscodeMock(options = {}) {
  const events = Object.fromEntries([
    'configuration', 'folders', 'activeEditor', 'selection', 'windowState',
    'changeDocument', 'saveDocument', 'closeDocument'
  ].map(name => [name, new Emitter()]));
  const files = new Map();
  const documents = new Map();
  const watchers = [];
  const commands = new Map();
  const providers = new Map();
  const viewProviders = new Map();
  const shown = [];
  const frames = [];
  const closedTabs = [];
  const output = [];
  const config = {
    enabled: true, mode: 'typing', typingCharsPerSecond: 400,
    maxReplayDurationMs: 1000, minimumDisplayMs: 100,
    highlightDurationMs: 250, ...options.config
  };
  const hooks = {};
  const folder = { uri: Uri.file('/workspace'), name: 'workspace', index: 0 };
  const tabGroup = { viewColumn: 1, tabs: [], activeTab: undefined };
  const subscriptions = [];

  function put(uri, content) {
    files.set(uri.toString(), { uri, content });
    const document = documents.get(uri.toString());
    if (document && !document.isDirty) {
      document.text = content;
      document.version++;
    }
  }

  function documentFor(uri, text) {
    const document = {
      uri, text, version: 1, isDirty: false, isClosed: false,
      languageId: uri.path.endsWith('.js') ? 'javascript' : 'plaintext',
      getText() { return this.text; },
      get lineCount() { return this.text.split(/\r?\n/).length; },
      lineAt(index) { return { text: this.text.split(/\r?\n/)[index] || '' }; }
    };
    documents.set(uri.toString(), document);
    return document;
  }

  const vscode = {
    EventEmitter: Emitter, Uri,
    StatusBarAlignment: { Right: 2 }, OverviewRulerLane: { Full: 7 },
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    FileType: { File: 1, Directory: 2 },
    TextEditorRevealType: { InCenter: 2, InCenterIfOutsideViewport: 3 },
    TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    Range: class {
      constructor(startLine, startCharacter, endLine, endCharacter) {
        this.start = { line: startLine, character: startCharacter };
        this.end = { line: endLine, character: endCharacter };
      }
    },
    Position: class {
      constructor(line, character) { Object.assign(this, { line, character }); }
    },
    Selection: class {
      constructor(anchorLine, anchorCharacter, activeLine, activeCharacter) {
        this.anchor = { line: anchorLine, character: anchorCharacter };
        this.active = { line: activeLine, character: activeCharacter };
        this.start = this.anchor;
        this.end = this.active;
      }
    },
    RelativePattern: class {
      constructor(base, pattern) { Object.assign(this, { base, pattern }); }
    },
    commands: {
      registerCommand(name, callback) {
        commands.set(name, callback);
        return { dispose: () => commands.delete(name) };
      },
      async executeCommand(name, ...args) { return commands.get(name)?.(...args); }
    },
    window: {
      state: { focused: true },
      activeTextEditor: undefined,
      visibleTextEditors: [],
      onDidChangeActiveTextEditor: events.activeEditor.event,
      onDidChangeTextEditorSelection: events.selection.event,
      onDidChangeWindowState: events.windowState.event,
      createOutputChannel: () => ({ appendLine: line => output.push(line), show() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      createTextEditorDecorationType: () => ({ dispose() {} }),
      registerWebviewViewProvider(id, provider) {
        viewProviders.set(id, provider);
        return { dispose: () => viewProviders.delete(id) };
      },
      async showQuickPick() { return undefined; },
      async showTextDocument(document, showOptions) {
        if (hooks.showTextDocument) await hooks.showTextDocument(document, showOptions);
        const editor = {
          document, viewColumn: 1, selections: [],
          revealRange(range) { this.revealed = range; },
          setDecorations(_type, ranges) { this.decorations = ranges; }
        };
        shown.push({ document, options: showOptions, editor });
        let tab = tabGroup.tabs.find(item => item.input.uri.toString() === document.uri.toString());
        if (!tab) {
          tab = { input: { uri: document.uri }, isPreview: !!showOptions?.preview, isDirty: false };
          tabGroup.tabs.push(tab);
        }
        tabGroup.activeTab = tab;
        vscode.window.activeTextEditor = editor;
        vscode.window.visibleTextEditors = [editor];
        events.activeEditor.fire(editor);
        return editor;
      },
      tabGroups: {
        all: [tabGroup], activeTabGroup: tabGroup,
        async close(tabs) {
          if (hooks.closeTabs) await hooks.closeTabs(tabs);
          const activeBefore = tabGroup.activeTab;
          for (const tab of Array.isArray(tabs) ? tabs : [tabs]) {
            closedTabs.push(tab);
            tabGroup.tabs = tabGroup.tabs.filter(item => item !== tab);
            const document = documents.get(tab.input.uri.toString());
            if (document) {
              document.isClosed = true;
              documents.delete(tab.input.uri.toString());
              events.closeDocument.fire(document);
            }
          }
          if (activeBefore && !tabGroup.tabs.includes(activeBefore)) {
            tabGroup.activeTab = tabGroup.tabs.at(-1);
            const uri = tabGroup.activeTab?.input.uri.toString();
            const nextEditor = [...shown].reverse().find(item => item.document.uri.toString() === uri)?.editor;
            vscode.window.activeTextEditor = nextEditor;
            vscode.window.visibleTextEditors = nextEditor ? [nextEditor] : [];
            events.activeEditor.fire(nextEditor);
          }
          return true;
        }
      }
    },
    workspace: {
      workspaceFolders: [folder],
      get textDocuments() { return [...documents.values()]; },
      getWorkspaceFolder(uri) {
        return vscode.workspace.workspaceFolders?.find(item =>
          uri.scheme === item.uri.scheme && uri.path.startsWith(`${item.uri.path}/`));
      },
      getConfiguration() {
        return {
          get: (key, fallback) => config[key] ?? fallback,
          inspect: key => ({ workspaceValue: config[key] }),
          async update(key, value) {
            config[key] = value;
            events.configuration.fire({ affectsConfiguration: name =>
              name === 'codexLiveFollow' || name === `codexLiveFollow.${key}` });
          }
        };
      },
      onDidChangeWorkspaceFolders: events.folders.event,
      onDidChangeConfiguration: events.configuration.event,
      onDidChangeTextDocument: events.changeDocument.event,
      onDidSaveTextDocument: events.saveDocument.event,
      onDidCloseTextDocument: events.closeDocument.event,
      asRelativePath: uri => path.posix.relative(folder.uri.path, uri.path),
      async findFiles() { return hooks.findFiles ? hooks.findFiles() : [...files.values()].map(file => file.uri); },
      createFileSystemWatcher(pattern) {
        const change = new Emitter();
        const create = new Emitter();
        const remove = new Emitter();
        const watcher = {
          pattern, disposed: false, change, create, remove,
          onDidChange: change.event, onDidCreate: create.event, onDidDelete: remove.event,
          dispose() { this.disposed = true; change.dispose(); create.dispose(); remove.dispose(); }
        };
        watchers.push(watcher);
        return watcher;
      },
      registerTextDocumentContentProvider(scheme, provider) {
        providers.set(scheme, provider);
        const subscription = provider.onDidChange(uri => {
          const text = provider.provideTextDocumentContent(uri);
          const document = documents.get(uri.toString());
          if (document) { document.text = text; document.version++; }
          frames.push({ uri, text });
        });
        return { dispose() { subscription.dispose(); providers.delete(scheme); } };
      },
      async openTextDocument(uri) {
        if (hooks.openTextDocument) await hooks.openTextDocument(uri);
        if (documents.has(uri.toString())) return documents.get(uri.toString());
        const provider = providers.get(uri.scheme);
        if (provider) return documentFor(uri, await provider.provideTextDocumentContent(uri));
        const file = files.get(uri.toString());
        if (!file) throw new Error(`File does not exist: ${uri}`);
        return documentFor(uri, file.content);
      },
      fs: {
        async stat(uri) {
          if (hooks.stat) return hooks.stat(uri);
          const file = files.get(uri.toString());
          if (!file) throw new Error('File not found');
          return { type: 1, size: Buffer.byteLength(file.content) };
        },
        async readFile(uri) {
          if (hooks.readFile) return hooks.readFile(uri);
          const file = files.get(uri.toString());
          if (!file) throw new Error('File not found');
          return Buffer.from(file.content);
        }
      }
    }
  };

  const context = {
    subscriptions,
    extensionUri: Uri.file('/extension'),
    workspaceState: { get: (_key, fallback) => fallback, async update() {} }
  };
  return {
    vscode, context, config, events, files, documents, watchers, commands,
    shown, frames, closedTabs, output, hooks, put, documentFor, viewProviders,
    uri: name => Uri.file(`/workspace/${name}`),
    write(uri, content, created = false) {
      put(uri, content);
      for (const watcher of watchers) {
        if (!watcher.disposed) (created ? watcher.create : watcher.change).fire(uri);
      }
    },
    remove(uri) {
      files.delete(uri.toString());
      for (const watcher of watchers) {
        if (!watcher.disposed) watcher.remove.fire(uri);
      }
    },
    async configure(key, value) { await vscode.workspace.getConfiguration().update(key, value); },
    dispose() { for (const item of subscriptions) item.dispose?.(); }
  };
}

module.exports = { createVscodeMock, deferred, until };
