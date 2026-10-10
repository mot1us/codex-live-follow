'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runTests, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const { downloadHost } = require('./download-host');

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
      // Exercise Windows-style virtual document line endings on every host.
      'files.eol': '\r\n',
    }));
    let developmentPath = root;
    const executable = process.env.VSCODE_EXECUTABLE_PATH ||
      await downloadHost(process.env.VSCODE_VERSION || 'stable');
    if (process.env.LIVE_FOLLOW_VSIX) {
      const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
      // Run the Windows CLI through Electron directly, avoiding .cmd shell quoting.
      const installExecutable = process.platform === 'win32' ? executable : cli;
      const installPrefix = process.platform === 'win32'
        ? [path.join(path.dirname(executable), 'resources', 'app', 'out', 'cli.js'), ...cliArgs] : cliArgs;
      await new Promise((resolve, reject) => {
        const installing = spawn(installExecutable, [...installPrefix,
          '--install-extension', path.resolve(process.env.LIVE_FOLLOW_VSIX), '--force',
          `--user-data-dir=${profile}`, `--extensions-dir=${extensions}`
        ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit' });
        installing.on('error', reject);
        installing.on('exit', code => code === 0 ? resolve() : reject(new Error(`VSIX installation failed (${code}).`)));
      });
      const manifest = require('../package.json');
      const prefix = `${manifest.publisher}.${manifest.name}-${manifest.version}`.toLowerCase();
      const directory = (await fs.readdir(extensions)).find(name => name.toLowerCase() === prefix);
      if (!directory) throw new Error('The exact VSIX did not install in the disposable profile.');
      developmentPath = path.join(extensions, directory);
      const installed = JSON.parse(await fs.readFile(path.join(developmentPath, 'package.json'), 'utf8'));
      if (installed.publisher !== manifest.publisher || installed.version !== manifest.version || installed.name !== manifest.name) {
        throw new Error('Installed package identity differs from the release manifest.');
      }
      console.log(`Testing installed VSIX ${prefix} in a fresh profile.`);
    }
    await runTests({
      extensionDevelopmentPath: developmentPath,
      extensionTestsPath: path.join(root, 'integration', 'run.js'),
      vscodeExecutablePath: executable,
      version: process.env.VSCODE_VERSION || 'stable',
      launchArgs: [
        workspace,
        '--disable-extensions',
        `--user-data-dir=${profile}`,
        `--extensions-dir=${extensions}`,
      ],
      // An editor's terminal may set this variable; launch an actual VS Code UI.
      extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined, SPECTER_PROFILE_DIR: process.env.SPECTER_PROFILE_DIR },
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
