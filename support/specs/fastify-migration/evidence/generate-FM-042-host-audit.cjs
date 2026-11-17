'use strict';
// Enrich the startup/Compose inventory with direct test construction and CLI
// discovery. New test construction sites need an explicit reviewed disposition.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const target = path.join(__dirname, 'FM-042-host-paths.json');
const inventory = JSON.parse(fs.readFileSync(target, 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const files = [...new Set([
  ...git(['ls-files', '-z']).split('\0'),
  ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
])].filter(name => name && fs.existsSync(path.join(root, name))).sort();
// Discover retained compositions from their source module exports and TS symbols.
// Child scans run serially and release their checker heaps between snapshots.
function semanticScan(baseline) {
  return JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=4096',
    path.join(__dirname, 'FM-042-host-symbols.cjs'), ...(baseline ? ['--baseline'] : [])],
    {cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 48 * 1024 * 1024}));
}
const beforeSymbols = semanticScan(true);
const afterSymbols = semanticScan(false);
const dispositions = JSON.parse(fs.readFileSync(path.join(__dirname, 'FM-042-host-dispositions.json'), 'utf8'));
const core = path.join(root, 'packages/redbox-core');
const config = require(path.join(core, '.mocharc.js'));
const legacy = require(path.join(core, '.mocharc.legacy-express.cjs'));
const {globSync} = require(path.join(core, 'node_modules/glob'));
const select = settings => new Set(globSync(settings.spec, {cwd:core,ignore:settings.ignore,nodir:true}).map(file=>'packages/redbox-core/'+file));
const defaultCore = select(config), legacyCore = select(legacy);
const previousConfiguration={exports:{}};
new Function('module','require',git(['show','HEAD:packages/redbox-core/.mocharc.js']))(previousConfiguration,require);
const headPaths=new Set(git(['ls-tree','-r','--name-only','HEAD']).split('\n'));
const beforeDefaultCore=[...select(previousConfiguration.exports)].filter(file=>headPaths.has(file)).sort();
for(const file of legacyCore) if(defaultCore.has(file)) throw Error('Legacy test selected by default core: '+file);
const beforeByPath = new Map(beforeSymbols.tests.map(row=>[row.path,row.hits]));
const afterByPath = new Map(afterSymbols.tests.map(row=>[row.path,row.hits]));
const discovery = /\b(?:loadInstalledExtensionProviders(?:V2)?|inspectInstalledExtensionProviders|loadExtensions|runIndexMaintenance|createPortalApplication|createPortalHost|ExpressHost|recordRevisionMaintenance)\b|persistence:indexes|persistence-indexes|maintenance-mongo/;
const hits = (text, pattern) => text.split(/\r?\n/).flatMap((line,index)=>pattern.test(line)?[{line:index+1,text:line}]:[]);
const directTestConstruction = [];
const maintenanceAndCli = [];
const discoveredPaths = [...new Set([...beforeByPath.keys(),...afterByPath.keys()])].sort();
const unknownPaths = discoveredPaths.filter(name=>!dispositions[name]);
if(unknownPaths.length)throw Error('Undispositioned retained symbol paths: '+JSON.stringify(unknownPaths));
for (const name of discoveredPaths) {
  const disposition = dispositions[name];
    if(defaultCore.has(name) && disposition.kind==='legacy-only') throw Error('Default core selects retained-only test: '+name);
  if(defaultCore.has(name) && disposition.kind==='converted-fastify' && (afterByPath.get(name)??[]).some(hit=>hit.kind!=='type-import'))
    throw Error('Converted production test reintroduced a retained Express symbol: '+name);
  directTestConstruction.push({path:name,...disposition,defaultCore:defaultCore.has(name),legacyCore:legacyCore.has(name),
    before:beforeByPath.get(name)??[],after:afterByPath.get(name)??[]});
}
// Follow test/fixture imports too: importing an old fixture cannot conceal a host.
function retainedDependencies(file,seen=new Set()) {
  if(seen.has(file))return [];seen.add(file);
  return [...new Set((afterSymbols.dependencies[file]??[]).flatMap(dependency=>[
    ...(afterByPath.has(dependency)?[dependency]:[]),...retainedDependencies(dependency,seen)]))].sort();
}
const defaultFixtureDependencies=[], unknownImporters=[];
for(const file of [...defaultCore].sort()) {
  const dependencies=retainedDependencies(file);
  if(!dependencies.length)continue;
  const disposition=dispositions[file];
  if(!disposition) {unknownImporters.push({path:file,dependencies});continue;}
  if(disposition.kind==='legacy-only')throw Error('Default imports retained-only qualification: '+file);
  defaultFixtureDependencies.push({path:file,...disposition,dependencies});
}
if(unknownImporters.length)throw Error('Undispositioned default fixture importers: '+JSON.stringify(unknownImporters));
const fixtureDependencies=[], unknownFixtures=[];
for(const file of Object.keys(afterSymbols.dependencies).sort()) {
  const dependencies=retainedDependencies(file);
  if(!dependencies.length)continue;
  const disposition=dispositions[file];
  if(!disposition){unknownFixtures.push({path:file,dependencies});continue;}
  fixtureDependencies.push({path:file,...disposition,defaultCore:defaultCore.has(file),legacyCore:legacyCore.has(file),dependencies});
}
if(unknownFixtures.length)throw Error('Undispositioned retained fixture importers: '+JSON.stringify(unknownFixtures));
for (const name of files) {
  if (!/\.(?:ts|js|cjs|mjs|sh|json)$/.test(name) || name.endsWith('package-lock.json')) continue;
  if (/support\/(?:specs|docs)\//.test(name)) continue;
  const afterText = fs.readFileSync(path.join(root,name),'utf8');
  const beforeText = spawnSync('git',['show','HEAD:'+name],{cwd:root,encoding:'utf8'}).stdout||'';
  const maintenanceRunner = /test\/(?:extensions\/run-packed|maintenance\/packed-mongo)\.cjs$/.test(name);
  const cli = maintenanceRunner || /(?:^|\/)(?:bin|scripts|maintenance)\//.test(name) || name.startsWith('support/') || name.endsWith('package.json') || /^app(?:\.[^.]+)?\.(?:js|cjs)$/.test(name);
  if (cli && (maintenanceRunner || (!name.includes('/test/') && !name.startsWith('test/')))) {
    const before = hits(beforeText, discovery), after = hits(afterText, discovery);
    if (before.length || after.length) {
      const legacy = after.filter(hit => /\b(?:loadInstalledExtensionProviders|loadExtensions|createPortalApplication|createPortalHost|ExpressHost)\b/.test(hit.text));
      let disposition = 'Transport-neutral API2 discovery / standalone index coordinator; no HTTP host.';
      if (name.includes('/fastify-performance/')) disposition = 'Frozen legacy benchmark requires explicit express selector.';
      else if (name === 'app.express.cjs') disposition = 'Explicit legacy executable, never selected by defaults.';
      else if (name.endsWith('packed-package-audit.cjs')) disposition = 'API2 package/public-export negative controls, not a host or maintenance default.';
      else if (name.startsWith('support/tooling/')) disposition = 'Retained static source inventory; matching text does not execute a command.';
      else if (name.endsWith('rehearse-sails-retirement-recovery.sh')) disposition = 'Native candidate and index maintenance via app.js; frozen rollback executable remains revision-specific.';
      else if (name.endsWith('package.json')) disposition = 'Package scripts delegate index preparation to the transport-neutral coordinator; executable/test hosts are recorded separately.';
      else if (legacy.length) throw new Error('Review retained Express CLI/maintenance selection: ' + name);
      maintenanceAndCli.push({ path: name, disposition, before, after });
    }
  }
}
const genericMongoGates = [
  ['test:record-types:mongo', 'test/recordTypes/RecordTypesMongo.test.ts'],
  ['test:lifecycle:mongo', 'test/queues/QueueMongo.test.ts'],
  ['test:compiled-record-types:mongo', 'test/recordTypes/CompiledRecordTypesMongo.test.ts'],
].map(([command, fixture]) => {
  const file = 'packages/redbox-core/' + fixture;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if ((afterByPath.get(file)??[]).some(hit=>hit.symbol==='ExpressHost') || !text.includes("host.constructor.name, 'FastifyHost'"))
    throw new Error('Generic Mongo gate must assert the actual Fastify host: ' + command);
  return { command, fixture: file, host: 'FastifyHost', selector: 'none', sha256: createHash('sha256').update(text).digest('hex') };
});
const additionalPaths = [
  ['packages/redbox-core/src/maintenance/indexes.ts', 'Retained Express extension loader', 'API2 discovery and operational-only data selection; no HTTP host'],
  ['packages/redbox-core/bin/persistence-indexes.cjs', 'Retained Express coordinator indirectly', 'Transport-neutral coordinator; root/core/generated package script unchanged'],
  ['packages/redbox-core/test/extensions/run-packed.cjs', 'Maintenance fixture included API1 hooks', 'Maintenance-only mode installs the API2 institutional probe; default delegates native packed qualification'],
  ...genericMongoGates.map(gate => [gate.fixture, 'ExpressHost', 'FastifyHost, constructor asserted; no selector']),
];
for (const [name, beforeHost, afterHost] of additionalPaths) {
  const row = { path: name, beforeHost, afterHost, reason: 'FM-042 review round 1: removed hidden default selection.', matchedLines: null };
  const index = inventory.paths.findIndex(item => item.path === name);
  if (index < 0) inventory.paths.push(row); else inventory.paths[index] = row;
}
const roundTwoPaths = [
  ['packages/redbox-core/.mocharc.js','Default glob included retained adapter/API1 implementation baselines','Default core excludes the explicit legacy files and .legacy.ts extracts'],
  ['packages/redbox-core/.mocharc.legacy-express.cjs','No standalone core legacy selection','Explicit test:legacy-express:core only'],
  ...['PortalAuthentication','PortalCompanionConfiguration','PortalPageArtifacts'].map(name=>['packages/redbox-core/test/application/'+name+'.test.ts','PortalHttp (retained Express)','Native production Fastify composition; constructor asserted']),
  ['packages/redbox-core/test/configuration/legacyAcceptance.test.ts','PortalHttp (retained Express)','Native executable API2 installation and host; constructor asserted'],
  ['packages/redbox-core/test/helpers/configurationHttp.ts','Express app and retained route mounts','Native production Fastify host; actual authentication/CSRF and constructor assertion'],
];
for(const [name,beforeHost,afterHost] of roundTwoPaths) {
  const row={path:name,beforeHost,afterHost,reason:'FM-042 review round 2: native default production assertions and explicit retained implementation selection.',matchedLines:null};
  const index=inventory.paths.findIndex(item=>item.path===name);
  if(index<0)inventory.paths.push(row);else inventory.paths[index]=row;
}
delete inventory.directConstructionPattern;
inventory.symbolDiscovery = {authority:'TypeScript export/declaration identity and callable factory types; aliases, CommonJS, compiled imports, embedded source and fixture import graph',modules:afterSymbols.modules};
inventory.defaultCoreSelection = {command:'npm test',configuration:'packages/redbox-core/.mocharc.js',beforeFiles:beforeDefaultCore,files:[...defaultCore].sort(),legacyCommand:'npm run test:legacy-express:core',legacyFiles:[...legacyCore].sort()};
inventory.defaultFixtureDependencies = defaultFixtureDependencies;
inventory.fixtureDependencies = fixtureDependencies;
const caseAccounting = path.join(__dirname,'FM-042-case-accounting.json');
if(fs.existsSync(caseAccounting))inventory.caseAccounting=JSON.parse(fs.readFileSync(caseAccounting,'utf8'));
inventory.directTestConstruction = directTestConstruction;
inventory.genericMongoGates = genericMongoGates;
inventory.maintenanceAndCli = maintenanceAndCli;
inventory.generation = 'inventory.py + host-inventory.py; node support/specs/fastify-migration/evidence/generate-FM-042-host-audit.cjs (source-export/symbol discovery + explicit dispositions + actual default/legacy glob selection + fixture dependency graph; --check rejects unreviewed hits, implicit legacy selection and stale output)';
const output = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== output) throw new Error('Host audit is stale; regenerate it.');
} else fs.writeFileSync(target, output);
console.log(JSON.stringify({ retainedModules:afterSymbols.modules.length, defaultCoreFiles:defaultCore.size, legacyCoreFiles:legacyCore.size, defaultFixtureImporters:defaultFixtureDependencies.length, reviewedPaths: inventory.paths.length, directTestConstruction: directTestConstruction.length, maintenanceAndCli: maintenanceAndCli.length, genericMongoGates: genericMongoGates.length }));
