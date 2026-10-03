'use strict';

const path = require('node:path');
const manifest = require('../package.json');
process.env.LIVE_FOLLOW_VSIX = path.resolve(__dirname, '..', 'dist', `${manifest.name}-${manifest.version}.vsix`);
require('./test-host');
