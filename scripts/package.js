'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createVSIX } = require('@vscode/vsce');
const { checkPackage } = require('./check-package');

async function main() {
  const { root, manifest } = await checkPackage();
  const output = path.join(root, 'dist');
  const filename = `${manifest.name}-${manifest.version}.vsix`;
  const packagePath = path.join(output, filename);
  await fs.mkdir(output, { recursive: true });
  await createVSIX({
    cwd: root,
    packagePath,
    dependencies: false,
    useYarn: false,
    // The local VSIX can be shared before the owner chooses a public repository.
    allowMissingRepository: !manifest.repository,
  });
  const digest = createHash('sha256').update(await fs.readFile(packagePath)).digest('hex');
  await fs.writeFile(`${packagePath}.sha256`, `${digest}  ${filename}\n`);
  console.log(`VSIX and SHA-256 checksum saved to ${output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
