# Changelog

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
