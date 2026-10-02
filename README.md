# Codex Live Follow

Watch saved code changes appear as fast typing in VS Code. A read-only preview replays the change, then opens the real file and highlights the edited lines. The animation never rewrites your source files.

This is an independent, unofficial companion, not an OpenAI product. It works alongside Codex and other tools that write workspace files. It does not use AI, require an API key, or add model usage charges.

## Install and watch

Requires desktop VS Code 1.96 or newer and an open workspace folder.

1. In VS Code, open **Extensions → … → Install from VSIX…** and select the packaged `.vsix` file.
2. Reload VS Code if prompted, then open the folder where your agent is working.
3. Ask the agent to create or edit a text file. The editor follows when the change reaches disk.

Click the **Live Follow** terminal/play icon in the left activity bar to open the dedicated sidebar. You can also click **Type edits** in the bottom status bar. The sidebar shows live status, the current file, pending changes, and replay progress. Use its **Follow edits** switch to pause or resume.

Choose typing replay or direct follow, drag the speed slider, skip the current replay, and adjust automatic pauses directly in the sidebar. **All settings** opens the complete VS Code Settings page. Run **Codex Live Follow: Open Controls** or **Open Live Follow Sidebar** to open the same panel from the Command Palette. These actions also have individual Command Palette commands. Speed and mode changes apply to subsequent jobs; use **Skip Current Replay** or **Pause Following** to interrupt the current replay.

Following yields when you type, move the caret, click in an editor, or switch files, and resumes after three seconds of inactivity. It also waits while the VS Code window is unfocused. Manual pause stays paused until you resume. Dirty editors are skipped, and saves from this VS Code window are ignored by default.

> The extension watches saved files. The typing effect replays a completed write; it is not a live stream of model tokens. It cannot identify Codex specifically: formatters, generators, another editor, and other agents can trigger it.

## Settings

Search for **Codex Live Follow** in Settings. All keys below have the prefix `codexLiveFollow.`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `enabled` | `true` | Enable following. |
| `mode` | `typing` | Animate changes, or use `follow` to reveal them directly. |
| `pauseOnInteraction` | `true` | Yield when you interact with the editor. |
| `idleDelayMs` | `3000` | Wait this long after interaction before following again. |
| `pauseWhenUnfocused` | `true` | Wait while this VS Code window is unfocused. |
| `ignoreEditorSaves` | `true` | Suppress replays of saves from this VS Code window. |
| `excludeDirectories` | `[]` | Additional folder names to skip anywhere in the workspace. Built-in exclusions remain. |
| `typingCharsPerSecond` | `120` | Requested typing speed; long replays accelerate to fit the duration cap. |
| `maxReplayCharacters` | `20000` | Larger changes open directly. |
| `maxReplayDurationMs` | `12000` | Maximum target duration for each typing replay. |
| `highlightDurationMs` | `1400` | How long changed lines stay highlighted. |
| `minimumDisplayMs` | `450` | Minimum display time before the next change. |
| `maxFileSizeKB` | `512` | Skip files above this size. |

## If nothing appears

- Open the exact folder or worktree the agent is editing. A different checkout is a different set of files.
- Check that the status bar shows following is enabled and the change was saved to disk.
- Leave the editor idle for three seconds with the VS Code window focused. A dirty file is skipped; saves made in this window are ignored by default.
- Dependency/build directories, binary content, invalid UTF-8, lockfiles, and VSIX files are skipped. Files above the size limit are skipped too.
- Deletion-only edits and changes above the replay character limit open directly instead of typing. An initial workspace scan may take a moment.

VS Code can briefly display the completed real file before the replay opens. Several separated changes may replay as one larger block. The snapshot cache is bounded, so a file without a cached baseline may be treated as newly created.

## Privacy and performance

The extension makes no network or model calls and collects no telemetry. Text snapshots and animation frames stay in memory on the VS Code workspace extension host: on your computer for local folders, or on the remote host for remote workspaces. The normal remote VS Code connection carries editor content. Diagnostic output can include file paths and errors. Codex and other extensions have their own data handling.

Changes are event driven and debounced. The cache is limited to 1,200 files and 32 MiB of text; animation refreshes at up to 20 frames per second. The pending queue is capped at 12 jobs and 8 MiB of text. Newer writes supersede old replays. Large repositories and large virtual documents still need more work from VS Code; these bounds are not a promise about total CPU or process memory.

## Develop and distribute

Use Node.js 22 or newer. The extension has no third-party runtime dependencies; the development dependencies provide standard VS Code packaging and host testing.

```sh
npm ci
npm run check
npm test
npm run test:integration
npm run package:check
npm run package
```

`npm test` runs the Node unit tests. `npm run test:integration` launches a real VS Code Extension Development Host with a temporary workspace, profile, and extension directory, which are removed afterward. It downloads stable VS Code by default. Set `VSCODE_VERSION` to test another release, or `VSCODE_EXECUTABLE_PATH` to use an installed VS Code executable. On headless Linux, use `xvfb-run -a npm run test:integration`. See `CONTRIBUTING.md` for examples.

Packaging creates `dist/codex-live-follow-<version>.vsix` and a SHA-256 checksum. Install that VSIX through **Install from VSIX…**. Open the source folder in VS Code and press **F5** to launch an Extension Development Host for debugging.

The source includes `CONTRIBUTING.md` for manual checks, `SECURITY.md` for privacy and reporting, `docs/architecture.md` for implementation details, and `docs/releasing.md` for GitHub and Marketplace preparation. See `CHANGELOG.md` for version history. The current `local` publisher is for development; a public release needs the owner's repository and registered Marketplace publisher. CI is configured to test across operating systems before building and uploading a VSIX artifact; it does not publish a Marketplace release. Those hosted jobs have not run for this local distribution yet.

For an issue report, include the extension/VS Code versions, operating system, local or remote workspace, relevant settings, and a minimal reproduction. Remove private paths and code from logs or recordings before sharing them.

Licensed under the MIT License; see `LICENSE.txt`.
