# Changelog

## 0.9.5

- Debounce saved-file bursts with one timer and at most 256 waiting files.
- Stop file watching and release source baselines while manually paused by default;
  resume establishes current baselines without replaying paused changes. Recent
  history survives pause. The new option can retain baseline updates during pause.
- Check editor model size before reading full text and hashing saves; skip paused saves.
- Stream startup paths with exclusions before the file allowance and prune ignored trees.
- Remove descendant snapshots and pending playback when a folder is deleted, including stale bootstrap reads.
- Keep the demo speed slider available in Changed lines mode.
- Remove the unused replay-plan helper and icon source; extract debounce, startup scanning, and save guards.
- Add regression tests and packaged-host CPU profiles with explicit measurement scope.

## 0.9.4

- Extend Test Specter to a 30-second typing demo followed by a 5-second line inspection.
- Keep enough bounded sample text to try the speed slider even at the fastest setting.
- Give the demo its own duration and character limits, with progress showing elapsed demo time.

## 0.9.3

- Keep the latest pending inspection per project and prioritize saved-edit replays.
- Prevent inspection traffic from evicting saved edits from a full queue.
- Release obsolete waiting reads immediately and cap the source-read backlog at 256 requests.
- Count saved reads dropped during backlog overflow in the skipped total.
- Add Test Specter in the sidebar and Command Palette: a read-only sample typing replay and inspection that works while paused or without a project.

## 0.9.2

- Preserve the latest editor choice when a cancelled display request completes late.
- Drop slow inspections superseded by newer reports, while preserving duplicate-notification handling.
- Make Skip stop visiting further blocks in Changed lines mode.
- Share eight source-read workers across startup, save bursts, inspections, and rescans.
- Check replay limits before allocating character arrays and reduce refresh frequency for large files.
- Correct architecture notes about live typing speed, deadlines, separate blocks, and cache limits.

## 0.9.1

- Make the typing slider affect the running replay while dragging.
- Keep the selected speed instead of overriding it to meet a time limit.
- Show the complete saved file at the deadline and explain this in the controls.
- Preview slider changes in memory; save the setting when dragging ends.

## 0.9.0

- Replay separate changed blocks without retyping the code between them.
- Add a reusable separate replay pane and bounded, read-only recent edit replay.
- Show a count when the queue drops older changes during a burst of saves.
- Add file and folder ignore menus and workspace-relative glob exclusions.
- Add guided inspection setup with a bundled standalone helper.
- Update repository links and release guards for the GitHub rename to Specter.

## 0.8.0 — Specter

- Renamed the extension and controls to Specter.
- Rewrote the README and beta description in the author's own voice.
- Removed the tagline and simplified the interface wording.
- Kept the existing extension ID, settings, and inspection setup so beta installs update in place.

## 0.7.3 — Follow along

- Relaxed the wording in the sidebar, settings, and docs.
- Replay only splits changed text into characters, reducing allocation for small edits in large files.
- Sidebar elements are cached and unchanged values are left alone during animation frames.
- Removed an unused status argument, the legacy packaging shortcut, and stale package entries.
- Added checks for emoji changes and small edits in large files.

## 0.7.2 — Keep it simple

- New headline: Watch your agent work.
- Shorter README, beta notes, sidebar labels, and settings descriptions.

## 0.7.1 — Beta inspection reliability

- Read the first inspection report when a native watcher combines its file and directory creation into one notification.
- Include sidebar state in host-test timeout diagnostics.

## 0.7.0 — GitHub beta

- New projects ask once before following saved changes, then remember the choice. Existing project settings are preserved.
- Changed the GitHub beta identity to `mot1us.codex-live-follow`. Marketplace registration is pending; disable or remove the old `local` build when migrating.
- Made the optional inspection helper portable to unrelated projects with no repository dependencies.
- Added downloadable beta assets, installation and update instructions, tester guidance, and issue reporting.
- Added checks for first-use behavior, helper portability, and installing the exact packaged extension in a fresh profile.

## 0.6.0

- Added local inspection reports so agents can reveal source lines and describe what they are checking during bug investigations.
- Inspection visits share the bounded edit queue and respect pause controls, workspace changes, and unsaved files.
- Reserved space for dynamic sidebar status rows so filenames and progress no longer move the controls below them.
- Added a local reporting helper and agent instructions for working on this extension.

## 0.5.2

- Fixed replay cancelling itself when the sidebar has focus or VS Code delivers a delayed editor-change event.
- Added a regression check and exercised real host playback with editing protection enabled and the controls focused.
- Diagnostic output now records when editor interaction pauses a replay.

## 0.5.1

- Register sidebar message listeners before loading its HTML, and expose read-only state for host checks.
- Host tests now wait for the sidebar's script to connect before passing the UI check.

## 0.5.0

- Added a dedicated Live Follow activity bar icon and sidebar with pause/resume, mode, typing speed, and editing preferences.
- Added live playback status, current file, pending changes, and typing progress, plus buttons for skipping, Settings, and diagnostics.
- The status bar button and Open Controls command now open the sidebar. Settings remain synchronized with Command Palette commands and VS Code Settings.
- Sidebar content follows the VS Code theme and releases its resources when closed.

## 0.4.0

- Added controls for pause/resume, replay speed, mode, skipping the current replay, and diagnostic output.
- Following yields during editor interaction and while VS Code is unfocused. Dirty files and saves from this editor are skipped by default.
- Added custom directory exclusions and made the enabled setting the source of truth for manual pause.
- Bounded the pending queue by both job count and text size, and tightened cancellation and stale-read handling during saves and workspace changes.
- Added standard VSIX packaging with a checksum, package-content checks, real VS Code host tests, cross-platform CI configuration, and development/release documentation.

## 0.3.1

- Increased the default typing replay limit from 4,000 to 20,000 characters so typical new HTML, CSS, and JavaScript files animate.

## 0.3.0

- Reduced typing updates to at most 20 frames per second and limited the target replay duration to 12 seconds by default.
- Coalesced queued writes to the same file and stopped a superseded replay when a newer version arrived.
- Tracked the replay cursor incrementally to avoid rescanning the whole inserted text on each frame.

## 0.2.0

- Added typing replay in a temporary read-only document before revealing the real file.
- Added replay speed and size controls.

## 0.1.0

- Initial local prototype: watch saved workspace text files, open changed files, and highlight changed lines.
- Added a status bar toggle, bounded snapshots, and filters for common generated and binary files.
