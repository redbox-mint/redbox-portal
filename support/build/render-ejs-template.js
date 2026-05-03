#!/usr/bin/env node

const { createRequire } = require('module');
const path = require('path');

const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));
const ejs = requireFromCwd('ejs');

const [, , templatePath, dataJson = '{}'] = process.argv;

if (!templatePath) {
  console.error('Usage: render-ejs-template <template-path> [json-data]');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(dataJson);
} catch (error) {
  console.error(`Invalid JSON data: ${error.message}`);
  process.exit(1);
}

ejs.renderFile(templatePath, data, {}, (error, output) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  process.stdout.write(output);
});
