'use strict';

const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const TRANSIENT = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN']);

async function downloadHost(version, options = {}) {
  const download = options.download || downloadAndUnzipVSCode;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = options.log || console.warn;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await download({ version, timeout: 30000 });
    } catch (error) {
      if (attempt === 3 || !TRANSIENT.has(error.code)) throw error;
      log(`VS Code download failed (${error.code}); retrying (${attempt + 1}/3).`);
      await wait(attempt * 1000);
    }
  }
}

module.exports = { downloadHost };
