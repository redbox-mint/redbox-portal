'use strict';
// FM-043: scan the working tree, extracted packages and installed dependency paths.
// No dependency/import exception exists outside the documented Companion owner.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const forbidden = name =>
  /^(?:@fastify\/(?:express|middie)|fastify-(?:express|middie)|(?:@types\/)?(?:express(?:-.*)?|body-parser|cookie-parser|connect-mongo|connect-redis|compression|csrf-sync|passport(?:-.*)?))$/.test(
    name
  );
const browserBuildOnly = new Set([
  '@angular-devkit/build-angular',
  '@angular-devkit/build-webpack',
  '@angular/build',
  'webpack-dev-server',
  'karma',
]);
// Exact existing provider closure. A new Express package or version needs a
// documented boundary review even when it appears below the pinned Companion.
const companionDependencies = new Map(
  Object.entries({
    express: ['5.3.0'],
    '@types/express': ['5.0.6'],
    '@types/express-serve-static-core': ['5.1.1', '5.1.3'],
    '@types/body-parser': ['1.19.6'],
    'body-parser': ['2.4.0'],
    'cookie-parser': ['1.4.7'],
    'connect-redis': ['7.1.1'],
    'express-interceptor': ['1.2.0'],
    'express-prom-bundle': ['8.0.0'],
    'express-session': ['1.18.2', '1.19.0'],
  })
);
const companionDependency = (name, version) => companionDependencies.get(name)?.includes(version) === true;
const boundaryFiles = new Set(['http/integrations/companion/fastify', 'http/integrations/companion/uploads']);
const coreNames = new Set(['@researchdatabox/redbox-core', '@researchdatabox/redbox-core-types']);
const coreManifestFiles = new Set([
  'package.json', // Extracted core/core-types tarball.
  'package-lock.json:', // Standalone core installation.
  'packages/redbox-core/package.json',
  'package-lock.json:packages/redbox-core',
  'packages/redbox-core/package-lock.json:',
  'packages/redbox-dev-tools/package-lock.json:../redbox-core',
  'packages/redbox-hook-dev/package-lock.json:../redbox-core',
  'packages/sails-hook-redbox-pdfgen/package-lock.json:../redbox-core',
  'packages/sails-hook-redbox-storage-mongo/package-lock.json:../redbox-core',
]);
function companionFile(file) {
  const match = file
    .replaceAll('\\', '/')
    .match(/^(?:packages\/redbox-core\/)?(?:src|dist)\/(http\/integrations\/companion\/[^.]+)(?:\.d)?\.[cm]?[jt]s$/);
  return !!match && boundaryFiles.has(match[1]);
}
function scanSource(file, text) {
  const violations = [],
    allowed = [];
  if (/\.(?:ejs|html)$/.test(file)) {
    // Only executable template/script regions are JavaScript. Preserve offsets
    // for useful diagnostics and ignore rendered text and template comments.
    const input = text.replace(/<!--[\s\S]*?-->|<%#[\s\S]*?%>/g, match => match.replace(/[^\n]/g, ' '));
    const regions = [...input.matchAll(/<%(?!#)[_=-]?([\s\S]*?)%>|<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    const output = input.split('').map(char => (char === '\n' ? '\n' : ' '));
    for (const region of regions) {
      const code = region[1] ?? region[2];
      const start = region.index + region[0].indexOf(code);
      for (let i = 0; i < code.length; i++) output[start + i] = code[i];
    }
    text = output.join('');
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const constants = new Map(),
    factories = new Set(['createRequire']),
    loaders = new Set(['require', 'require.resolve', 'module.require']);
  const literal = (node, seen = new Set()) => {
    if (!node) return;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
      seen.add(node.text);
      return literal(constants.get(node.text), seen);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left, new Set(seen)),
        right = literal(node.right, new Set(seen));
      if (left !== undefined && right !== undefined) return left + right;
    }
  };
  function collect(node) {
    if (ts.isImportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === 'createRequire')
      factories.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name))
      for (const item of node.name.elements)
        if ((item.propertyName?.getText(source) ?? item.name.getText(source)) === 'createRequire')
          factories.add(item.name.getText(source));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
      const value = node.initializer;
      if (
        (ts.isIdentifier(value) && loaders.has(value.text)) ||
        (ts.isCallExpression(value) &&
          (factories.has(value.expression.getText(source)) ||
            /(?:^|\.)createRequire$/.test(value.expression.getText(source))))
      )
        loaders.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  const add = (node, reason) =>
    violations.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, reason });
  const specifier = (node, value) => {
    if (typeof value !== 'string') return;
    const dependencyPath = value.replace(/^.*node_modules\//, '');
    const dependency = dependencyPath
      .split('/')
      .slice(0, dependencyPath.startsWith('@') ? 2 : 1)
      .join('/');
    if (forbidden(dependency)) {
      if (dependency === 'express' && companionFile(file))
        allowed.push({ file, dependency, reason: 'Private Companion prototypes/provider API; see companion.md' });
      else add(node, 'Retired dependency reference: ' + value);
    }
    if (/(?:^|\/)http\/express(?:\/|$)|app\.express\.cjs/.test(value))
      add(node, 'Retired first-party host path: ' + value);
  };
  for (const reference of [...source.typeReferenceDirectives, ...source.referencedFiles])
    specifier({ getStart: () => reference.pos }, reference.fileName);
  function isRejectedOperation(node) {
    // A negative capability test proves a bridge cannot be created. The exact
    // enclosing assertion is checked; ordinary test adapters get no exception.
    for (let parent = node.parent; parent; parent = parent.parent)
      if (ts.isCallExpression(parent) && parent.expression.getText(source) === 'assert.throws') return true;
    return false;
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      specifier(node, node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      specifier(node, node.moduleReference.expression?.text);
    if (ts.isImportTypeNode(node)) specifier(node, node.argument.literal?.text);
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) specifier(node, node.name.text);
    if (
      ts.isCallExpression(node) &&
      (loaders.has(node.expression.getText(source)) || node.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      const arg = node.arguments[0];
      if (literal(arg) !== undefined) specifier(node, literal(arg));
      // Dynamic loading a known retired path must not evade the literal-import scan.
      else if (arg && /http\/express|app\.express/.test(arg.getText(source)))
        add(node, 'Dynamic retired host reference');
    }
    if (
      !companionFile(file) &&
      ((ts.isQualifiedName(node) && node.left.getText(source) === 'Express') ||
        (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'Express'))
    )
      add(node, 'Ambient Express type surface');
    if (
      ts.isIdentifier(node) &&
      [
        'ExpressHost',
        'PortalHttp',
        'LegacyPortalApplicationOptions',
        'createPortalApplication',
        'createPortalHost',
        'runHttpRequestHandler',
        'retainHttpResponse',
        'failHttpResponse',
      ].includes(node.text)
    )
      add(node, 'Retired host/selector symbol: ' + node.text);
    if (
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      /^(?:HTTP_HOST|HTTP_TEST_HOST|RBPORTAL_(?:HTTP|PLAYWRIGHT)_HOST)$/.test(node.text)
    )
      add(node, 'Retired host selector name');
    if (
      !companionFile(file) &&
      ((ts.isUnionTypeNode(node) &&
        node.types.some(type => ts.isLiteralTypeNode(type) && literal(type.literal) === 'express') &&
        node.types.some(type => ts.isLiteralTypeNode(type) && literal(type.literal) === 'fastify')) ||
        (ts.isBinaryExpression(node) &&
          [
            ts.SyntaxKind.EqualsEqualsToken,
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsToken,
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ].includes(node.operatorToken.kind) &&
          [node.left, node.right].some(side => literal(side) === 'express') &&
          [node.left, node.right].some(side =>
            /^(?:(?:process\.(?:env|argv))|(?:[\w]+\.)*(?:kind|host|hostKind|httpHost|transport|selectedHost)\b)/i.test(
              side.getText(source)
            )
          )) ||
        (ts.isCaseClause(node) && literal(node.expression) === 'express'))
    )
      add(node, 'Retired Express host selection');
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      node.expression.getText(source) === 'process.env'
    ) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression?.text;
      if (/^(?:HTTP_HOST|HTTP_TEST_HOST|RBPORTAL_(?:HTTP|PLAYWRIGHT)_HOST)$/.test(key ?? ''))
        add(node, 'Retired host selector key');
    }
    if (
      !companionFile(file) &&
      ts.isCallExpression(node) &&
      !isRejectedOperation(node) &&
      /(?:Object|Reflect)\.setPrototypeOf$/.test(node.expression.getText(source)) &&
      /express|request|response|\breq\b|\bres\b/i.test(node.arguments.map(x => x.getText(source)).join(' '))
    )
      add(node, 'Request/response prototype compatibility bridge');
    if (
      !companionFile(file) &&
      (ts.isObjectLiteralExpression(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeLiteralNode(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node))
    ) {
      const names = new Set(
        (node.properties ?? node.members).map(x => x.name?.getText(source).replace(/^['"]|['"]$/g, ''))
      );
      const request = ['originalUrl', 'path', 'query', 'params', 'session', 'get'].filter(x => names.has(x));
      const response = ['status', 'json', 'send', 'redirect', 'sendStatus', 'locals', 'render'].filter(x =>
        names.has(x)
      );
      if (
        request.length >= 5 ||
        (names.has('set') && names.has('status') && names.has('json')) ||
        (response.length >= 4 && (names.has('redirect') || names.has('locals') || names.has('render')))
      )
        add(node, 'Express-shaped request/response compatibility surface');
    }
    ts.forEachChild(node, visit);
    for (const doc of node.jsDoc ?? []) visit(doc);
  }
  visit(source);
  return { violations, allowed };
}
function configProblems(file, text) {
  const parsed = ts.parseConfigFileTextToJson(file, text);
  if (parsed.error) return { violations: [{ file, reason: 'Cannot audit TypeScript configuration' }], allowed: [] };
  const config = parsed.config;
  const inputs = [
    ...[config.extends].flat(),
    ...(config.compilerOptions?.types ?? []),
    ...(config.compilerOptions?.typeRoots ?? []),
    ...Object.values(config.compilerOptions?.paths ?? {}).flat(),
  ];
  const violations = [];
  for (const input of inputs) {
    if (typeof input !== 'string') continue;
    const packageName = input
      .replace(/^.*node_modules\//, '')
      .split('/')
      .slice(0, input.includes('@') ? 2 : 1)
      .join('/');
    if (forbidden(packageName)) violations.push({ file, reason: 'Retired TypeScript dependency: ' + input });
  }
  return { violations, allowed: [] };
}
function manifestProblems(file, pkg) {
  const violations = [],
    allowed = [];
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      const alias = typeof version === 'string' ? /^npm:((?:@[^/]+\/)?[^@]+)/.exec(version)?.[1] : undefined;
      if (!forbidden(name) && !forbidden(alias ?? '')) continue;
      if (alias && forbidden(alias)) {
        violations.push({ file, section, name, reason: 'Aliased retired dependency: ' + alias });
        continue;
      }
      if (
        coreNames.has(pkg.name) &&
        coreManifestFiles.has(file) &&
        ['express', '@types/express'].includes(name) &&
        section === 'dependencies' &&
        version === (name === 'express' ? '5.3.0' : '5.0.6')
      )
        allowed.push({ file, section, name, version, reason: 'Private Companion boundary only' });
      else violations.push({ file, section, name, reason: 'First-party dependency outside Companion boundary' });
    }
  for (const [name, command] of Object.entries(pkg.scripts ?? {}))
    if (/legacy-express|app\.express|HTTP_HOST|RBPORTAL_PLAYWRIGHT_HOST/.test(name + ' ' + command))
      violations.push({ file, reason: 'Retired executable script: ' + name });
  return { violations, allowed };
}
function graphProblems(tree, file) {
  const violations = [],
    allowed = [];
  function visit(node, ancestry) {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      const chain = [...ancestry, name];
      if (browserBuildOnly.has(name))
        violations.push({
          file,
          path: chain,
          reason: 'Angular build-only dependency escaped into the server installed graph',
        });
      if (forbidden(name)) {
        const directBoundary = coreNames.has(ancestry.at(-1)) && ['express', '@types/express'].includes(name);
        const contained =
          ancestry.includes('@uppy/companion') ||
          ancestry.some(
            (parent, i) => ['express', '@types/express'].includes(parent) && coreNames.has(ancestry[i - 1])
          );
        if (
          (directBoundary || contained) &&
          companionDependency(name, child.version) &&
          !child.invalid &&
          !child.extraneous &&
          !child.missing
        )
          allowed.push({ file, path: chain, version: child.version });
        else
          violations.push({
            file,
            path: chain,
            reason: 'Uncontained or invalid installed Express dependency',
            invalid: child.invalid,
            extraneous: child.extraneous,
            missing: child.missing,
          });
      }
      visit(child, chain);
    }
  }
  visit(tree, [tree.name]);
  return { violations, allowed };
}
/** Resolve every lock edge using npm's upward node_modules lookup, including
 * workspace links. Physical hoisting never grants an allowlist exception: the
 * dependency ancestry decides whether an Express package is contained. */
function angularBuildPath(file, ancestry, dependency) {
  // Exact repository build-only edges. These never apply to manifests, source,
  // tarballs, npm ls or production images. See companion.md / FM-043 evidence.
  if (file !== 'angular/package-lock.json') return false;
  if (ancestry.length === 2 && ancestry[1] === 'karma') return dependency === 'body-parser';
  if (
    ancestry.length === 3 &&
    ['karma-jasmine', 'karma-jasmine-html-reporter', 'karma-junit-reporter'].includes(ancestry[1]) &&
    ancestry[2] === 'karma'
  )
    return dependency === 'body-parser';
  if (
    ancestry.length === 4 &&
    ancestry[1] === 'karma-jasmine-html-reporter' &&
    ancestry[2] === 'karma-jasmine' &&
    ancestry[3] === 'karma'
  )
    return dependency === 'body-parser';
  if (ancestry[1] !== '@angular-devkit/build-angular') return false;
  const parents = ancestry.slice(2);
  if (parents[0] === '@angular-devkit/build-webpack') parents.shift();
  if (parents[0] === 'webpack-dev-server') {
    if (parents.length === 1)
      return ['express', '@types/express', '@types/express-serve-static-core', 'compression'].includes(dependency);
    if (parents.length === 2 && parents[1] === 'express') return dependency === 'body-parser';
    if (parents.length === 2 && parents[1] === '@types/express')
      return ['@types/body-parser', '@types/express-serve-static-core'].includes(dependency);
    if (parents.length === 2 && parents[1] === '@types/connect-history-api-fallback')
      return dependency === '@types/express-serve-static-core';
    if (parents.length === 2 && parents[1] === '@types/serve-index') return dependency === '@types/express';
    if (parents.length === 3 && parents[1] === '@types/serve-index' && parents[2] === '@types/express')
      return ['@types/body-parser', '@types/express-serve-static-core'].includes(dependency);
    return false;
  }
  // Angular's unchanged Karma peer uses only body-parser; it does not justify
  // Express, sessions, Passport or another server dependency under Karma.
  return (
    dependency === 'body-parser' &&
    ((parents.length === 1 && parents[0] === 'karma') ||
      (parents.length === 2 && parents[0] === '@angular/build' && parents[1] === 'karma'))
  );
}
function lockProblems(lock, file) {
  const violations = [],
    allowed = [],
    packages = lock.packages ?? {};
  if (lock.lockfileVersion !== 3)
    return { violations: [{ file, reason: 'Expected an auditable v3 lockfile' }], allowed };
  const owned = Object.entries(packages).filter(([key, pkg]) => !key || (!key.includes('node_modules/') && !pkg.link));
  const resolve = (from, name) => {
    let directory = from;
    for (;;) {
      const candidate = path.posix.join(directory, 'node_modules', name);
      if (packages[candidate]) {
        const record = packages[candidate];
        return record.link ? record.resolved : candidate;
      }
      if (!directory || directory === '.' || directory === '..') break;
      const next = path.posix.dirname(directory);
      directory = next === '.' ? '' : next;
    }
    if (packages['node_modules/' + name]) {
      const record = packages['node_modules/' + name];
      return record.link ? record.resolved : 'node_modules/' + name;
    }
  };
  const seen = new Set(),
    reachable = new Set();
  function visit(key, ancestry) {
    const pkg = packages[key];
    if (!pkg) {
      violations.push({ file, path: ancestry, reason: 'Unresolved lock link: ' + key });
      return;
    }
    const contained =
      ancestry.includes('@uppy/companion') ||
      ancestry.some((name, i) => ['express', '@types/express'].includes(name) && coreNames.has(ancestry[i - 1]));
    const angularContext =
      file === 'angular/package-lock.json' &&
      ancestry.length <= 7 &&
      [
        '@angular-devkit/build-angular',
        'karma',
        'karma-jasmine',
        'karma-jasmine-html-reporter',
        'karma-junit-reporter',
      ].includes(ancestry[1])
        ? ancestry.slice(1).join('>')
        : 'outside';
    const state = key + ':' + contained + ':' + angularContext;
    if (seen.has(state)) return;
    seen.add(state);
    reachable.add(key);
    const deps = {
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
      ...(!key || key.startsWith('packages/') ? pkg.devDependencies : {}),
    };
    for (const name of Object.keys(deps)) {
      const target = resolve(key, name);
      if (!target) {
        // Optional platform/provider peers need not be installed in a lock.
        if (
          !key.startsWith('../') &&
          forbidden(name) &&
          !pkg.optionalDependencies?.[name] &&
          !pkg.peerDependenciesMeta?.[name]?.optional &&
          !pkg.peerDependencies?.[name]
        )
          violations.push({ file, path: [...ancestry, name], reason: 'Unresolved lock dependency' });
        continue;
      }
      const chain = [...ancestry, name];
      if (forbidden(name)) {
        const boundary = coreNames.has(ancestry.at(-1)) && ['express', '@types/express'].includes(name);
        (((contained || boundary) && companionDependency(name, packages[target]?.version)) ||
        angularBuildPath(file, ancestry, name)
          ? allowed
          : violations
        ).push({
          file,
          path: chain,
          target,
          version: packages[target]?.version,
          reason: angularBuildPath(file, ancestry, name)
            ? 'User-approved unchanged Angular build/test tooling dependency; absent from server production and packed/image graphs'
            : contained || boundary
              ? 'Contained Companion dependency path'
              : 'Uncontained locked Express dependency',
        });
      }
      // A lock may contain cycles; retain the edge proof without recursing it.
      if (!ancestry.includes(name)) visit(target, chain);
    }
  }
  for (const [key, pkg] of owned) {
    const name = pkg.name ?? (!key ? lock.name : key.split('/').at(-1));
    const result = manifestProblems(file + ':' + key, { ...pkg, name });
    violations.push(...result.violations);
    allowed.push(...result.allowed);
    visit(key, [name]);
  }
  for (const [key, pkg] of Object.entries(packages)) {
    const name = key.split('node_modules/').at(-1);
    if (key.includes('node_modules/') && forbidden(name) && !reachable.has(key))
      violations.push({ file, path: key, version: pkg.version, reason: 'Orphaned Express lock record' });
  }
  return { violations, allowed };
}
function auditTree(root, { installed = false, generated = false } = {}) {
  root = path.resolve(root);
  const violations = [],
    allowed = [],
    files = [],
    diagnostics = [];
  const push = result => {
    violations.push(...result.violations);
    allowed.push(...result.allowed);
  };
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        [
          'node_modules',
          '.git',
          '.tmp',
          '.dev',
          'coverage',
          'support',
          'specs',
          'wiki',
          'docs',
          'skills',
          'playwright-report',
          'test-results',
        ].includes(item.name)
      )
        continue;
      if (!generated && ['dist', 'types', 'build'].includes(item.name)) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (
        item.isFile() &&
        /(?:\.[cm]?[jt]sx?(?:\.fixture)?|\.(?:hbs|ejs|html)|\.ya?ml|\.sh|(?:^|\/)Dockerfile[^/]*|package(?:-lock)?\.json|tsconfig[^/]*\.json)$/.test(
          file
        )
      )
        files.push(file);
    }
  }
  walk(root);
  if (fs.existsSync(path.join(root, '.circleci'))) walk(path.join(root, '.circleci'));
  // Support tooling is executable too; only evidence/specs/docs remain historical.
  if (fs.existsSync(path.join(root, 'support'))) walk(path.join(root, 'support'));
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('/package.json')) push(manifestProblems(relative, JSON.parse(text)));
    else if (file.endsWith('/package-lock.json')) {
      push(lockProblems(JSON.parse(text), relative));
    } else if (/\btsconfig[^/]*\.json$/.test(file)) {
      push(configProblems(relative, text));
    } else if (/\.(?:sh|ya?ml)$|(?:^|\/)Dockerfile[^/]*$/.test(relative)) {
      if (
        /app\.express\.cjs|\b(?:HTTP_HOST|HTTP_TEST_HOST|RBPORTAL_(?:HTTP|PLAYWRIGHT)_HOST|ExpressHost|createPortalHost|createPortalApplication)\b|legacy-express/.test(
          text
        )
      )
        violations.push({ file: relative, reason: 'Retired executable/configuration host reference' });
    } else push(scanSource(relative, text));
  }
  if (installed) {
    for (const omitDev of [false, true]) {
      let json;
      try {
        json = execFileSync('npm', ['ls', '--all', '--json', ...(omitDev ? ['--omit=dev'] : [])], {
          cwd: root,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        json = String(error.stdout ?? '');
        if (!json.trim().startsWith('{')) throw error;
      }
      const tree = JSON.parse(json),
        label = 'npm ls ' + (omitDev ? '--omit=dev ' : '') + '(' + root + ')';
      // Preserve unrelated npm diagnostics. Express invalid/missing/extraneous
      // paths still fail graphProblems, while this focused audit does not become
      // an unrelated dependency-upgrade gate.
      if (tree.error || (tree.problems ?? []).length)
        diagnostics.push({ file: label, problems: tree.problems, error: tree.error });
      push(graphProblems(tree, label));
      const graphFile = process.env.FM043_NPM_LS_OUTPUT;
      if (graphFile) fs.writeFileSync(graphFile + (omitDev ? '-production' : '-all') + '.json', json);
    }
  }
  return { files: files.length, violations, allowed, diagnostics };
}
function auditTarball(file) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm043-tar-'));
  try {
    const names = execFileSync('tar', ['-tzf', path.resolve(file)], { encoding: 'utf8', timeout: 30000 })
      .trim()
      .split('\n');
    if (names.some(name => !name.startsWith('package/') || name.split('/').includes('..')))
      throw new Error('Unsafe package entry');
    const kinds = execFileSync('tar', ['-tvzf', path.resolve(file)], { encoding: 'utf8', timeout: 30000 })
      .trim()
      .split('\n');
    if (kinds.some(line => !['-', 'd'].includes(line[0]))) throw new Error('Package contains link or special entry');
    execFileSync('tar', ['-xzf', path.resolve(file), '--no-same-owner', '-C', directory], { timeout: 30000 });
    const result = auditTree(path.join(directory, 'package'), { generated: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package/package.json'), 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
      for (const name of Object.keys(manifest[section] ?? {}))
        if (browserBuildOnly.has(name))
          result.violations.push({
            file,
            section,
            name,
            reason: 'Angular build-only tooling in a server tarball manifest',
          });
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function auditPackages(root) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm043-pack-'));
  const result = { tarballs: [], violations: [], allowed: [] };
  try {
    for (const entry of fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
      const cwd = path.join(root, 'packages', entry.name);
      if (!entry.isDirectory() || !fs.existsSync(path.join(cwd, 'package.json'))) continue;
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      // This gate qualifies emitted packages, so an unbuilt source directory
      // cannot produce an empty passing tarball.
      for (const target of [pkg.main, pkg.types].filter(Boolean))
        if (!fs.existsSync(path.resolve(cwd, target))) throw new Error('Build package before auditing: ' + pkg.name);
      const [packed] = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--offline', '--ignore-scripts', '--pack-destination', directory], {
          cwd,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
      const audit = auditTarball(path.join(directory, packed.filename));
      result.tarballs.push({ name: pkg.name, integrity: packed.integrity, files: audit.files });
      result.violations.push(...audit.violations);
      result.allowed.push(...audit.allowed);
    }
    if (!result.tarballs.length) throw new Error('No built packages to audit');
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
/** Inventory the physical runtime filesystem independently of npm's logical
 * graph. This deliberately traverses standalone/nested installs, including
 * Angular build trees that are invisible to the application's npm ls.
 */
function auditRuntimeFilesystem(root, applicationRoot = process.cwd()) {
  root = fs.realpathSync(root);
  applicationRoot = fs.realpathSync(applicationRoot);
  const packages = [],
    sources = [],
    violations = [],
    allowed = [],
    visited = new Set();
  const moduleDirectory = directory => /\/node_modules\/(?:@[^/]+\/)?[^/]+$/.test(directory);
  function nodeSource(file) {
    if (/\.(?:[cm]?[jt]sx?|ejs|html)$/.test(file)) return true;
    if (path.extname(file)) return false;
    const descriptor = fs.openSync(file, 'r');
    try {
      const header = Buffer.alloc(128);
      const bytes = fs.readSync(descriptor, header, 0, header.length, 0);
      return /^#![^\r\n]*\bnode(?:\s|$)/.test(header.toString('utf8', 0, bytes));
    } finally {
      fs.closeSync(descriptor);
    }
  }
  function walk(directory, owner) {
    const lexical = directory;
    const isModule = moduleDirectory(lexical);
    directory = fs.realpathSync(directory);
    // Classify package links before deduplicating physical traversal: a symlink
    // named node_modules/express may target an otherwise ordinary directory.
    const manifest = path.join(directory, 'package.json');
    if ((isModule || directory === path.join(applicationRoot, 'packages/redbox-core')) && fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const core =
        coreNames.has(pkg.name) &&
        (directory === path.join(applicationRoot, 'packages/redbox-core') ||
          lexical === path.join(applicationRoot, 'node_modules', pkg.name));
      owner = packages.find(item => item.directory === directory);
      if (!owner) {
        owner = { directory, name: pkg.name, version: pkg.version, pkg, core };
        packages.push(owner);
      }
    }
    if (isModule) {
      const name = lexical.slice(lexical.lastIndexOf('/node_modules/') + 14);
      if (browserBuildOnly.has(name))
        violations.push({ file: directory, name, reason: 'Angular build-only package physically present in runtime' });
      if (forbidden(name) && (!owner || owner.directory !== directory || owner.name !== name))
        violations.push({ file: directory, name, reason: 'Unmanifested Express runtime package' });
    }
    if (visited.has(directory)) return;
    visited.add(directory);
    // Kernel pseudo filesystems are not image contents. No build/cache/source
    // directory or node_modules tree is excluded.
    if (root === '/' && ['/proc', '/sys', '/dev'].includes(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file, owner);
      else if (entry.isSymbolicLink()) {
        // Workspace and nested package links are part of the actual install.
        // Broken links are not executable source and cannot hide an installed tree.
        let target;
        try {
          target = fs.statSync(file);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        if (target.isDirectory()) walk(file, owner);
        else if (target.isFile() && nodeSource(file)) sources.push({ file, owner });
      } else if (entry.isFile() && nodeSource(file)) sources.push({ file, owner });
    }
  }
  walk(root);
  const byDirectory = new Map(packages.map(pkg => [pkg.directory, pkg]));
  function resolvePackage(from, name) {
    for (let directory = from; ; directory = path.dirname(directory)) {
      const candidate = path.join(directory, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return byDirectory.get(fs.realpathSync(candidate));
      if (directory === path.dirname(directory)) return;
    }
  }
  const contained = new Set(),
    pending = [];
  for (const core of packages.filter(pkg => pkg.core)) {
    const provider = resolvePackage(core.directory, '@uppy/companion');
    if (provider?.version !== '7.1.1') continue;
    for (const name of ['@uppy/companion', 'express', '@types/express']) {
      const dependency = resolvePackage(core.directory, name);
      if (dependency && (name !== '@uppy/companion' || dependency.version === '7.1.1')) pending.push(dependency);
    }
  }
  while (pending.length) {
    const pkg = pending.pop();
    if (contained.has(pkg.directory)) continue;
    contained.add(pkg.directory);
    for (const name of Object.keys({
      ...pkg.pkg.dependencies,
      ...pkg.pkg.optionalDependencies,
      ...pkg.pkg.peerDependencies,
    })) {
      const dependency = resolvePackage(pkg.directory, name);
      if (dependency) pending.push(dependency);
    }
  }
  for (const pkg of packages) {
    if (browserBuildOnly.has(pkg.name) && !violations.some(v => v.file === pkg.directory))
      violations.push({
        file: pkg.directory,
        name: pkg.name,
        reason: 'Angular build-only package physically present in runtime',
      });
    if (forbidden(pkg.name))
      (contained.has(pkg.directory) && companionDependency(pkg.name, pkg.version) ? allowed : violations).push({
        file: pkg.directory,
        name: pkg.name,
        version: pkg.version,
        reason: contained.has(pkg.directory)
          ? 'Physical Companion dependency closure'
          : 'Uncontained physical Express package',
      });
  }
  const requireSites = [];
  const owners = [...packages].sort((left, right) => right.directory.length - left.directory.length);
  for (const { file } of sources) {
    const owner = owners.find(pkg => file.startsWith(pkg.directory + path.sep));
    const source = fs.readFileSync(file, 'utf8');
    // Parse every source: a text prefilter misses aliases and constructed
    // specifiers such as require('ex' + 'press').

    const relative = path.relative(applicationRoot, file).replaceAll('\\', '/');
    const references = scanSource(relative, source);
    for (const reference of [...references.violations, ...references.allowed]) {
      const match = /^Retired dependency reference: (.*)$/.exec(reference.reason);
      if (!match && !reference.dependency) {
        if (owner?.core || (file.startsWith(applicationRoot + path.sep) && !file.includes('/node_modules/')))
          violations.push(reference);
        continue;
      }
      const specifier = match?.[1] ?? reference.dependency;
      const name = specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');
      // Declaration imports use TypeScript's @types fallback. This is not a
      // runtime require fallback: an absent JavaScript dependency stays absent.
      const typesName = '@types/' + name.replace(/^@/, '').replace('/', '__');
      const target =
        owner &&
        ((file.endsWith('.d.ts') && !name.startsWith('@types/') && resolvePackage(owner.directory, typesName)) ||
          resolvePackage(owner.directory, name));
      const boundaryPath = owner?.core && path.relative(owner.directory, file).replaceAll('\\', '/');
      const boundary = owner?.core && name === 'express' && companionFile(boundaryPath);
      const vendor =
        owner &&
        !owner.core &&
        contained.has(owner.directory) &&
        target &&
        contained.has(target.directory) &&
        companionDependency(target.name, target.version);
      const site = { file, line: reference.line, dependency: name, owner: owner?.name, target: target?.directory };
      requireSites.push(site);
      (boundary || vendor ? allowed : violations).push({
        ...site,
        reason:
          boundary || vendor
            ? 'Contained physical Companion require/type site'
            : 'Uncontained runtime Express require/type site',
      });
    }
  }
  return {
    root,
    applicationRoot,
    packages: packages.map(({ directory, name, version }) => ({ directory, name, version })),
    sourceFiles: sources.length,
    requireSites,
    violations,
    allowed,
  };
}
module.exports = {
  scanSource,
  configProblems,
  manifestProblems,
  graphProblems,
  lockProblems,
  auditTree,
  auditTarball,
  auditPackages,
  auditRuntimeFilesystem,
};
if (require.main === module) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--tree');
  const tar = args.indexOf('--tarball');
  const root = index >= 0 ? args[index + 1] : process.cwd();
  const result = args.includes('--runtime-filesystem')
    ? auditRuntimeFilesystem(root)
    : tar >= 0
      ? auditTarball(args[tar + 1])
      : args.includes('--pack')
        ? auditPackages(root)
        : auditTree(root, {
            installed: args.includes('--installed'),
            generated: args.includes('--generated'),
          });
  console.log(JSON.stringify(result, null, 2));
  if (result.violations.length) process.exitCode = 1;
}
