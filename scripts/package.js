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
  });
  const digest = createHash('sha256').update(await fs.readFile(packagePath)).digest('hex');
  await fs.writeFile(`${packagePath}.sha256`, `${digest}  ${filename}\n`);
  const helper = 'inspect-line.js';
  await fs.copyFile(path.join(root, 'scripts', helper), path.join(output, helper));
  const helperDigest = createHash('sha256').update(await fs.readFile(path.join(output, helper))).digest('hex');
  await fs.writeFile(path.join(output, `${helper}.sha256`), `${helperDigest}  ${helper}\n`);
  await fs.copyFile(path.join(root, 'docs', 'inspection-setup.md'), path.join(output, 'inspection-setup.md'));
  console.log(`VSIX and SHA-256 checksum saved to ${output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
