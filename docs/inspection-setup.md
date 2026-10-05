# Optional inspection setup

Saved edits show up once you enable Specter. This setup lets your agent
show the file and line it's checking during a code check.

## From the sidebar

Click **Set up inspections**. Choose a project if you have more than one open.
Specter lists the files before making changes:

- `.specter/inspect-line.cjs` — a standalone local helper.
- `AGENTS.md` — adds the inspection note and keeps existing instructions.
- `.gitignore` — adds `.codex-live-follow/` for temporary activity reports.

Save any unsaved edits in those files first. Setup leaves a conflicting helper
alone, refuses symlink targets, and asks for workspace trust. Running setup
again doesn't add the note twice. Your agent needs to read the updated
`AGENTS.md`; start a new prompt if it already read the old instructions.

To try the guided helper from the project root:

```sh
node .specter/inspect-line.cjs src/app.js 12 "Checking the calculation"
```

## Manual setup

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

With your project open in VS Code and replay enabled, run the helper from the
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

To remove this setup, delete the helper (`.specter/inspect-line.cjs` for guided setup), the added agent note, and
`.codex-live-follow/`. Saved edit replay keeps working.
