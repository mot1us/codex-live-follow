# How it works

```text
Workspace file write
  → debounced filesystem event
  → read UTF-8 text and compare with the cached snapshot
  → queue the newest change
  → animate a read-only virtual document, or reveal changed lines
  → show the real file
```

`src/extension.js` activates and disposes the controller. `src/controller.js` owns VS Code registration, watchers, snapshot storage, the queue, commands, and editor display. `src/debounce.js` coalesces file events with one timer and bounded pending storage; `src/source-scan.js` streams initial source paths; `src/editor-save.js` checks model size before hashing an editor save. `src/read-pool.js` limits concurrent source reads. `src/sidebar.js` provides a sidebar webview, and `assets/sidebar.js` and `assets/sidebar.css` implement the controls. The controller sends state changes to the visible sidebar; sidebar actions use existing commands and validated settings. `src/diff.js` finds separate changed line ranges. `src/replay.js` trims unchanged prefixes and suffixes within each range so only changed characters are typed.

Typing uses VS Code's [virtual document API](https://code.visualstudio.com/api/extension-guides/virtual-documents). The real file is already saved when playback starts. Its contents are never reverted or rewritten to create the effect. A preview can show a partial function that is not valid code yet; the actual file is complete. Deletion-only edits and oversized changes are shown directly.

This is a companion watcher, with no dependency on the Codex extension and no access to Codex's model stream. It cannot attribute a write to a particular tool. Changes in another checkout or worktree are only visible if that folder is open in this VS Code workspace. Unsaved editor changes do not produce a disk replay.

## Cost and bounds

The watcher reacts to filesystem events rather than polling file contents continuously. Events are debounced per file using one shared timer. Each eligible changed file is read and compared as a whole; this is not a byte-level stream of edits.

- Snapshots are bounded at 1,200 files and 32 MiB of UTF-8 text. Recent edits separately keep up to 20 entries or 4 MiB. These are cache bounds, not a total process-memory limit.
- Before source reads, debounce storage keeps at most 256 files. A newer save replaces that file's older waiting revision. Overflow drops the oldest waiting file and releases its revision tracking; drops contribute to the skipped count. One batch notification updates the controls instead of posting one status update for each dropped event.
- Startup streams eligible paths through workspace filesystem APIs. Per-project exclusions apply before the 1,200-file allowance; excluded directory trees are pruned before listing their contents. Traversal stops after 10,000 directory listings and does not follow directory symlinks. Each active bootstrap read has revision tracking, so a deleted parent folder cannot resurrect its children from an older read.
- Startup, watcher events, and inspection targets share eight source-read workers and at most 256 waiting requests. New requests immediately release obsolete waiting revisions; a newer waiting save replaces the same file's older request. Overflow releases the oldest waiting request without I/O. Dropped save reads contribute to the skipped count, but cannot enter recent history because their text was never read. Rescans discard waiting reads and retain the limit on reads already in flight.
- Files above the configured size limit, invalid UTF-8, binary content, and common dependency/build directories are skipped.
- Typing refreshes at up to 20 frames per second for files up to 128 KiB. Larger files use longer frame intervals, up to 250 ms. Character allowance still follows elapsed time at the selected speed. At the replay deadline, the complete saved contents appear without accelerating typing.
- Replay character limits and coarse-diff fallback are checked before allocating character arrays. The character limit applies across all changed blocks and counts Unicode code points.
- Newer writes replace pending versions of the same file and supersede a replay of that file.
- The pending queue is bounded at 12 jobs and 8 MiB of text. Saved edits play before inspections. Each project keeps only its latest pending inspection. Inspections are discarded before saved edits when overloaded; dropping a saved edit contributes to the skipped count and marks its history entry.

Refreshing a virtual document sends its current text through VS Code, so large documents can cost more than the visible inserted text suggests. Recursive watchers and the initial snapshot scan also have costs on large repositories. There is no claim of measured CPU or memory usage across every project size.

When a file has no cached baseline, the extension may present its current contents as a new file. Separate changed blocks keep the intervening text visible. Diffs that exceed the bounded line-comparison table use a coarse range and show changed lines directly.

## Letting the user work

Manual pause uses the workspace setting and remains in effect until resumed. By default, `suspendWhenPaused` stops watchers, cancels pending source reads, and releases baselines; resume scans current files without replaying changes made while paused. Explicit recent history survives this pause/resume cycle. Turning the option off retains baseline updates during manual pause. Paused editor saves never assemble or hash the model. Enabled editor saves check model length before requesting full text, then check UTF-8 bytes before hashing.

By default, editor interaction temporarily suspends playback until the user has been idle for three seconds; an unfocused window waits too. Pending changes can coalesce during an automatic pause. Dirty documents are skipped, and saves reported by this VS Code window are suppressed by default. These are activity and save guards, not proof that a remaining write came from Codex.

The playback mode is selected when a job starts. Typing speed updates during the current animation, including an in-memory slider preview; releasing the slider saves the setting. Pause cancels playback. Skip Current Replay finishes an animation and reveals the real file, or stops visiting further blocks in Changed lines mode.

Each file's read revision and the workspace generation are checked around asynchronous work, so an older read or a previous workspace cannot enqueue stale content. Inspections recheck their accepted report ID after reading the target, so a slow older report cannot enqueue after a newer report. Duplicate notifications for the same report remain harmless.

A parent deletion removes descendant baselines, waiting reads, save-suppression markers, and queued playback, and cancels any active child replay. Existing read-only recent-history snapshots remain until their normal eviction or explicit clearing.

Cancelling playback closes the extension's owned typing preview. An editor display request already in flight cannot be cancelled through the VS Code API; if its late completion displaces the user's selected text editor, Specter restores the latest selected editor. Navigation during that restoration takes precedence too. Watchers are registered before the initial snapshot scan to cover writes during startup.

## Built-in sample

Test Specter schedules one explicit demo ahead of pending jobs, after the current job finishes. It uses the normal virtual-document typing and highlighting paths with a bounded sample in `src/demo.js`. Typing runs for 30 seconds at the selected speed, then the sample inspection stays visible for 5 seconds. The sample has enough characters for the fastest speed and uses its own 20,000-character limit and duration, independently of normal replay limits. Demo progress shows elapsed time; normal replay progress still follows characters typed.

The demo can run while replay is disabled or no workspace is open; it still respects background waiting, interaction cancellation, Skip, Pause, reset, and disposal. It does not change the enabled setting, write files, or enter snapshots or recent history. Duplicate requests share the one pending or active demo. All sample tabs are closed afterward.
