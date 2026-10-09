'use strict';

// Enough bounded sample text to keep typing for 30 seconds even at 400 chars/s.
const before = '// Specter test\nconst message = "Hello";\n\nconsole.log(message);\n';
const after = [
  '// Specter test',
  'const message = "Specter is working";',
  'const items = [',
  ...Array.from({ length: 200 }, (_, index) =>
    `  { id: ${index + 1}, label: "Sample item ${String(index + 1).padStart(3, '0')}: try the speed slider or Skip", ready: true },`),
  '];',
  '',
  'const readyItems = items.filter(item => item.ready);',
  'for (const item of readyItems) {',
  '  console.log(item.label);',
  '}',
  '',
  'console.log(message);',
  ''
].join('\n');

module.exports = { before, after, durationMs: 30000, inspectionMs: 5000, maxCharacters: 20000 };
