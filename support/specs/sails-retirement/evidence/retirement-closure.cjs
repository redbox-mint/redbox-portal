'use strict';
// Read-only SR-055 closure: committed source, or an extracted/installed artifact.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
function grep(...args) {
  try {
    return git('grep', ...args)
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}
const treeIndex = process.argv.indexOf('--tree');
const tree = treeIndex >= 0 ? path.resolve(process.argv[treeIndex + 1]) : null;
const commit = tree ? null : git('rev-parse', `${process.argv[2] || 'HEAD'}^{commit}`).trim();
const violations = [],
  classified = [],
  dependencies = [];
const forbidden = name => {
  if (!name) return false;
  const leaf = name.split('/').at(-1);
  const historical = new Set([
    '@researchdatabox/sails-ng-common',
    '@researchdatabox/sails-hook-redbox-storage-mongo',
    '@researchdatabox/sails-hook-redbox-pdfgen',
  ]);
  return (
    /^@sailshq\//.test(name) ||
    leaf === 'sails' ||
    leaf === 'sails.io.js' ||
    leaf === 'skipper' ||
    leaf.startsWith('skipper-') ||
    (leaf.startsWith('sails-') && !historical.has(name)) ||
    leaf === 'waterline' ||
    leaf.startsWith('waterline-')
  );
};
let files, read;
if (!tree) {
  files = git('ls-tree', '-r', '--name-only', commit).trim().split('\n');
  const candidates = new Set(
    grep(
      '-l',
      '-I',
      '-E',
      'sails|Sails|req\\.(file|param|allParams|validate)|res\\.(view|ok|badRequest|serverError|notFound|forbidden|negotiate|jsonx)|io\\.socket|declare[[:space:]]+((const|var|let)[[:space:]]+[[:alnum:]_]*Service|global)',
      commit,
      '--',
      '.'
    ).map(file => file.slice(commit.length + 1))
  );
  files = files.filter(file => candidates.has(file) || /package(?:-lock)?\.json$/.test(file));
  read = file => git('show', `${commit}:${file}`);
} else {
  files = [];
  const seen = new Set();
  function walk(directory, relative = '') {
    const real = fs.realpathSync(directory);
    if (seen.has(real)) return;
    seen.add(real);
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.git', 'coverage', 'test-results', 'playwright-report'].includes(item.name)) continue;
      if (item.name === '.tmp') {
        const publicAssets = path.join(directory, '.tmp/public');
        if (fs.existsSync(publicAssets)) walk(publicAssets, relative ? relative + '/.tmp/public' : '.tmp/public');
        continue;
      }
      const name = relative ? relative + '/' + item.name : item.name;
      const full = path.join(directory, item.name);
      if (item.isDirectory() || (item.isSymbolicLink() && fs.statSync(full).isDirectory())) {
        // Third-party source isn't owned code; inspect every installed manifest below separately.
        if (item.name === 'node_modules') {
          manifests(full, name);
          for (const entry of fs.readdirSync(full)) {
            const installed = path.join(full, entry);
            if (!fs.statSync(installed).isDirectory()) continue;
            if (entry === '@researchdatabox') walk(installed, name + '/' + entry);
            else if (!entry.startsWith('@') && !entry.startsWith('.')) {
              const manifest = path.join(installed, 'package.json');
              if (fs.existsSync(manifest)) {
                const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
                if (pkg.redbox || /^(?:redbox-hook-|@researchdatabox\/)/.test(pkg.name || ''))
                  walk(installed, name + '/' + entry);
              }
            }
          }
        } else walk(full, name);
      } else if (/\.(?:[cm]?js|tsx?|json|hbs|sh|ya?ml|ejs|template)$/.test(name)) files.push(name);
    }
  }
  function manifests(directory, relative) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(directory, item.name),
        name = relative + '/' + item.name;
      if (!fs.statSync(full).isDirectory()) continue;
      if (item.name.startsWith('@')) {
        manifests(full, name);
        continue;
      }
      const manifest = path.join(full, 'package.json');
      if (fs.existsSync(manifest)) {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (forbidden(pkg.name || item.name))
          dependencies.push({
            file: name + '/package.json',
            name: pkg.name,
            version: pkg.version,
            reason: 'Installed package',
          });
      }
      const nested = path.join(full, 'node_modules');
      if (fs.existsSync(nested)) manifests(nested, name + '/node_modules');
    }
  }
  walk(tree);
  read = file => fs.readFileSync(path.join(tree, file), 'utf8');
}
const fixtureFiles = new Set(['record-hook-names.cjs', 'persisted-record-hooks.cjs', 'portal-reference.cjs']);
const wsuConversionNames = {
  'sails.services.planattachmentservice.preserveIds': 'wsu.plan.preserveIds',
  'sails.services.publicationembargoservice.releaseOnTransition': 'wsu.publication.releaseOnTransition',
  'sails.services.publicationembargoservice.validatePublication': 'wsu.publication.validatePublication',
  'sails.services.metadataoutputstriggerservice.produceMetadataFiles': 'wsu.publication.produceMetadataFiles',
};
const doc = file => /(^|\/)(?:support\/(?:specs|wiki|docs)\/|skills\/)/.test(file) || /\.md(?:\.hbs)?$/.test(file);
for (const file of files) {
  const source = read(file);
  if (/package\.json$/.test(file)) {
    const pkg = JSON.parse(source);
    // Only owned manifests must pin declared dependencies. Third-party manifests are not rewritten.
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
      for (const [name, version] of Object.entries(pkg[group] || {})) {
        if (forbidden(name)) dependencies.push({ file, group, name, version });
        if (!/^(?:file:|\.\.?\/|workspace:|\d+\.\d+\.\d+(?:-[\w.-]+)?$)/.test(version))
          violations.push({ file, reason: 'Owned dependency is not exactly pinned', name, version });
      }
    continue;
  }
  if (/package-lock\.json$/.test(file)) {
    for (const [entry, item] of Object.entries(JSON.parse(source).packages || {})) {
      const name = item.name || entry.split('node_modules/').at(-1);
      if (forbidden(name)) dependencies.push({ file, entry, name, version: item.version });
      for (const name of Object.keys(item.dependencies || {}))
        if (forbidden(name)) dependencies.push({ file, entry, name, reason: 'Required dependency edge' });
    }
    continue;
  }
  if (
    !/sails|Sails|req\.(?:file|param|allParams|validate)|res\.(?:view|ok|badRequest|serverError|notFound|forbidden|negotiate|jsonx)|io\.socket|declare\s+(?:(?:const|var|let)\s+\w+Service|global)/.test(
      source
    )
  )
    continue;
  if (doc(file)) {
    classified.push({ file, reason: 'Documentation/historical evidence or agent guidance' });
    continue;
  }
  if (file === '.gitignore') {
    classified.push({ file, reason: 'Ignored historical artifact names' });
    continue;
  }
  if (!/\.(?:[cm]?js|tsx?)(?:\.hbs)?$/.test(file)) {
    const executableText = source.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*#.*$/gm, '');
    if (/\bsails\.[A-Za-z]|\bSails\.[A-Za-z]|\bsails_[A-Za-z_]|sails lift|sails lower/.test(executableText)) {
      if (file === 'support/integration-testing/rehearse-sails-retirement-recovery.sh')
        classified.push({
          file,
          reason:
            'Historical released-v5 process inputs for source/recovery proof only; never v6 application configuration',
        });
      else violations.push({ file, reason: 'Non-JavaScript executable/template legacy path requires review' });
    } else
      classified.push({ file, reason: 'Historical package/task names, styles, schema descriptions or HTML comments' });
    continue;
  }
  const ast = ts.createSourceFile(file.replace(/\.hbs$/, ''), source, ts.ScriptTarget.Latest, true);
  let findings = 0;
  function classify(node, reason) {
    classified.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, reason });
    findings++;
  }
  function fail(node, reason) {
    violations.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, reason });
    findings++;
  }
  function assertion(node) {
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isExpressionStatement(n)) return n.getText(ast);
      if (ts.isStatement(n)) return '';
    }
    return '';
  }
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const oldHelpers = {
        req: /^(?:file|param|allParams|validate)$/,
        res: /^(?:view|ok|badRequest|serverError|notFound|forbidden|negotiate|jsonx)$/,
        io: /^socket$/,
      };
      if (Object.hasOwn(oldHelpers, node.expression.text) && oldHelpers[node.expression.text].test(node.name.text)) {
        const ownedParameterInput =
          /\/redbox-core\/(?:src|dist)\/(?:forms\/ContextVariables|queries\/Reports)\.[jt]s$/.test(file);
        const fixtureParameterInput =
          /\/redbox-core\/test\/(?:controllers\/(?:AdminController|webservice\/UserManagementController)|services\/(?:ReportsService|TranslationService))\.test\.ts$/.test(
            file
          );
        if (
          node.expression.text === 'req' &&
          node.name.text === 'param' &&
          (ownedParameterInput || fixtureParameterInput)
        )
          classify(node, 'Explicit finite parameter input or fixture data reader; no framework request/helper binding');
        else fail(node, 'Retired framework request/response/socket helper');
      }
    }
    if (ts.isIdentifier(node) && /^(?:sails|Sails)$/.test(node.text)) {
      const check = assertion(node);
      if (
        /(?:assert\.(?:equal|strictEqual)\([^,]+,\s*undefined(?:\s*[,)]|$)|expect\([^;]+\.sails\)\.to\.equal\(undefined\))/.test(
          check
        )
      )
        classify(node, 'Assertion that the retired global is absent');
      else if (
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name === node &&
        node.parent.initializer.kind === ts.SyntaxKind.FalseKeyword
      )
        classify(node, 'Diagnostic records the absent runtime');
      else if (
        /^(?:packages|node_modules\/@researchdatabox)\/redbox-core\/test\/loader\/retirement\.test\.ts$/.test(file) &&
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name === node
      )
        classify(node, 'Negative stale registration metadata fixture; module must not execute');
      else if (
        /\/redbox-dev-tools\/(?:src|dist)\/cli\.[jt]s$/.test(file) &&
        ts.isPropertyAccessExpression(node.parent) && node.parent.name === node &&
        node.parent.getText(ast) === 'pkg.sails' &&
        ts.isBinaryExpression(node.parent.parent) && node.parent.parent.getText(ast) === 'pkg.sails != null' &&
        ts.isIfStatement(node.parent.parent.parent) &&
        node.parent.parent.parent.thenStatement.getText(ast) === "findings.push('sails: remove legacy hook discovery metadata');"
      )
        classify(node, 'Offline manifest rejection check; legacy metadata is never loaded');
      else if (
        /\/redbox-dev-tools\/test\/cli\.test\.ts$/.test(file) &&
        ((ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node && node.parent.getText(ast) === 'pkg.sails'))
      )
        classify(node, 'Negative CLI manifest fixture; subprocess must reject v6 legacy metadata');
      else fail(node, 'Executable/type Sails identifier');
    }
    if (ts.isVariableStatement(node)) {
      let globalAugmentation = false;
      for (let scope = node.parent; scope; scope = scope.parent)
        if (ts.isModuleDeclaration(scope) && scope.flags & ts.NodeFlags.GlobalAugmentation) globalAugmentation = true;
      const declared = node.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword);
      const moduleExport =
        ts.isExternalModule(ast) &&
        !globalAugmentation &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (declared || globalAugmentation)
        for (const declaration of node.declarationList.declarations)
          if (ts.isIdentifier(declaration.name) && /Service$/.test(declaration.name.text)) {
            if (moduleExport) classify(declaration, 'Explicit module export declaration; no ambient global');
            else fail(declaration, 'Ambient service global declaration');
          }
    }
    if (
      (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) &&
      /\bsails\.[A-Za-z]|\bSails\.[A-Za-z]|generateAllShims|(?:globalThis|global)\.sails\s*=|(?:require|import)\(['"]sails['"]\)/.test(
        ts.isStringLiteralLike(node) ? node.text : node.getText(ast)
      )
    ) {
      if (/\/(?:src|dist)\/recordTypes\/RecordHookNames\.[cm]?[jt]s$/.test(file))
        classify(node, 'Finite persisted-declaration conversion key or rejected legacy prefix; never evaluated');
      else if (
        /\/redbox-dev-tools\/test\/cli\.test\.ts$/.test(file) && ts.isStringLiteralLike(node) &&
        node.text === '<%= sails.config.appUrl %>' && ts.isCallExpression(node.parent) &&
        node.parent.expression.getText(ast) === 'fs.writeFileSync' && node.parent.arguments[1] === node
      )
        classify(node, 'Exact negative EJS fixture written for offline v6 rejection; never rendered');
      else if (
        file.endsWith('/test/qualification/installed-dependency-graph.cjs') &&
        ts.isStringLiteralLike(node) && node.text === 'sails.io.js' &&
        ts.isArrayLiteralExpression(node.parent) &&
        node.parent.elements.every(element => ts.isStringLiteralLike(element)) &&
        node.parent.elements.map(element => element.text).join(',') === 'sails,sails.io.js,skipper,waterline' &&
        ts.isPropertyAccessExpression(node.parent.parent) && node.parent.parent.name.text === 'includes' &&
        ts.isCallExpression(node.parent.parent.parent) &&
        node.parent.parent.parent.arguments.length === 1 && node.parent.parent.parent.arguments[0].getText(ast) === 'leaf'
      )
        classify(node, 'Exact forbidden installed-package membership table; never imported');
      else if (
        /(?:^|\/)redbox-hook-wsu\/(?:src|dist)\/migration-data\.[jt]s$/.test(file) &&
        ts.isStringLiteralLike(node) && ts.isPropertyAssignment(node.parent) && node.parent.name === node &&
        ts.isStringLiteralLike(node.parent.initializer) &&
        Object.hasOwn(wsuConversionNames, node.text) && wsuConversionNames[node.text] === node.parent.initializer.text
      )
        classify(node, 'Finite WSU persisted-declaration conversion key to its explicit named operation; never evaluated');
      else if (/\/test\/qualification\//.test(file) && fixtureFiles.has(path.basename(file)))
        classify(node, 'Persisted conversion fixture/opaque-value preservation and rejection assertions');
      else if (
        /\/redbox-core\/test\/queues\/QueueMongo\.test\.ts$/.test(file) &&
        ts.isStringLiteralLike(node) &&
        /^sails\.services\.[A-Za-z][A-Za-z0-9_.]*$/.test(node.text)
      )
        classify(node, 'Persisted queue migration fixture/opaque-value preservation and rejection assertions');
      else if (
        /^(?:packages|node_modules\/@researchdatabox)\/redbox-core\/test\/configuration\/legacyInventoryTypes\.ts$/.test(file) &&
        ts.isStringLiteralLike(node) &&
        /^sails\.services\.[A-Za-z][A-Za-z0-9_.]*$/.test(node.text)
      )
        classify(node, 'Baseline configuration literal table; persisted operation names are data, never evaluated');
      else if (/(^|\/)test\/tooling\/retirement-closure\.test\.cjs$/.test(file) && ts.isStringLiteralLike(node))
        classify(node, 'Auditor positive/negative control source strings; never imported by the application');
      else if (
        /\/test\/qualification\/(?:portal-application|workflow-triggers|wsu)\.cjs$/.test(file) &&
        (assertion(node).includes('assert.throws') || node.text === 'sails.services.synthetic.unregistered')
      )
        classify(node, 'Explicit unknown-operation rejection fixture');
      else fail(node, 'Legacy runtime/generated path in a literal');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!findings)
    classified.push({
      file,
      reason: 'Comments, historical package/import names or assertions of removed configuration',
    });
}
const result = {
  commit,
  tree,
  scannedFiles: files.length,
  executableViolations: violations.length,
  forbiddenDependencyEntries: dependencies.length,
  method:
    'AST identifier/literal and ambient declaration checks; structural manifest/lock and recursive installed-package checks. Complements original SR-001 text candidates.',
  violations,
  dependencies,
  classified,
};
console.log(JSON.stringify(result, null, 2));
if (violations.length || dependencies.length) process.exitCode = 1;
