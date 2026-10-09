# Give it a run

Use desktop VS Code with a local folder on macOS, Windows, or Linux.
Remote workspaces, other editors, and browser-only VS Code haven't been checked
for this beta.

## Try this

1. Install the VSIX in a clean VS Code profile. Disable any older Specter build.
2. Open a throwaway project. Before enabling replay, save a file from outside
   VS Code. Specter should stay paused.
3. Enable replay. Have Codex create and edit a few files. Watch the typing replay
   finish at the latest real file.
4. Pick **Changed lines**. Edits should open at the changed block.
5. Try pause, resume, speed, and skip. Type and switch files while an edit arrives.
   Your unsaved work should stay put.
6. Reload VS Code. Your project choice should stick. A new project should ask once.
7. Try the optional [inspection setup](inspection-setup.md). Have Codex check a bug.
   Reports should open the file and line it names.
8. Install a newer beta over the same extension ID. Check that your settings stick.

## Found something broken?

[Open an issue](https://github.com/mot1us/specter/issues). Include:

- Extension version, VS Code version, and operating system.
- Selected view and whether your folder is local.
- What happened, what you expected, and how to repeat it.

Use throwaway code in examples. Logs and recordings can show your source and paths.

## Before Marketplace

Get 3–5 independent testers through installation and everyday use. Fix installation
failures, problems with source editing, incomplete replays, and blocking UI issues.
Keep the platform checks green and add guided inspection setup.

[GitHub Actions](https://github.com/mot1us/specter/actions) records the
automated checks. Independent tester feedback still needs to be collected.

## New controls to try

- Click Test Specter while paused, then without a project open. Expect a sample
  typing replay followed by a line-2 inspection, with no file or setting changes.
- Stop the sample using Skip current or Pause Replay; its preview tabs should close.
- Background VS Code while saved edits and inspections arrive. Only the latest
  inspection per project should wait, and saved edits should play first.
- Choose Separate pane and keep another file open beside the replay.
- Save two distant edits in one file; the middle should stay visible.
- Click an older recent edit; the actual file should keep its newest content.
- Save many different files at once; check the skipped count and recent list.
- Right-click a file or folder, choose Ignore in Specter, and save it again.
- In a throwaway project, run Set up inspections twice. Check that existing
  AGENTS.md instructions and .gitignore rules are preserved and not duplicated.
