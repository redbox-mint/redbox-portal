// Read-only production dependency proof; mount only this verifier in the image.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
assert.equal(process.version,'v26.12.1');
assert.equal(global.sails,undefined);
const historical = new Set(['@researchdatabox/sails-ng-common','@researchdatabox/sails-hook-redbox-storage-mongo','@researchdatabox/sails-hook-redbox-pdfgen']);
const forbidden = name => {
  const leaf = name.split('/').at(-1);
  return /^@sailshq\//.test(name) || ['sails','sails.io.js','skipper','waterline'].includes(leaf) ||
    /^(?:skipper-|waterline-)/.test(leaf) || (leaf.startsWith('sails-') && !historical.has(name));
};
const seen = new Set(), versions = new Map();
function inspect(directory) {
  const real = fs.realpathSync(directory);
  if(seen.has(real)) return;
  seen.add(real);
  const pkg = JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  assert.equal(forbidden(pkg.name),false,pkg.name);
  versions.set(pkg.name,pkg.version);
  for(const group of ['dependencies','optionalDependencies','peerDependencies'])
    for(const name of Object.keys(pkg[group] || {})) assert.equal(forbidden(name),false,pkg.name+' -> '+name);
  if(pkg.name.startsWith('@researchdatabox/') || pkg.name.startsWith('redbox-hook-') || pkg.name === 'redbox-portal')
    for(const group of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])
      for(const [name,version] of Object.entries(pkg[group] || {})) assert.match(version,/^(?:file:|\.\.?\/|workspace:|\d+\.\d+\.\d+(?:-[\w.-]+)?$)/,pkg.name+' -> '+name);
  const modules = path.join(directory,'node_modules');
  if(fs.existsSync(modules)) walkModules(modules);
}
function walkModules(directory) {
  for(const entry of fs.readdirSync(directory)) {
    if(entry.startsWith('.')) continue;
    const full = path.join(directory,entry);
    if(!fs.statSync(full).isDirectory()) continue;
    if(entry.startsWith('@')) walkModules(full);
    else if(fs.existsSync(path.join(full,'package.json'))) inspect(full);
  }
}
inspect(process.cwd());
assert.equal(versions.has('redbox-hook-wsu'),process.env.SR_EXPECT_WSU === 'true');
assert.equal(versions.has('redbox-hook-dev'),process.env.SR_EXPECT_BUNDLED === 'true');
console.log(JSON.stringify({node:process.version,manifests:seen.size,forbiddenPackages:0,forbiddenEdges:0,ownedPins:true,
  core:versions.get('@researchdatabox/redbox-core'),wsu:versions.get('redbox-hook-wsu'),bundled:versions.get('redbox-hook-dev')}));
