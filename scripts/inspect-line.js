'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseInspection, ACTIVITY_PATH } = require('../src/inspection');

const [file, line, message, phase = 'inspect'] = process.argv.slice(2);
const event = { id: randomUUID(), path: file, line: Number(line), message, phase };
if (!parseInspection(JSON.stringify(event))) {
  console.error('Usage: node scripts/inspect-line.js <relative-file> <line> "What is being checked" [inspect|suspect]');
  process.exitCode = 1;
} else {
  try {
    const target = path.resolve(process.cwd(), event.path);
    if (!fs.statSync(target).isFile()) throw new Error('The target must be a file.');
    const destination = path.resolve(process.cwd(), ACTIVITY_PATH);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${event.id}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(event), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, destination);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    console.log(`Inspecting ${event.path}:${event.line}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
