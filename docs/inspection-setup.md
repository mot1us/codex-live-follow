# Optional inspection setup

Saved edit replay works immediately after you enable Live Follow for a project.
These steps add file and line visits during an agent's bug investigation.

## Set up a project

1. Download `inspect-line.js` from the same GitHub Release as your VSIX. It is a
   standalone helper and needs Node.js 18 or newer. No npm installation is needed.
2. Copy it into your project's `scripts/` directory.
3. Add `.codex-live-follow/` to that project's `.gitignore`.
4. Add the instruction below to the project's existing `AGENTS.md`. Preserve its
   other instructions. Create `AGENTS.md` if the project has none.

```markdown
## Live Follow inspection reports

During bug investigation, report meaningful source locations so I can watch the
investigation in VS Code. From this project root, run:

node scripts/inspect-line.js <relative-file> <one-based-line> "What you are checking"

Report only locations you actually inspect. Use a short explanation. Add `suspect`
as the final argument when evidence points to a possible cause. Continue fixing
and verifying the issue normally. Reports are local and do not edit source code.
```

## Try it

With your project open in VS Code and following enabled, run the helper from the
project root using an existing source file:

```sh
node scripts/inspect-line.js src/app.js 12 "Checking how this value is calculated"
```

Live Follow opens the real file, highlights the line, and shows **Inspecting code**.
Ask Codex to investigate an issue afterward. It can use the same instruction without
you sending each location manually. Agents that do not follow the instruction will
still have their saved edits replayed.

## Without the helper

An agent can write `.codex-live-follow/activity.json` directly. Use a fresh `id`, a
workspace-relative path, positive one-based line numbers, and a message up to 500
characters. `endLine` is optional. `phase` is `inspect` or `suspect`.

```json
{"id":"new-report-123","path":"src/app.js","line":12,"message":"Checking the calculation","phase":"inspect"}
```

The extension follows new writes to this file. It does not replay old reports on
startup or infer which files an agent reads. Pause controls and unsaved-file
protection also apply to inspection visits.

Remove the helper, these agent instructions, and `.codex-live-follow/` to remove
the optional setup. The ordinary edit watcher remains available.
