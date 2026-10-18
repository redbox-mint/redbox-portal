#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

// Follow only static JS/CSS imports. Summing all outputs would charge lazy
// features to the initial budget, and counting each import would double-count
// shared chunks. Angular budgets use raw (uncompressed) bytes.
function measureBundles(stats, entryNames = ['main', 'polyfills', 'styles', 'scripts'], requiredEntries = ['main']) {
  const outputs = stats.outputs;
  if (!outputs || typeof outputs !== 'object') throw new Error('Missing esbuild outputs in stats');
  const initial = new Set();
  const foundEntries = new Set();
  const pending = Object.keys(outputs).filter(file => {
    if (outputs[file]['ng-component'] || !outputs[file].entryPoint || !/\.(?:js|css)$/.test(file)) return false;
    const stem = path.basename(file, path.extname(file));
    // Hashes are opaque: do not assume esbuild's historical uppercase alphabet
    // or length. Prefer exact/longer names so a bundle named "theme-dark" does
    // not get mistaken for a hashed "theme" bundle.
    const globalEntry = /^angular:(styles|script)\/global:(.+)$/.exec(outputs[file].entryPoint);
    const globalName = globalEntry?.[1] === 'script' ? globalEntry[2].replace(/\.js$/, '') : globalEntry?.[2];
    const name = globalName
      ? entryNames.find(name => name === globalName)
      : [...entryNames].sort((a, b) => b.length - a.length).find(name =>
        stem === name || (stem.startsWith(`${name}-`) && /^[\w-]+$/.test(stem.slice(name.length + 1))));
    if (name === 'main' && !file.endsWith('.js')) return false;
    if (name) foundEntries.add(name);
    return !!name;
  });
  for (const name of requiredEntries) {
    if (!foundEntries.has(name)) throw new Error(`Missing ${name} entry point in stats`);
  }
  while (pending.length) {
    const file = pending.pop();
    if (initial.has(file)) continue;
    const output = outputs[file];
    if (!output) throw new Error(`Missing statically imported output: ${file}`);
    initial.add(file);
    for (const dependency of output.imports ?? []) {
      if (!dependency.external && ['import-statement', 'import-rule'].includes(dependency.kind)) {
        pending.push(dependency.path);
      }
    }
    if (output.cssBundle) pending.push(output.cssBundle);
  }
  const files = Object.entries(outputs)
    // Angular includes intermediate component CSS in its metafile. Those styles
    // are embedded in JS, not emitted as separate lazy files.
    .filter(([file, output]) => !output['ng-component'] && /\.(?:js|css)$/.test(file))
    .map(([file, output]) => {
      if (!Number.isSafeInteger(output.bytes) || output.bytes < 0) throw new Error(`Invalid byte size: ${file}`);
      return { file, bytes: output.bytes, initial: initial.has(file) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
  return {
    initialBytes: files.filter(file => file.initial).reduce((total, file) => total + file.bytes, 0),
    initialJsBytes: files.filter(file => file.initial && file.file.endsWith('.js')).reduce((total, file) => total + file.bytes, 0),
    initialCssBytes: files.filter(file => file.initial && file.file.endsWith('.css')).reduce((total, file) => total + file.bytes, 0),
    lazyBytes: files.filter(file => !file.initial).reduce((total, file) => total + file.bytes, 0),
    files
  };
}

function budgetBytes(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported absolute bundle budget: ${value}`);
  return Number(match[1]) * ({ b: 1, kb: 1000, mb: 1000000, gb: 1000000000 }[match[2]?.toLowerCase() ?? 'b']);
}

function checkProject(root, app) {
  const workspace = JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'), 'utf8'));
  const projectName = app.startsWith('@researchdatabox/') ? app : `@researchdatabox/${app}`;
  const project = workspace.projects[projectName];
  if (project?.projectType !== 'application') throw new Error(`Unknown Angular app: ${app}`);
  const build = project.architect.build;
  const overrides = build.configurations.production;
  const production = { ...build.options, ...overrides };
  // Match Architect: object options merge one layer deep; arrays and scalars
  // replace the base option. A shallow spread can hide disabled base scripts.
  for (const key of Object.keys(overrides)) {
    if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) &&
        build.options[key] && typeof build.options[key] === 'object' && !Array.isArray(build.options[key])) {
      production[key] = { ...build.options[key], ...overrides[key] };
    }
  }
  if (production.optimization === false || production.optimization?.scripts === false) {
    throw new Error(`${app}: production script optimisation is disabled`);
  }
  const output = production.outputPath;
  const base = path.resolve(root, 'angular', typeof output === 'string' ? output : output.base);
  const browser = path.join(base, typeof output === 'object' ? output.browser ?? 'browser' : 'browser');
  // Angular 22 emits browser-stats.json; earlier application builders used stats.json.
  const statsPaths = ['browser-stats.json', 'stats.json'].map(file => path.join(base, file)).filter(file => fs.existsSync(file));
  if (!statsPaths.length) throw new Error(`${app}: missing production stats; build with --stats-json first`);
  if (statsPaths.length !== 1) throw new Error(`${app}: ambiguous production stats; clean the output and rebuild`);
  const entryNames = new Set(['main']);
  if (production.polyfills?.length) entryNames.add('polyfills');
  for (const type of ['styles', 'scripts']) {
    for (const entry of production[type] ?? []) {
      if (typeof entry === 'string') entryNames.add(type);
      else if (entry.inject !== false) entryNames.add(entry.bundleName || type);
    }
  }
  const report = measureBundles(JSON.parse(fs.readFileSync(statsPaths[0], 'utf8')), [...entryNames], [...entryNames]);
  for (const file of report.files) {
    if (fs.statSync(path.join(browser, file.file)).size !== file.bytes) {
      throw new Error(`${app}: stats do not match emitted file ${file.file}`);
    }
  }
  const budgets = production.budgets?.filter(budget => budget.type === 'initial') ?? [];
  if (!budgets.length) throw new Error(`${app}: missing initial bundle budgets`);
  let warning = false;
  for (const budget of budgets) {
    if (!budget.maximumWarning || !budget.maximumError) throw new Error(`${app}: missing initial bundle budgets`);
    if (budget.baseline !== undefined) throw new Error(`${app}: initial budgets must use absolute limits without a baseline`);
    if (budgetBytes(budget.maximumWarning) > budgetBytes(budget.maximumError)) throw new Error(`${app}: warning budget exceeds error budget`);
    if (report.initialBytes > budgetBytes(budget.maximumError)) {
      throw new Error(`${app}: initial ${report.initialBytes} bytes exceeds ${budget.maximumError}`);
    }
    warning ||= report.initialBytes > budgetBytes(budget.maximumWarning);
  }
  return { project: projectName, ...report, budgets, warning };
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '../..');
    const apps = process.argv.slice(2);
    if (!apps.length) throw new Error('Usage: node support/build/angular-bundle-stats.cjs <app> [app ...]');
    console.log(JSON.stringify(apps.map(app => checkProject(root, app)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { measureBundles, budgetBytes, checkProject };
