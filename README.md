# Codex Live Follow

A VS Code extension that lets you watch saved code changes unfold as fast typing.

## What it does

- Watches text files in your open workspace for changes.
- Automatically switches to the changed file and replays the edit in a read-only preview.
- Opens the real file afterward and highlights the changed lines.
- Shows the current file, replay progress, and pending changes in a sidebar.

Codex makes the edits. Live Follow uses VS Code's file watcher and editor APIs to display them. The typing effect is a visual replay of a saved change, and the animation preserves the real source file.

## How to use it

1. Open the same workspace folder that Codex is editing.
2. Click the **Live Follow** terminal/play icon in the left toolbar, or **Type edits** in the status bar.
3. Keep **Follow edits** enabled and ask Codex to work on your project.

The sidebar lets you pause/resume, choose typing or direct follow, adjust typing speed, and skip a replay. It can pause while you edit or when VS Code is in the background. Unsaved files are protected, and your own editor saves are ignored by default.

## Install

Requires desktop VS Code 1.96 or newer. Use **Extensions → … → Install from VSIX…** and choose the `.vsix` file in `dist/`. Reload VS Code if prompted.

## Development

The extension makes no AI or network calls and needs no API key. Install development tools with `npm ci`; run checks with `npm test`, and build a VSIX with `npm run package`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development instructions. Independent, unofficial extension. MIT licensed.
