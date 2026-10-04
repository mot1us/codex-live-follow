## Specter beta

Specter runs locally. No AI, no network connection. It simply watches your
project's files for saves and replays the changes as if they're being typed.

This is a fun exercise to see what your agent is up to in the background
when you ask it to update your project. I built it for Codex, but it should
work with other agents too, since it's just watching for file changes.

This is beta for now! Let me know if you find any issues.

### This update

- Renamed Codex Live Follow to Specter.
- Rewrote the description and removed the tagline.
- Same extension ID and settings, so this updates your existing beta install.

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

To see which lines your agent is checking, download `inspect-line.js` and
`inspection-setup.md` below. The agent has to report those locations; Specter
can't see them on its own. The helper needs Node.js 18 or newer.
Saved edit replay works without this setup.

### Updates

Install newer beta VSIX files manually. Remove or disable the old
`local.codex-live-follow` build first. Your `codexLiveFollow` settings still work.

Specter keeps the `mot1us.codex-live-follow` ID so this installs over the existing
beta. Marketplace publisher registration is pending.
The SHA-256 files check download integrity; they're not Marketplace signatures.

[Report a bug](https://github.com/mot1us/codex-live-follow/issues) or
[try the beta checklist](https://github.com/mot1us/codex-live-follow/blob/main/docs/beta-testing.md).

Free. Open source. MIT licensed. Unofficial; not affiliated with OpenAI.
