# Performance checks

Specter does not continuously poll source contents. It reacts to filesystem
events, debounces up to 256 files with one shared timer, and limits source I/O to
eight active reads and 256 waiting requests. Manual pause stops watching and
releases baselines by default. Recent history remains available when resumed.

Text cache budgets are 32 MiB for snapshots, 4 MiB for recent edits, and 8 MiB for
pending playback. These budgets count UTF-8 content, not total process RAM;
JavaScript objects, editor models, highlighting, and transient copies cost more.
Typing can refresh the virtual document at up to 20 frames per second. Files over
128 KiB refresh less often. Startup paths and source contents are read locally,
and there are no runtime dependencies or network calls.

## Real-host profiling

The package CI job installs the exact release VSIX in a disposable VS Code
profile, disables other installed extensions, runs the integration suite, and
records these phases:

- Idle with replay enabled.
- Typing a saved edit in approximately 4 KB of text.
- Typing a saved edit in approximately 500 KB of text.
- A burst of 400 saved files.
- A file save while manually paused.

Download the `specter-performance` artifact from that run. `summary.json`
contains duration, extension-host CPU time, heap and RSS snapshots, virtual
document change counts, observed replay backlog, and sampled Specter self and
inclusive time. Each phase also includes a `.cpuprofile` that can be opened in
VS Code for function-level inspection. These artifacts expire after 14 days.

CPU and RAM counters cover the entire extension-host process, including the
integration harness and profiling overhead. Sampled attribution is approximate,
particularly for brief operations. Renderer/GPU work and language-service child
processes are excluded. Heap differences can reflect garbage collection.
Results depend on the CI hardware, operating system, workspace, and installed
extensions; they are measurements for these scenarios, not universal CPU or RAM
limits. There are no brittle hardware-specific performance pass thresholds.

To reproduce in a disposable host, set `SPECTER_PROFILE_DIR` to an output
directory when running `npm run test:packaged`. On headless Linux:

```sh
SPECTER_PROFILE_DIR=/tmp/specter-profile xvfb-run -a npm run test:packaged
```

This command opens a separate test editor. Use CI when an additional local
VS Code instance would disrupt ongoing work. Do not use production source for a
shared profile; CPU-profile paths and functions may identify the workspace.

## Before a stable release

Use real everyday projects and check idle, repeated saves, large files, pause and
resume, dirty editors, folder deletion, and bursts. Compare with Specter disabled
using VS Code's [performance tools](https://github.com/microsoft/vscode/wiki/Performance-Issues).
Keep the current local-workspace support scope until remote hosts are tested.
