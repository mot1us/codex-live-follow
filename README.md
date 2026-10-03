# Codex Live Follow

**Free, open-source, independent companion for Codex in desktop VS Code.**
Not affiliated with or endorsed by OpenAI.

Watch saved code edits unfold as fast typing, or jump straight to changed lines.
The viewer runs locally without AI calls, network requests, telemetry, or an API key.
Codex, VS Code, and other extensions have their own requirements and data handling.

## Install the beta

1. Open [GitHub Releases](https://github.com/mot1us/codex-live-follow/releases) and
   download the latest beta's `codex-live-follow-<version>.vsix` asset.
2. In VS Code, open **Extensions → … → Install from VSIX…** and select that file.
3. Reload VS Code if prompted, then open the local folder where Codex is working.
4. Choose **Enable for this project** when invited. Dismissing the invitation keeps
   following paused. Open the **Live Follow** activity bar icon to enable it later.

Ordinary installation needs no npm, build tools, or API key. Desktop VS Code 1.96
or newer is required. The first supported scope is **local folders on macOS,
Windows, and Linux**. Remote workspaces and alternative editors are outside this
beta's support claim. Marketplace publication is pending.

### Upgrading the local prototype

This beta's extension ID is `mot1us.codex-live-follow`. Remove or disable the older
`local.codex-live-follow` extension before installing it so only one watcher runs.
Existing `codexLiveFollow` VS Code settings are still used. Explicit project enable
or pause settings are preserved; new projects ask once before following.

The `mot1us` identity matches the repository owner's GitHub name. Microsoft
Marketplace publisher registration is pending. If a different publisher ID is
needed later, migration will require installing that new identity.

### Beta updates

Download and install newer VSIX files manually. The publisher/name pair must stay
consistent for an in-place upgrade. VSIX installations have automatic updates off
by default; enable Auto Update after moving to the eventual Marketplace listing.

## What you will see

- A saved external edit opens in a temporary read-only editor and replays as typing.
- The latest real file opens afterward with changed lines highlighted.
- **Follow changed lines** mode skips the animation and jumps to the changed block.
- The sidebar shows the current file, progress, pending changes, and pause controls.
- Typing or navigating in the editor can pause following. Unsaved source is protected.
- Optional inspection reports reveal the file and line an agent is checking.

The typing effect is a replay of a completed saved change. It preserves real source
files. The watcher follows external writes and cannot identify whether Codex, a
formatter, a generator, or another tool made a particular edit.

## Optional: watch a bug investigation

Edit replay needs no project setup. Inspection visits need instructions asking the
agent to report meaningful file and line locations. Download the standalone helper
and follow [inspection setup](docs/inspection-setup.md). The helper needs Node.js
18 or newer; no npm installation is needed.

Live Follow displays **Inspecting code**, the location, and a short explanation.
It displays the agent's explicit reports; it does not infer file reads or find bugs.
Pause controls and unsaved-file protection also apply to inspections.

## Feedback

Try the [beta testing guide](docs/beta-testing.md) and report problems through
[GitHub Issues](https://github.com/mot1us/codex-live-follow/issues). Use disposable
examples when sharing logs or recordings. Independent tester feedback is required
before the Marketplace release.

## Development

The runtime has no third-party dependencies. For source development, install Node.js
22 or newer and run `npm ci`, `npm test`, and `npm run package`.
`npm run test:packaged` installs and exercises the generated VSIX in a fresh profile.
See [CONTRIBUTING.md](CONTRIBUTING.md) and [release preparation](docs/releasing.md).

MIT licensed. [Security and privacy](SECURITY.md).
