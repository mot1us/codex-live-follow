# Little Things

A small task board for watching Specter replay real file changes. Vanilla HTML,
CSS, and JavaScript, with a local Node server and no dependencies to install.
The extension's source and configuration are separate from this app.

## Run it

From the repository root:

```sh
npm --prefix playground start
```

Open http://127.0.0.1:4173. Refresh after source changes. Use `PORT=4174` before
the command if the default port is busy. Node.js 18 or newer is required.

Add, complete, delete, filter, or search tasks. Tasks and your chosen theme save
in this browser. **Reset the sample board** reloads the tasks from `data.js`.

## Watch live typing

Keep this repository open in VS Code and enable Specter before asking your
agent for changes. Existing files make it easy to watch insertion, replacement,
and deletion replays. These are good prompts to try:

- “Change the playground's orange accent to blue.”
- “Replace two sample tasks, one near the top and one near the bottom.”
- “Add a button to clear all completed tasks.”
- “Add a priority selector and show a priority badge on each task.”

While edits arrive, try **Typing replay**, **Changed lines**, typing speed,
pause/resume, **Skip**, **Separate pane**, and **Recent edits**. Click or type in
VS Code during replay to try pause on interaction. The app's browser controls
change local browser data; source-file replay is triggered by saved code edits.

For inspections, ask the agent to investigate an actual issue in this app.
The repository's `AGENTS.md` and `scripts/inspect-line.js` are already set up.
Right-click `playground/data.js` and choose **Ignore in Specter** to test
exclusions, then remove the exclusion in settings when you're done.

## Files

- `index.html` — layout and the built-in test guide.
- `styles.css` — responsive layout, colors, and light/dark themes.
- `app.js` — task interactions, local saving, and progress.
- `data.js` — the starter tasks.
- `server.cjs` — serves only the app's public files on localhost.

```sh
npm --prefix playground run check
```
