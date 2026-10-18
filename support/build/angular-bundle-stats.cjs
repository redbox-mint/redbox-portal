#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

// Follow only static JS/CSS imports. Summing all outputs would charge lazy
// features to the initial budget, and counting each import would double-count
// shared chunks. Angular budgets use raw (uncompressed) bytes.
function measureBundles(stats, entryNames = ['main', 'polyfills', 'styles', 'scripts']) {
  const outputs = stats.outputs;
  if (!outputs || typeof outputs !== 'object') throw new Error('Missing esbuild outputs in stats');
  const initial = new Set();
  const pending = Object.keys(outputs).filter(file => {
    const name = path.basename(file).replace(/(?:-[A-Z0-9]{8})?\.(?:js|css)$/, '');
    return !outputs[file]['ng-component'] && outputs[file].entryPoint && entryNames.includes(name);
  });
  if (!pending.some(file => /(?:^|\/)main(?:-[A-Z0-9]{8})?\.js$/.test(file))) {
    throw new Error('Missing main entry point in stats');
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
    lazyBytes: files.filter(file => !file.initial).reduce((total, file) => total + file.bytes, 0),
    files
  };
}

function budgetBytes(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(value);
  if (!match) throw new Error(`Unsupported absolute bundle budget: ${value}`);
  return Number(match[1]) * ({ b: 1, kb: 1000, mb: 1000000, gb: 1000000000 }[match[2]?.toLowerCase() ?? 'b']);
}

function checkProject(root, app) {
  const workspace = JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'), 'utf8'));
  const projectName = app.startsWith('@researchdatabox/') ? app : `@researchdatabox/${app}`;
  const project = workspace.projects[projectName];
  if (project?.projectType !== 'application') throw new Error(`Unknown Angular app: ${app}`);
  const build = project.architect.build;
  const production = { ...build.options, ...build.configurations.production };
  if (production.optimization === false || production.optimization?.scripts === false) {
    throw new Error(`${app}: production script optimisation is disabled`);
  }
  const output = production.outputPath;
  const base = path.resolve(root, 'angular', typeof output === 'string' ? output : output.base);
  const browser = path.join(base, typeof output === 'object' ? output.browser ?? 'browser' : 'browser');
  // Angular 22 emits browser-stats.json; earlier application builders used stats.json.
  const statsPath = ['browser-stats.json', 'stats.json'].map(file => path.join(base, file)).find(file => fs.existsSync(file));
  if (!statsPath) throw new Error(`${app}: missing production stats; build with --stats-json first`);
  const entryNames = ['main', 'polyfills', 'styles', 'scripts'];
  for (const entry of [...(production.styles ?? []), ...(production.scripts ?? [])]) {
    if (typeof entry === 'object' && entry.inject !== false && entry.bundleName) entryNames.push(entry.bundleName);
  }
  const report = measureBundles(JSON.parse(fs.readFileSync(statsPath, 'utf8')), entryNames);
  for (const file of report.files) {
    if (fs.statSync(path.join(browser, file.file)).size !== file.bytes) {
      throw new Error(`${app}: stats do not match emitted file ${file.file}`);
    }
  }
  const budget = production.budgets?.find(budget => budget.type === 'initial');
  if (!budget?.maximumWarning || !budget.maximumError) throw new Error(`${app}: missing initial bundle budgets`);
  if (report.initialBytes > budgetBytes(budget.maximumError)) {
    throw new Error(`${app}: initial ${report.initialBytes} bytes exceeds ${budget.maximumError}`);
  }
  return { project: projectName, ...report, budget, warning: report.initialBytes > budgetBytes(budget.maximumWarning) };
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
