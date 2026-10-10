'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { digest, documentFingerprint } = require('../src/editor-save');
const { createVscodeMock } = require('./helpers/vscode');

test('oversized editor models are rejected without assembling their full text', () => {
  const { vscode } = createVscodeMock();
  const document = { lineCount: 1, offsetAt: () => 32 * 1024 * 1024,
    getText: () => assert.fail('oversized getText must not run') };
  assert.equal(documentFingerprint(vscode, document, 16384), undefined);
});

test('editor-save limits count UTF-8 bytes, including Unicode and CRLF', () => {
  const { vscode, uri, documentFor } = createVscodeMock();
  const text = 'hello 🌱\r\n';
  const document = documentFor(uri('unicode.txt'), text);
  assert.equal(documentFingerprint(vscode, document, Buffer.byteLength(text)), digest(text));
  assert.equal(documentFingerprint(vscode, document, Buffer.byteLength(text) - 1), undefined);
});
