## Codex Live Follow beta

**Watch your agent work.**

See saved edits play back as typing, or jump straight to changed lines.
Pause whenever you want.

### This update

- Shorter wording in the README, sidebar, and settings.
- The same replay and inspection controls.

### Install

1. Download the `.vsix` below.
2. In VS Code: Extensions → … → Install from VSIX…
3. Open a local project and choose Enable for this project.

Use the Live Follow activity bar icon for controls. Needs desktop VS Code 1.96
or newer. This beta supports local folders on macOS, Windows, and Linux.
Remote workspaces and other editors haven't been checked for this beta.

### A few details

Typing plays back after a save. The extension doesn't write to your source files
or replace unsaved edits. Other tools that save files can trigger it too.

The extension runs locally. No AI calls, network requests, telemetry, or API key.
Codex and VS Code handle their own connections.

To follow a bug hunt, download `inspect-line.js` and `inspection-setup.md` below.
The helper needs Node.js 18 or newer. Visits use locations reported by the agent.
Saved edit replay works without that setup.

### Updates

Install newer beta VSIX files manually. Remove or disable the old
`local.codex-live-follow` build first. Your `codexLiveFollow` settings still work.

The beta ID is `mot1us.codex-live-follow`. Marketplace publisher registration is
pending. If that ID changes, you'll need to install the new identity.
The SHA-256 files check download integrity; they're not Marketplace signatures.

[Report a bug](https://github.com/mot1us/codex-live-follow/issues) or
[try the beta checklist](https://github.com/mot1us/codex-live-follow/blob/main/docs/beta-testing.md).

Free. Open source. MIT licensed. Unofficial; not affiliated with OpenAI.
