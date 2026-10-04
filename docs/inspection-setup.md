# Optional inspection setup

Saved edits show up once you enable Specter. This setup lets your agent
show the file and line it's checking during a code check.

## Set up a project

1. Download `inspect-line.js` from the same GitHub Release as your VSIX.
   It needs Node.js 18 or newer. No npm install.
2. Copy it into your project's `scripts/` directory.
3. Add `.codex-live-follow/` to that project's `.gitignore`.
4. Add the note below to your project's `AGENTS.md`. Keep its other instructions.
   Create the file if you don't have one.

```markdown
## Specter inspection reports

When checking a bug, show the lines you actually inspect. From the project root:

node scripts/inspect-line.js <relative-file> <one-based-line> "What you are checking"

Keep the explanation short. Add `suspect` at the end when the code looks like a
possible cause. Keep fixing and checking the issue. Reports stay local and don't
edit source files.
```

## Try it

With your project open in VS Code and following enabled, run the helper from the
project root using an existing source file:

```sh
node scripts/inspect-line.js src/app.js 12 "Checking how this value is calculated"
```

Specter opens the real file, highlights the line, and shows **Taking a look**.
Then ask Codex to check a bug. It can report the locations as it works.
Saved edits still show up if the agent skips these reports.

## Without the helper

An agent can write `.codex-live-follow/activity.json` directly. Use a fresh `id`, a
workspace-relative path, positive one-based line numbers, and a message up to 500
characters. `endLine` is optional. `phase` is `inspect` or `suspect`.

```json
{"id":"new-report-123","path":"src/app.js","line":12,"message":"Checking the calculation","phase":"inspect"}
```

Specter shows new reports. It skips old reports at startup. Visits use the
locations the agent reports. Pause and unsaved edit protection still apply.

To remove this setup, delete the helper, the added agent note, and
`.codex-live-follow/`. Saved edit replay keeps working.
