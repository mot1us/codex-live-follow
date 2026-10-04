# Security and privacy

Specter reads text files in the open workspace to compare saved versions and display their changes. Source content and replay text are held in memory. Optional inspection setup writes local activity reports in the project; the extension reads these reports and does not execute the helper. Project enable or pause choices are remembered in VS Code settings and workspace state. The extension does not call ChatGPT or another model, require an API key, send telemetry, make network requests, or write animation frames to real source files.

For a local workspace it runs on your computer. With a remote workspace, VS Code may run this workspace extension on the remote extension host; the normal VS Code connection carries the editor content. Codex, VS Code, and other extensions have their own data handling, independent of this extension.

The watcher does not identify the author of a write. A user save, generator, formatter, or another agent can trigger it. Diagnostic output may contain file paths and error messages. Treat recordings and shared logs as workspace information.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option if the owner has enabled private reporting. If it is unavailable, ask the repository owner for a private contact without including sensitive details in a public issue. Private reporting availability depends on the repository owner; the beta has no designated security email.

Include the affected version, a minimal reproduction using non-sensitive files, and the expected versus observed behavior. Never include credentials or private source code in a public report.
