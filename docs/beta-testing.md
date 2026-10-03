# Beta testing

The first public release is free, MIT licensed, and intended for Codex users in
desktop VS Code with local folders on macOS, Windows, and Linux. Remote SSH,
WSL, Codespaces, alternative editors, and browser-only VS Code are outside the
first supported release scope.

## What to try

1. Install the downloaded VSIX in a clean VS Code profile with no older Live Follow
   extension enabled. No build tools or API key should be needed.
2. Open a disposable project. Before accepting the first-use invitation, change
   a file externally and confirm Live Follow stays paused.
3. Enable following for this project. Ask Codex to create and edit small HTML,
   CSS, and JavaScript files. Confirm typing replay finishes at the latest real file.
4. Switch to Follow changed lines. Confirm changes open at the changed block.
5. Pause and resume, change speed, skip a replay, switch files, and type while an
   external edit is happening. Confirm your unsaved work is preserved.
6. Reload VS Code and confirm your project choice is remembered. Open a different
   project and confirm it gets its own first-use choice.
7. Optionally follow [inspection setup](inspection-setup.md) and ask Codex to
   investigate a bug. Confirm reports open the stated file and line.
8. Install a newer beta over the same publisher/name identity and repeat a short
   replay. Confirm settings and the project choice survive.

## Send feedback

Use [GitHub Issues](https://github.com/mot1us/codex-live-follow/issues). Include:

- Extension version, VS Code version, and operating system.
- Whether the project is a local folder and which replay mode is selected.
- What you expected, what happened, and a short reproduction using disposable files.

Recordings and diagnostic logs may contain source code and paths. Use a disposable
project when sharing an example.

## Marketplace gate

At least 3–5 independent testers must successfully install and use the beta.
Fix reported installation failures, source editing interference, incomplete replays,
and blocking usability problems before Marketplace publication. Keep the platform
test matrix green. Add guided inspection setup before the Marketplace release.

Automated test success is recorded in GitHub Actions. Independent tester results
have not been collected yet; they must not be reported as complete.
