#!/usr/bin/env node

// Wrapper to expose TypeScript compiler from redbox-hook-kit
const { spawn } = require('child_process');
const path = require('path');

const tscPath = require.resolve('typescript/bin/tsc');
const args = process.argv.slice(2);

const tsc = spawn('node', [tscPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd()
});

tsc.on('exit', (code) => {
  process.exit(code);
});
