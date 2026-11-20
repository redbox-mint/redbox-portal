'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const { original, copy, loaded } = JSON.parse(process.env.FM043_MUTATION_OVERLAY ?? 'null') ?? {};
const cache = process.env.FM043_MUTATION_TRANSPILED;
const service = process[Symbol.for('ts-node.register.instance')];
const previous = Module._extensions['.ts'];
assert(service && previous && cache, 'The scratch overlay must follow ts-node registration.');
const compile = service.compile;
service.compile = (source, filename, ...options) => {
  const patched = path.resolve(filename) === original;
  const input = patched ? readFileSync(copy, 'utf8') : source;
  const key = createHash('sha256').update(filename).update('\0').update(input).digest('hex');
  const cached = path.join(cache, key);
  if (patched) writeFileSync(loaded, original);
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const output = compile(input, filename, ...options);
  writeFileSync(cached, output);
  return output;
};

if (original) {
  // FM-019 exercises a packed consumer. Use the same scratch module in its
  // installed core while keeping resolution relative to that installation.
  const scope = '/packages/redbox-core/src/';
  const output = '/node_modules/@researchdatabox/redbox-core/dist/' + original.split(scope)[1].replace(/\.ts$/, '.js');
  const javascript = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    if (!filename.includes('/fm019-consumer-') || !filename.endsWith(output)) return javascript(module, filename);
    return module._compile(service.compile('', original), filename);
  };
}
