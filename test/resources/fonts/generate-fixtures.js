'use strict';

// Real fonts are checked in with provenance; never overwrite them with filler.
const fs = require('fs');
const path = require('path');
fs.writeFileSync(
  path.join(__dirname, 'test-font-truncated.woff2'),
  fs.readFileSync(path.join(__dirname, 'test-font-regular.woff2')).subarray(0, 50)
);
