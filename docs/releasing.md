# Releasing

The source and downloadable beta live in
[mot1us/specter](https://github.com/mot1us/specter).
GitHub releases are public prereleases with a VSIX installer, checksums, and the
optional inspection helper. Installing the viewer requires no build tools or API key.

## Identity and Marketplace status

Specter keeps the existing `mot1us.codex-live-follow` extension ID and
`codexLiveFollow` settings so installs update in place. The repository URL and
inspection report path also keep their existing names for compatibility.
The Microsoft Marketplace publisher ID is not registered: Microsoft blocked
account creation. GitHub distribution can proceed while that is resolved through
Microsoft's account support. Do not describe the publisher as verified or reserved.

If Marketplace requires another publisher ID, document migration to that identity.
The old `local.codex-live-follow` prototype and this beta are separate extensions;
remove or disable the old identity before installing the beta to avoid two watchers.
Same-identity beta updates are installed manually from newer VSIX files.

## For each GitHub beta

1. Update `package.json`, `package-lock.json`, the changelog, and
   `docs/release-notes.md` together. Use a new version for each release.
2. Run `npm ci`, `npm run check`, `npm test`, `npm run test:integration`,
   `npm run package:check`, `npm run package`, and `npm run test:packaged`
   with Node.js 22 or newer. For Linux headless runs and specific host versions,
   follow [contributing](../CONTRIBUTING.md#host-test-versions).
3. Complete the manual cases relevant to the change, including updating an
   existing installation. Use disposable files when demonstrating the extension.
4. Inspect the VSIX in `dist/`. It should contain runtime files and user documentation,
   with no development fixtures, credentials, or old packages. Inspect the release
   notes and optional helper assets too.
5. Commit to `main`. GitHub Actions runs unit checks and real VS Code host tests
   on macOS, Windows, and Linux, plus the minimum supported host on Linux.
   Packaging waits for those checks, then installs and tests that exact VSIX
   in a disposable Linux profile and verifies archive and checksum integrity.
6. Once those gates pass, the release job uses its temporary `GITHUB_TOKEN`
   with `contents: write` to publish a public prerelease tagged `v<version>` at
   the tested commit. No publication credential or personal token is committed.
7. Check the [workflow results](https://github.com/mot1us/specter/actions)
   and [release](https://github.com/mot1us/specter/releases). Confirm its
   tag, installer, both checksum files, helper, and setup instructions are present.

The release job only publishes pushes to this repository's `main` branch. Pull
requests, forks, and manual workflow runs test and package without publishing.
An existing draft or public release is preserved on reruns. A conflicting version
tag causes a failure; do not force it to another commit. If a published beta needs
a fix, increment the version and release a new package.

## Before Marketplace publication

- Resolve publisher registration and confirm the identity is controlled by the owner.
- Collect successful everyday-use feedback from 3–5 independent testers and fix
  installation or source editing problems. See [beta testing](beta-testing.md).
- Verify guided inspection setup and keep manual instructions available.
- Record a short demo with disposable source, including replay and pause.
- Keep the independent-companion disclosure, MIT attribution, repository links,
  and accurate local-folder support scope. Test remote environments before extending it.
- Enable private vulnerability reporting if that will be the repository's reporting channel.
- Review the packaged host's `specter-performance` CI artifact and test everyday
  editor use before treating its measurements as representative. See [performance](performance.md).

Microsoft's current publishing guidance recommends Microsoft Entra authentication
for automation. Global Azure DevOps PATs retire December 1, 2026; choose the
authentication flow from the current official guide when setting up the accounts.

Follow VS Code's [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for current publisher registration and authentication. Marketplace publication is
a separate owner action and is not performed by the GitHub beta workflow.
SHA-256 checksums verify download integrity; they are not Marketplace signatures.
