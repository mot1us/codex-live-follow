## Codex Live Follow beta

Free, open-source, independent companion for watching saved Codex edits in desktop
VS Code. It replays saved file changes and optionally displays inspection reports.

### Changes

- The first inspection report is also read when a watcher reports only its new containing folder.
- New projects stay paused until following is enabled; the project choice is remembered.
- Existing project pause and enable settings are preserved.
- A standalone inspection helper works in other projects without npm dependencies.
- Sidebar status rows retain their space during replay and inspection visits.

### Install

1. Download the `.vsix` asset below.
2. In VS Code, open Extensions → … → Install from VSIX… and select it.
3. Reload if prompted, open a local project, and enable following for that project.
4. Open Live Follow from the left activity bar to select typing or changed-line mode.

Requires desktop VS Code 1.96 or newer. The extension requires no API key, build
tools, or separate AI subscription; Codex has its own requirements.
The viewer runs locally without AI calls, network requests, or telemetry.

### Optional inspection visits

Download `inspect-line.js` and `inspection-setup.md` below. The helper needs Node.js
18 or newer. Edit replay does not require this setup. Reports describe locations
the agent explicitly provides; they do not automatically detect reads or find bugs.

### Scope and feedback

The first supported scope is local folders on macOS, Windows, and Linux. Remote
workspaces and alternative editors are not included in this beta's support claim.
The watcher can also display writes made by formatters, generators, or other agents.

Report problems through [GitHub Issues](https://github.com/mot1us/codex-live-follow/issues).
Follow the [beta testing guide](https://github.com/mot1us/codex-live-follow/blob/main/docs/beta-testing.md).
Independent tester feedback is required before Marketplace publication.

### Updates and prototype migration

Install newer beta VSIX files manually. If you still have the development extension
with publisher `local`, remove or disable it before installing the public publisher
build; the publisher change creates a different extension identity. VS Code settings
use the same `codexLiveFollow` names. Enable Auto Update after installing from the
eventual Marketplace listing.

The SHA-256 files check download integrity. They are not Marketplace signatures.

### Marketplace status

This beta uses `mot1us.codex-live-follow`, matching the repository owner's GitHub
identity. The Microsoft Marketplace publisher ID has not been registered yet.
The package is distributed through GitHub. If the eventual Marketplace publisher
ID changes, migration will require removing this beta and installing the new identity.
