'use strict';

const { createHash } = require('node:crypto');
const digest = text => createHash('sha256').update(text).digest('hex');

function documentFingerprint(api, document, limit) {
  // Read the model's length before asking VS Code to assemble its entire text.
  const length = document.offsetAt(new api.Position(document.lineCount - 1, Number.MAX_SAFE_INTEGER));
  if (length > limit) return undefined;
  const text = document.getText();
  return Buffer.byteLength(text) <= limit ? digest(text) : undefined;
}

module.exports = { digest, documentFingerprint };
