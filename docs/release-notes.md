## Specter beta

Specter runs locally. No AI, no network connection. It simply watches your
project's files for saves and replays the changes as if they're being typed.

This is a fun exercise to see what your agent is up to in the background
when you ask it to update your project. I built it for Codex, but it should
work with other agents too, since it's just watching for file changes.

This is beta for now! Let me know if you find any issues.

### This update

- Pause stops file watching and releases source baselines by default. Resume
  reads the current files without replaying edits made while paused. Recent edits
  remain available. Turn off **Stop watching files when paused** to retain the old behavior.
- File bursts use one timer with bounded storage before entering the read queue.
- Oversized editor saves no longer read or hash the full model. Startup exclusions
  apply before the file limit, and folder deletions clear queued child edits.
- The 30-second demo's speed slider also works in Changed lines mode.
- Removed the unused replay helper and icon asset. Added regression coverage and
  CPU profiles from the packaged extension's disposable CI host.

### Install

1. Download the `.vsix` below.
2. In VS Code: Extensions → … → Install from VSIX…
3. Open a local project and choose Enable for this project.

Open Specter in the activity bar for controls. Needs desktop VS Code 1.96
or newer. This beta supports local folders on macOS, Windows, and Linux.
Remote workspaces and other editors haven't been checked for this beta.

### A few details

Typing plays back after a save. The extension doesn't write to your source files
or replace unsaved edits. Other tools that save files can trigger it too.

The extension runs locally. No AI calls, network requests, telemetry, or API key.
Codex and VS Code handle their own connections.

To see which lines your agent is checking, click **Set up inspections** in the
sidebar, or download `inspect-line.js` and `inspection-setup.md` below. The agent has to report those locations; Specter
can't see them on its own. The helper needs Node.js 18 or newer.
Saved edit replay works without this setup. Recent edits hold up to 20 edits or
4 MB in memory; clearing, reloading, or rescanning removes them.

### Updates

Install newer beta VSIX files manually. Remove or disable the old
`local.codex-live-follow` build first. Your `codexLiveFollow` settings still work.

Specter keeps the `mot1us.codex-live-follow` ID so this installs over the existing
beta. Marketplace publisher registration is pending.
The SHA-256 files check download integrity; they're not Marketplace signatures.

[Report a bug](https://github.com/mot1us/specter/issues) or
[try the beta checklist](https://github.com/mot1us/specter/blob/main/docs/beta-testing.md).

Free. Open source. MIT licensed. Unofficial; not affiliated with OpenAI.
