# Specter

Specter runs locally. No AI, no network connection. It simply watches your
project's files for saves and replays the changes as if they're being typed.

This is a fun exercise to see what your agent is up to in the background
when you ask it to update your project. I built it for Codex, but it should
work with other agents too, since it's just watching for file changes.

This is beta for now! [Let me know if you find any issues](https://github.com/mot1us/specter/issues).

## Install

1. Download the `.vsix` from [GitHub Releases](https://github.com/mot1us/specter/releases).
2. In VS Code: **Extensions → … → Install from VSIX…**
3. Open your project and choose **Enable for this project**.

Open **Specter** in the activity bar for controls. Each project remembers
whether replay is on or paused.

Needs desktop VS Code 1.96 or newer. This beta supports local folders on
macOS, Windows, and Linux. No build tools or API key needed to install it.

## Using it

**Typing replay** shows the saved changes as typing. **Changed lines** takes
you straight to the edit. Separate changes replay one block at a time. You can
change the speed, skip a replay, or pause.

- **Separate pane** keeps replay beside the file you're working on.
- **Recent edits** lets you replay something you missed. It keeps up to 20 edits
  or 4 MB in memory for this session. **Clear** removes them. Reloading or
  rescanning the project clears them too. Replaying an old edit never restores it
  to disk.
- Right-click a file or folder and choose **Ignore in Specter** to skip it.
  For patterns such as `**/*.map` or `generated/**`, use **Exclude Globs** in settings.
- If saves arrive too fast, Specter drops older queued changes and shows a
  skipped count. Recent edits may still have them, within the limits above.

The typing happens after a file is saved. Specter uses a read-only preview,
then opens the real file. It doesn't type into your source files or replace
unsaved edits. By default, it pauses while you're editing.

It can't tell who saved a file, so other tools can trigger it too. Specter
doesn't use AI, make network requests, or collect telemetry. Your agent and
VS Code still use their own connections.

## Optional: see which lines your agent is checking

Click **Set up inspections** in the sidebar. It shows the files it will update,
then adds a local helper, a note in `AGENTS.md`, and an ignore rule for activity
reports. Existing project instructions are kept.

The agent has to report those locations; Specter can't see them on its own.
The helper needs Node.js 18 or newer. [Manual setup](docs/inspection-setup.md)
is available too.

## Beta notes

Install updates the same way: download the new VSIX and install it.
If you have the old `local.codex-live-follow` build, remove or disable it first.
Your `codexLiveFollow` settings still work.

Specter was previously called Codex Live Follow. It keeps the same extension
ID and settings, so you can install this version over the previous beta.
Marketplace publishing comes later.

[Try the beta checklist](docs/beta-testing.md) or
[report a bug](https://github.com/mot1us/specter/issues).
Use a throwaway project when sharing logs or recordings.

## Development

Node.js 22 or newer. Run `npm ci`, `npm test`, and `npm run package`.
The extension itself has no third-party dependencies.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the rest.

Free. Open source. MIT licensed. Unofficial; not affiliated with OpenAI.
[Security and privacy](SECURITY.md).
