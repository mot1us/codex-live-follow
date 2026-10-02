# Release preparation

The source and installable VSIX can be shared before there is a Marketplace listing. The `local` publisher in `package.json` is a development identity, not a registered public publisher. No GitHub repository, Marketplace publisher, or publication credentials are assumed by this project.

## Before the first public release

- Choose the repository owner and public project name. Keep the description explicit that this is an independent companion and is not an OpenAI product.
- Create the GitHub repository and add its real `repository`, `homepage`, and `bugs` URLs to `package.json`. Confirm that no personal workspace paths, credentials, recordings, or generated packages are being committed.
- Confirm the license and copyright attribution match the intended ownership.
- Enable private vulnerability reporting if the repository will accept reports through GitHub.
- Record a short demo using a disposable project. Show both a typing replay and a manual pause; avoid private source, paths, and account details.
- Complete the [manual checks](../CONTRIBUTING.md#useful-manual-checks) on macOS, Windows, and Linux before claiming support has been verified on each platform. Test remote workspaces separately before making compatibility claims.
- Choose and register the real Marketplace publisher. Replace `publisher: "local"` in `package.json` before publishing. The publisher and extension name form the extension's identity; changing the publisher does not update an installed `local.codex-live-follow` automatically. Remove or disable the local build when testing the public identity so two watchers do not run together.

Use VS Code's [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for current publisher registration, authentication, and Marketplace requirements. Do not commit publication credentials.

## For each release

1. Update the package version and changelog together.
2. Run the automated checks and the manual cases relevant to the change.
3. Run `npm ci`, `npm run check`, `npm test`, `npm run test:integration`, `npm run package:check`, and `npm run package` using Node.js 22 or newer. Use the host-version and headless Linux instructions in [contributing](../CONTRIBUTING.md#host-test-versions) as needed. Inspect the resulting VSIX in `dist/`. It should contain runtime files and user documentation, with no tests, development fixtures, old VSIX files, or credentials.
4. Install that exact package in a clean VS Code profile. Check both initial activation and upgrading from the previous version.
5. Attach the tested VSIX and generated SHA-256 checksum to a GitHub release with its changes and known limitations. Marketplace publication is a separate action through the registered publisher.

The standard Marketplace tooling is `@vscode/vsce`; it supports both packaging and publishing. Packaging a VSIX does not publish it. Keep publication a deliberate owner action until the repository identity and release process are established.

The included CI gates packaging on unit checks and real VS Code host tests, then uploads a build artifact without publishing. Its macOS/Windows/Linux matrix is configured but has not run for this local distribution. Confirm the hosted results before a public release. Repository links in the README are currently plain filenames so the local package does not require a fabricated GitHub URL. Once `repository` is configured, turn useful file references into working links and verify the packaged README with `vsce`.
