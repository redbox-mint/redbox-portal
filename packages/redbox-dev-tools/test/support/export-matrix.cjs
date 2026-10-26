const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
// Native resolution canonicalizes file paths after selecting the export. The
// static selector has no filesystem dependency; compare the resulting pathname
// after the same URL/path roundtrip (fixtures contain no symlinks).
function canonicalFileURL(value) {
  if (value === undefined) return undefined;
  const url = new URL(value),
    normalized = pathToFileURL(path.resolve(fileURLToPath(url)));
  normalized.search = url.search;
  normalized.hash = url.hash;
  return normalized.href;
}
module.exports = function runExportMatrix(
  hasRuntimeExtensionExport,
  resolveExtensionExport,
  hostModule = require.resolve('@researchdatabox/redbox-core/dist/extensions/loading')
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r20-exports-'));
  const cases = [],
    add = (exports, entry = '.', group = 'targets') => cases.push({ exports, entry, group });
  const targets = [
    './dist/index.js',
    './dist/index.cjs',
    './dist/index.mjs',
    './dist/missing.js',
    './dist/index.d.ts',
    './dist/index.d.ts?x',
    './dist/index%2ed.ts#x',
    './dist/./index.js',
    './dist/../index.js',
    './dist/node_modules/index.js',
    './dist/%2e/index.js',
    './dist/%2e%2e/index.js',
    './dist/%6eode_modules/index.js',
    './dist%2findex.js',
    './dist%5cindex.js',
    './dist/%zz.js',
    './dist/%00.js',
    './dist/index.js?x',
    './dist/index.js#x',
    './dist/index.js?x=%2f',
    './dist/index.js#%5c',
    './dist/index.js?%zz',
    './dist/index.js/../index.js',
    './dist\\index.js',
    './dist//index.js',
    './dist/node_modules?x',
    './dist/..?x',
    './dist/nod%65_modules/index.js',
    './dist/%2enode/index.js',
    './dist',
    './dist/',
    './',
    '../index.js',
    '/index.js',
    'node:fs',
    '',
    null,
    true,
    false,
    42,
    {},
    [],
    { custom: null },
    { require: './dist/index.cjs' },
    { 0: './dist/index.js' },
    { 4294967295: './dist/index.js', default: './dist/index.js' },
  ];
  for (const target of targets) {
    for (const shape of [
      target,
      { node: target, default: './dist/index.js' },
      [target, './dist/index.js'],
      { node: [target], default: './dist/index.js' },
      [null, target],
      { custom: target, default: './dist/index.js' },
      { import: target, require: './dist/index.cjs' },
      { require: target, import: './dist/index.mjs' },
    ])
      add({ '.': shape });
    add(target, '.', 'root shorthand');
  }
  const conditions = ['node', 'import', 'require', 'default', 'custom', 'module-sync', 'node-addons'];
  for (const a of conditions)
    for (const b of conditions)
      for (const target of ['./dist/index.js', null, [], {}, { custom: null }])
        add({ '.': { [a]: { [b]: target }, default: './dist/index.mjs' } }, '.', 'nested conditions');
  const captures = [
    'index',
    'foo/index',
    '../index',
    './index',
    'node_modules/index',
    'foo/../index',
    '%2e%2e/index',
    '%2e/index',
    '%6eode_modules/index',
    '%2findex',
    '%5cindex',
    '%zz',
    '',
    'index.js',
    'foo//index',
    'foo/.',
    'foo/..',
    'foo/node_modules',
    'node_modules',
    'foo\\index',
    'index?x',
    'index#x',
    '*',
    'NODE_MODULES/index',
    '%4eODE_MODULES/index',
    'foo/%2e./index',
    '%00',
    'space index',
    '☃',
    '%E0%A4%A',
  ];
  const patterns = [
    './dist/*.js',
    './dist/*',
    './dist/index.js',
    './dist/*.d.ts',
    '../*.js',
    './dist/../*.js',
    './dist/%2e%2e/*.js',
    ['./dist/*.js', './dist/index.js'],
    ['./dist/../*.js', './dist/index.js'],
    { node: './dist/*.js', default: './dist/index.js' },
  ];
  patterns.push(
    './dist/space *.js',
    './dist/%2a.js',
    './dist/*?query=*',
    './dist/*#hash=*',
    './dist/*/*.js',
    './*',
    { import: null, default: './dist/*.js' },
    [null, './dist/*.js']
  );
  for (const target of patterns)
    for (const capture of captures) add({ './*': target }, './' + capture, 'pattern captures');
  for (const entry of ['./index', './ind', './in', './index.js', './foo/index', './*', './i*', './', './index/']) {
    for (const exports of [
      { './*': './dist/*.js', './index': null },
      { './*': './dist/index.js', './in*': './dist/*.js', './i*ex': './dist/missing.js' },
      { './*': './dist/index.js', './*dex': './dist/index.mjs', './in*': './dist/index.cjs' },
      { './in*': './dist/*-*.js' },
      { './**': './dist/index.js' },
      { './': './dist/index.js' },
      { '.': './dist/index.js', node: './dist/index.js' },
      { 'not-a-subpath': './dist/index.js' },
    ])
      add(exports, entry, 'pattern precedence');
  }
  try {
    for (const [i, c] of cases.entries()) {
      const dir = path.join(root, 'node_modules', `r20-case-${i}`);
      fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `r20-case-${i}`, exports: c.exports }));
      for (const f of [
        'index.js',
        'index.cjs',
        'index.mjs',
        'index.d.ts',
        'index-*.js',
        '*.js',
        'index?x.js',
        'index#x.js',
      ])
        fs.writeFileSync(path.join(dir, 'dist', f), '');
    }
    fs.writeFileSync(path.join(root, 'cases.json'), JSON.stringify(cases));
    fs.writeFileSync(
      path.join(root, 'probe.mjs'),
      `import fs from 'node:fs'; import {createRequire} from 'node:module';
const host=await import(${JSON.stringify(pathToFileURL(hostModule).href)});
const require=createRequire(import.meta.url),cases=JSON.parse(fs.readFileSync(new URL('./cases.json',import.meta.url)));
const rows=await Promise.all(cases.map(async(c,i)=>{const spec='r20-case-'+i+c.entry.slice(1),row={};
for(const mode of ['import','require'])try{const selected=mode==='import'?import.meta.resolve(spec):new URL('file://'+require.resolve(spec)).href;
 const u=new URL(selected);row[mode]={selected,runtime:! /\\.d\\.[cm]?ts$/.test(decodeURIComponent(u.pathname)),exists:fs.existsSync(u)};
}catch(e){row[mode]={error:e.code||e.name,runtime:false}}for(const mode of ['nativeLoad','hostLoad'])try{await(mode==='nativeLoad'?import(spec):host.loadExtensionModule({name:'r20-case-'+i,root:new URL('./node_modules/r20-case-'+i,import.meta.url).pathname,specifier:spec,parentURL:import.meta.url}));row[mode]={loaded:true}}catch(e){row[mode]={loaded:false}}return row}));console.log(JSON.stringify(rows));`
    );
    const run = spawnSync(process.execPath, [path.join(root, 'probe.mjs')], { encoding: 'utf8', maxBuffer: 32e6 });
    if (run.status !== 0) throw new Error(run.stderr);
    const node = JSON.parse(run.stdout);
    const rows = cases.map((c, i) => ({
      ...c,
      preflight: hasRuntimeExtensionExport(c.exports, c.entry),
      selected: resolveExtensionExport(
        c.exports,
        c.entry,
        pathToFileURL(path.join(root, 'node_modules', `r20-case-${i}`, 'package.json')).href
      ),
      node: node[i],
    }));
    const mismatch = rows.filter(
      c =>
        c.preflight !== c.node.import.runtime ||
        canonicalFileURL(c.selected) !== canonicalFileURL(c.node.import.selected) ||
        c.node.nativeLoad.loaded !== c.node.hostLoad.loaded
    );
    return { node: process.version, cases: rows.length, mismatches: mismatch, rows };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
