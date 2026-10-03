# Codex Live Follow

A VS Code extension that lets you watch saved code changes unfold as fast typing.

## What it does

- Watches text files in your open workspace for changes.
- Automatically switches to the changed file and replays the edit in a read-only preview.
- Opens the real file afterward and highlights the changed lines.
- Shows the current file, replay progress, and pending changes in a sidebar.
- Highlights files and lines reported by an agent during a bug investigation.

Codex makes the edits. Live Follow uses VS Code's file watcher and editor APIs to display them. The typing effect is a visual replay of a saved change, and the animation preserves the real source file.

## How to use it

1. Open the same workspace folder that Codex is editing.
2. Click the **Live Follow** terminal/play icon in the left toolbar, or **Type edits** in the status bar.
3. Keep **Follow edits** enabled and ask Codex to work on your project.

The sidebar lets you pause/resume, choose typing or direct follow, adjust typing speed, and skip a replay. It can pause while you edit or when VS Code is in the background. Unsaved files are protected, and your own editor saves are ignored by default.

## Watching a bug investigation

Live Follow can show the source line an agent is checking before any edit happens.
The sidebar displays **Inspecting code**, the file and line, and a short explanation.
An agent can label a location as a possible cause while investigating it.

File watchers cannot detect which source lines an agent reads. This feature uses
explicit local reports from the agent; it does not find bugs itself. This repository's
`AGENTS.md` asks coding agents to report meaningful inspection locations automatically.
To use it in another project, add the same reporting instruction to that project's
agent instructions and provide a helper, or have the agent write the report directly.

From this repository root:

```sh
node scripts/inspect-line.js assets/sidebar.css 15 "Checking the status card height" suspect
```

The helper writes `.codex-live-follow/activity.json` in the current workspace:

```json
{"id":"unique-report-id","path":"assets/sidebar.css","line":15,"endLine":27,"message":"Checking the status card height","phase":"inspect"}
```

Use a new `id` for each report, a relative file path, and one-based line numbers.
`endLine` and `phase` are optional; phase is `inspect` or `suspect`.
Only new writes are followed, so reopening a project does not replay old reports.
Reports are validated, size limited, and use the same bounded queue, pause controls,
and unsaved-file protection as edits. Add `.codex-live-follow/` to your project's
`.gitignore`. Neither the helper nor the extension makes network or AI calls.

## Install

Requires desktop VS Code 1.96 or newer. Build an installer with `npm ci` followed by `npm run package`. Use **Extensions → … → Install from VSIX…** and choose the generated `.vsix` file in `dist/`. Reload VS Code if prompted.

## Development

The extension makes no AI or network calls and needs no API key. Install development tools with `npm ci`; run checks with `npm test`, and build a VSIX with `npm run package`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development instructions. Independent, unofficial extension. MIT licensed.
