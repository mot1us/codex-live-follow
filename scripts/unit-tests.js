'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'test'))
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => path.join(root, 'test', file));
if (!tests.length) throw new Error('No unit tests found in test/.');

// Explicit paths work in Windows shells and keep host tests opt-in locally.
const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status || (result.signal ? 1 : 0);
