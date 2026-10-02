# Security and privacy

Codex Live Follow reads text files in the open workspace to compare saved versions and display their changes. Source content and replay text are held in memory. The extension does not call ChatGPT or another model, require an API key, send telemetry, make network requests, or write animation frames to real source files.

For a local workspace it runs on your computer. With a remote workspace, VS Code may run this workspace extension on the remote extension host; the normal VS Code connection carries the editor content. Codex, VS Code, and other extensions have their own data handling, independent of this extension.

The watcher does not identify the author of a write. A user save, generator, formatter, or another agent can trigger it. Diagnostic output may contain file paths and error messages. Treat recordings and shared logs as workspace information.

## Reporting a vulnerability

Once this project has a GitHub repository, use that repository's **Security → Report a vulnerability** option if the owner has enabled private reporting. If it is unavailable, ask the repository owner for a private contact without including sensitive details in a public issue. This local distribution has no designated security email or hosted reporting channel yet.

Include the affected version, a minimal reproduction using non-sensitive files, and the expected versus observed behavior. Never include credentials or private source code in a public report.
