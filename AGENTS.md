# Working on Specter

During bug investigation, report meaningful source locations so the user can watch
the investigation in VS Code. From this repository root, run:

```sh
node scripts/inspect-line.js assets/sidebar.css 15 "Checking the status card height"
```

Use the real relative file path and one-based line being inspected, with a short
description of the check. Add `suspect` as the final argument only when evidence
points to a possible cause. Report actual inspections, not invented progress.
Continue fixing and verifying the problem normally. The helper writes local viewer
activity; it does not edit source code or communicate over the network.
