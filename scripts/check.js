'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let checked = 0;

function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(file);
    } else if (entry.isFile() && file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
      checked++;
    }
  }
}

for (const directory of ['src', 'assets', 'scripts', 'test', 'integration']) {
  checkDirectory(path.join(root, directory));
}
for (const file of ['package.json', '.vscode/launch.json', '.vscode/tasks.json']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
console.log(`Syntax checked ${checked} JavaScript files and editor configuration.`);
