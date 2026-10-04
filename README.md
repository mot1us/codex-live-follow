# Codex Live Follow

**Follow along.**

See saved edits as they come in. Live Follow brings changed files into view
and plays back the edits while your agent handles the code.

Pick your pace with **Typing replay**, or go straight to **Changed lines**.
Pause whenever you like.

## Get it

1. Download the `.vsix` from [GitHub Releases](https://github.com/mot1us/codex-live-follow/releases).
2. In VS Code: **Extensions → … → Install from VSIX…**
3. Open your project and choose **Enable for this project**.

Use the **Live Follow** icon in the activity bar for controls. Each project
remembers whether following is on or paused.

Needs desktop VS Code 1.96 or newer. This beta supports local folders on
macOS, Windows, and Linux. No build tools or API key needed to install it.

## How it works

Live Follow watches saved files in your project. It shows each edit in a
read-only preview, then opens the real file. By default, it pauses while you edit.

The typing is a replay after a save. It doesn't write to your source files or
replace unsaved edits. Other tools that save files can trigger it too.

The extension runs locally. No AI calls, network requests, or telemetry.
Codex and VS Code handle their own connections.

## Follow a code check

To see the lines your agent checks, add the optional
[inspection setup](docs/inspection-setup.md). Visits use locations reported by
the agent. The helper needs Node.js 18 or newer.

## Beta notes

Install updates the same way: download the new VSIX and install it.
If you have the old `local.codex-live-follow` build, remove or disable it first.
Your `codexLiveFollow` settings still work.

Marketplace publishing comes later. The beta ID is `mot1us.codex-live-follow`;
[release notes](docs/release-notes.md) cover the pending publisher registration.

[Try the beta checklist](docs/beta-testing.md) or
[report a bug](https://github.com/mot1us/codex-live-follow/issues).
Use a throwaway project when sharing logs or recordings.

## Work on it

Node.js 22 or newer. Run `npm ci`, `npm test`, and `npm run package`.
The extension itself has no third-party dependencies.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the rest.

Free. Open source. MIT licensed. Unofficial; not affiliated with OpenAI.
[Security and privacy](SECURITY.md).
