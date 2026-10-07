# Working on Specter

## Delivering updates

After completing each requested update and its required checks, commit the task's
changes and push to the configured GitHub remote. The user has authorized this
workflow; do not ask again for routine commits and pushes. Keep unrelated changes
out of commits and do not force-push. On `main`, the existing GitHub Actions
workflow publishes the beta for a new version after its checks pass.

## Investigating bugs

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
