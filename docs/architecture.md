# How it works

```text
Workspace file write
  → debounced filesystem event
  → read UTF-8 text and compare with the cached snapshot
  → queue the newest change
  → animate a read-only virtual document, or reveal changed lines
  → show the real file
```

`src/extension.js` activates and disposes the controller. `src/controller.js` owns VS Code registration, watchers, snapshot storage, the queue, commands, and editor display. `src/sidebar.js` provides a sidebar webview, and `assets/sidebar.js` and `assets/sidebar.css` implement the controls. The controller sends state changes to the visible sidebar; sidebar actions use existing commands and validated settings. `src/diff.js` finds changed line ranges. `src/replay.js` finds the unchanged prefix and suffix so the changed middle can be revealed as typing.

Typing uses VS Code's [virtual document API](https://code.visualstudio.com/api/extension-guides/virtual-documents). The real file is already saved when playback starts. Its contents are never reverted or rewritten to create the effect. A preview can show a partial function that is not valid code yet; the actual file is complete. Deletion-only edits and oversized changes are shown directly.

This is a companion watcher, with no dependency on the Codex extension and no access to Codex's model stream. It cannot attribute a write to a particular tool. Changes in another checkout or worktree are only visible if that folder is open in this VS Code workspace. Unsaved editor changes do not produce a disk replay.

## Cost and bounds

The watcher reacts to filesystem events rather than polling file contents continuously. Events are debounced per file. Each eligible changed file is read and compared as a whole; this is not a byte-level stream of edits.

- Initial snapshots and retained history are bounded at 1,200 files and 32 MiB of UTF-8 text. This is a cache bound, not a total process-memory limit.
- Files above the configured size limit, invalid UTF-8, binary content, and common dependency/build directories are skipped.
- Typing refreshes at up to 20 frames per second. Long changes accelerate to fit the configured replay duration; changes above the character limit open directly.
- Newer writes replace pending versions of the same file and supersede a replay of that file.
- The pending queue is bounded at 12 jobs and 8 MiB of text; it favors recent changes when overloaded.

Refreshing a virtual document sends its current text through VS Code, so large documents can cost more than the visible inserted text suggests. Recursive watchers and the initial snapshot scan also have costs on large repositories. There is no claim of measured CPU or memory usage across every project size.

When a file has no cached baseline, the extension may present its current contents as a new file. Widely separated edits can replay the intervening text as one block because the replay planner keeps only the common outer prefix and suffix. VS Code may briefly show the completed real file before the animated preview opens.

## Letting the user work

Manual pause uses the workspace setting and remains in effect until resumed. By default, editor interaction temporarily suspends playback until the user has been idle for three seconds; an unfocused window waits too. Pending changes can coalesce during an automatic pause. Dirty documents are skipped, and saves reported by this VS Code window are suppressed by default. These are activity and save guards, not proof that a remaining write came from Codex.

The playback mode is selected when a job starts, and typing speed is captured at the start of its animation. Changing either setting affects subsequent jobs without cancelling the current replay. Pause cancels playback; Skip Current Replay finishes its animation and reveals the real file.

Each file's read revision and the workspace generation are checked around asynchronous work, so an older read or a previous workspace cannot enqueue stale content. Cancelling playback closes the extension's owned preview without opening another editor. Watchers are registered before the initial snapshot scan to cover writes during startup.
