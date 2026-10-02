'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const root = path.resolve(__dirname, '..');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-live-follow-test-'));
  const workspace = path.join(temporary, 'workspace');
  const profile = path.join(temporary, 'profile');
  const extensions = path.join(temporary, 'extensions');

  try {
    await Promise.all([
      fs.mkdir(workspace),
      fs.mkdir(path.join(profile, 'User'), { recursive: true }),
      fs.mkdir(extensions),
    ]);
    await fs.writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'workbench.startupEditor': 'none',
      'files.autoSave': 'off',
    }));
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, 'integration', 'run.js'),
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
      version: process.env.VSCODE_VERSION || 'stable',
      launchArgs: [
        workspace,
        '--disable-extensions',
        `--user-data-dir=${profile}`,
        `--extensions-dir=${extensions}`,
      ],
      // An editor's terminal may set this variable; launch an actual VS Code UI.
      extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
    });
  } finally {
    // Retry briefly for Windows, where the closing host may still hold files.
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
