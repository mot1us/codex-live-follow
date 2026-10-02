# Contributing

Keep the extension small, predictable, and safe to use while someone else is editing the workspace. The animation must never write to source files. It must be possible to stop following immediately.

## Development

1. Open this repository in desktop VS Code, version 1.96 or newer.
2. Use Node.js 22 or newer and run `npm ci` to install the pinned development tools.
3. Press **F5** to launch the Extension Development Host, then open a disposable sample folder in that window.
4. Change files in the sample folder from another editor or terminal to exercise the watcher. Leave the Development Host focused and its editor idle so the interaction guard allows playback.

The runtime has no third-party dependencies. Before submitting a change, run:

```sh
npm run check
npm test
npm run test:integration
npm run package:check
npm run package
```

The Node tests exercise pure diff/replay logic and controller behavior with a VS Code API mock. The integration suite uses `@vscode/test-electron` to launch a real Extension Development Host. It creates a temporary workspace, profile, and extension directory, then removes them when the host exits. Other installed extensions are disabled for this test host.

## Host test versions

The default integration command downloads and tests stable VS Code. To test the minimum supported version in a POSIX shell:

```sh
VSCODE_VERSION=1.96.0 npm run test:integration
```

To use the installed macOS application without downloading another copy:

```sh
VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Code" npm run test:integration
```

Use the path to the actual VS Code executable for your platform, not the `code` shell wrapper. Some older macOS builds name this executable `Electron` instead of `Code`; check the app’s `Contents/MacOS` directory. `VSCODE_EXECUTABLE_PATH` takes precedence over the version download. In PowerShell, set the environment variable first, for example `$env:VSCODE_VERSION = '1.96.0'`, then run `npm run test:integration`.

On Linux without a display, install Xvfb and run:

```sh
xvfb-run -a npm run test:integration
```

CI is configured for unit checks on macOS, Windows, and Linux with Node.js 24, plus Linux with Node.js 22. Host tests target stable VS Code on all three platforms and VS Code 1.96.0 on Linux. Packaging runs on Linux after both test groups pass. The local sidebar host checks passed on macOS with both installed VS Code 1.140 and version 1.96.0, including the webview script readiness check; the hosted CI matrix has not run yet. Automated tests cover their defined scenarios; the manual checks below exercise the rest of the user experience.

## Useful manual checks

- Open the Live Follow activity bar view and use pause/resume, replay mode, speed, and editing preferences. Change a setting through VS Code Settings or a command and confirm the sidebar updates. Verify the panel in light/dark themes and with keyboard navigation.

- Create and edit HTML, CSS, and JavaScript files; confirm typing replay and direct follow both reach the latest real file.
- Save the same file repeatedly during a replay. Confirm an old version does not open after the latest one.
- Pause during a replay, then edit several files. Confirm following stays paused and resuming does not replay the paused backlog.
- Type into a dirty editor while files change externally. Confirm your unsaved work and navigation are respected.
- Switch tabs, click in the editor, and move the caret during playback. Confirm following yields and resumes only after the configured idle delay. Unfocus the window and confirm following waits.
- Change playback speed or mode during a replay. Confirm the next job uses the new setting; use Skip Current Replay to finish the current animation immediately.
- Save from the Development Host with `ignoreEditorSaves` enabled, then write externally. Only the external write should replay.
- Delete or rename a queued file, close the folder, and switch workspace folders while a replay runs.
- Try Unicode, CRLF, large files, binary files, ignored folders, multiple workspace folders, and light/dark themes.

Use a minimal reproduction when reporting an issue: VS Code version, operating system, whether the workspace is local or remote, mode/settings, and the order of edits that caused the issue. Remove private paths and code from logs or recordings before sharing them.

See [architecture](docs/architecture.md) for the event flow and [release preparation](docs/releasing.md) for packaging and publication.
