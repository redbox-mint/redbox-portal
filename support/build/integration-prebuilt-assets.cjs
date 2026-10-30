#!/usr/bin/env node
// Uses the root's exact-pinned production TypeScript dependency, also retained
// in the final test image. No Angular workspace or compiler execution needed.
// See integration-prebuilt-assets.md for the producer/consumer contract.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const MANIFEST = '.redbox-ci/integration-assets.json';
const IMAGE_IDENTITY = '.redbox-ci/integration-image.json';
const ASSET_ROOTS = ['assets', '.tmp/public'];
const REQUIRED_APPS = [
  'local-auth', 'record-search', 'manage-users', 'manage-roles', 'admin-vocabulary',
  'app-config', 'branding', 'translation', 'deleted-records', 'harvest-runs',
];
const REQUIRED_WEBPACK = [
  'default/default/js/index.bundle.js', 'default/default/js/bootstrap.bundle.min.js',
  'default/default/js/jquery.min.js', 'default/default/js/redoc.standalone.js',
  'default/default/styles/style.min.css',
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function revision(value) {
  check(typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value),
    'A full lowercase Git revision is required (RBPORTAL_EXPECTED_IMAGE_REVISION at startup)');
  return value;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Reject links even on parent directories: manifests must describe files inside
// this image, rather than following a link to an unverified tree.
function localPath(root, relative) {
  check(typeof relative === 'string' && relative !== '' && !relative.includes('\\') &&
    !path.isAbsolute(relative) && relative.split('/').every(part => part && part !== '.' && part !== '..'),
  `Invalid asset path: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    check(!fs.lstatSync(current).isSymbolicLink(), `Symlink is not an immutable asset: ${relative}`);
  }
  return current;
}

function inventory(root) {
  const files = [];
  function visit(relative) {
    const filename = localPath(root, relative);
    const stat = fs.statSync(filename);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(`${relative}/${name}`);
    } else {
      check(stat.isFile(), `Not a regular asset: ${relative}`);
      files.push({ path: relative, size: stat.size, sha256: sha256(fs.readFileSync(filename)) });
    }
  }
  for (const directory of ASSET_ROOTS) visit(directory);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function htmlValue(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1),
      entity[1].toLowerCase() === 'x' ? 16 : 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
  });
}

// Angular indexes describe a deployable directory, even with the default base
// href="/". Relative build outputs live beside that index; base href is a URL
// deployment prefix, never a filesystem directory. Absolute URLs under that
// prefix can refer to the app directory or to the corresponding public tree.
function dependencyPath(reference, importer, prefix, base, assetRoot) {
  const value = reference.trim();
  if (!value || value.startsWith('#') || /^(?:https?:|data:|\/\/)/i.test(value)) return null;
  check(!/^[a-z][a-z\d+.-]*:/i.test(value), `Unsupported asset URL: ${reference}`);
  const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  check(!/[\\\x00-\x1f\x7f?#]/.test(pathname) && !/%[0-9a-f]{2}/i.test(pathname) &&
    !pathname.split('/').some(part => part === '..'), `Unsafe asset URL: ${reference}`);
  if (!pathname) return null;
  if (!pathname.startsWith('/')) return path.posix.join(path.posix.dirname(importer), pathname);
  check(pathname.startsWith(base), `Asset URL is outside base href ${base}: ${reference}`);
  const relative = pathname.slice(base.length);
  return relative.includes('/') ? `${assetRoot}/${relative}` : `${prefix}${relative}`;
}

function moduleReferences(source, filename) {
  // A real parser supplies lexical context for regex versus division, walks
  // template substitutions, and decodes JS escapes before URL validation.
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  check(tree.parseDiagnostics.length === 0, `Cannot parse JavaScript asset: ${filename}: ${
    tree.parseDiagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ')}`);
  const references = [];
  function literal(node) {
    if (node && ts.isStringLiteralLike(node)) references.push(node.text);
  }
  function isModuleURL(node) {
    return ts.isPropertyAccessExpression(node) && node.name.text === 'url' &&
      ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
      node.expression.name.text === 'meta';
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      literal(node.arguments[0]);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' &&
      node.arguments?.length >= 2 && isModuleURL(node.arguments[1])) literal(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return references;
}

function checkAngularDependencies(root, prefix, required, entries) {
  const index = `${prefix}index.html`;
  const html = fs.readFileSync(localPath(root, index), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...html.matchAll(/<(base|script|link|img)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map(match => {
    const attributes = new Map([...match[2].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map(attribute => [attribute[1].toLowerCase(), htmlValue(attribute[2] ?? attribute[3] ?? attribute[4])]));
    return { name: match[1].toLowerCase(), attributes };
  });
  const bases = tags.filter(tag => tag.name === 'base');
  check(bases.length <= 1, `Multiple Angular base URLs: ${index}`);
  const base = bases[0]?.attributes.get('href') ?? '/';
  check(base.startsWith('/') && !base.startsWith('//') && base.endsWith('/') &&
    !/[\\%?#\s]/.test(base) && !base.split('/').some(part => part === '.' || part === '..'),
  `Unsupported Angular base href: ${base}`);
  const assetRoot = prefix.startsWith('assets/') ? 'assets' : '.tmp/public';
  const visited = new Set();
  function follow(reference, importer) {
    const filename = dependencyPath(reference, importer, prefix, base, assetRoot);
    if (filename === null) return;
    // Angular legitimately emits an empty stylesheet for apps with no global
    // styles. It must still exist in the inventory and be checksummed.
    if (filename.endsWith('.css') && entries.has(filename)) {
      check(entries.get(filename).size >= 0, `Invalid stylesheet inventory: ${filename}`);
    } else required(filename);
    if (visited.has(filename)) return;
    visited.add(filename);
    if (!/\.(?:m?js|css)$/.test(filename)) return;
    const source = fs.readFileSync(localPath(root, filename), 'utf8');
    if (filename.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s+["']([^"']+)["']/gi)) {
        follow(match[1] ?? match[2] ?? match[3] ?? match[4], filename);
      }
    } else {
      for (const reference of moduleReferences(source, filename)) follow(reference, filename);
    }
  }
  for (const tag of tags.filter(tag => tag.name !== 'base')) {
    const reference = tag.attributes.get(tag.name === 'link' ? 'href' : 'src');
    if (reference !== undefined) follow(reference, index);
  }
  check([...visited].some(filename => filename.startsWith(prefix) && /^main[^/]*\.js$/.test(filename.slice(prefix.length))),
    `Angular index does not reference a local main bundle: ${index}`);
}

function checkPayload(root, files, applications) {
  check(Array.isArray(applications) && applications.length > 0 &&
    new Set(applications).size === applications.length &&
    applications.every(app => typeof app === 'string' && /^[a-z0-9-]+$/.test(app)),
  'Invalid Angular application inventory');
  for (const app of REQUIRED_APPS) check(applications.includes(app), `Missing required Angular application: ${app}`);
  check(Array.isArray(files), 'Missing file inventory');
  const entries = new Map(files.map(file => [file.path, file]));
  check(entries.size === files.length, 'Duplicate asset paths');
  function required(filename) {
    check(entries.get(filename)?.size > 0, `Missing or empty prepared asset: ${filename}`);
  }
  for (const filename of REQUIRED_WEBPACK) required(`.tmp/public/${filename}`);
  for (const app of applications) {
    for (const directory of ['assets/angular', '.tmp/public/angular']) {
      const prefix = `${directory}/${app}/browser/`;
      required(`${prefix}index.html`);
      check(files.some(file => file.path.startsWith(prefix) &&
        /^main[^/]*\.js$/.test(file.path.slice(prefix.length)) && file.size > 0),
      `Missing Angular main bundle: ${prefix}`);
      checkAngularDependencies(root, prefix, required, entries);
    }
  }
  check(files.some(file => file.path.startsWith('.tmp/public/') &&
    /\.(woff2?|ttf|eot|otf)$/.test(file.path) && file.size > 0), 'Missing served font assets');
}

function generate(root, sourceRevision) {
  revision(sourceRevision);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'), 'utf8'));
  const applications = Object.entries(config.projects).filter(([, project]) => {
    const build = project.architect?.build || project.targets?.build;
    return build?.builder?.endsWith(':application');
  }).map(([name]) => name.replace(/^@researchdatabox\//, '')).sort();
  const files = inventory(root);
  checkPayload(root, files, applications);
  const manifest = { schemaVersion: 1, revision: sourceRevision, mode: 'production', applications, files };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.mkdirSync(path.join(root, '.redbox-ci'), { recursive: true });
  // This directory is produced inside the trusted image build, never at startup.
  check(!fs.lstatSync(path.join(root, '.redbox-ci')).isSymbolicLink(), 'Metadata directory must not be a symlink');
  for (const filename of [MANIFEST, IMAGE_IDENTITY]) {
    check(!fs.existsSync(path.join(root, filename)) || !fs.lstatSync(path.join(root, filename)).isSymbolicLink(),
      `Metadata must not be a symlink: ${filename}`);
  }
  fs.writeFileSync(path.join(root, MANIFEST), bytes);
  fs.writeFileSync(path.join(root, IMAGE_IDENTITY), `${JSON.stringify({
    schemaVersion: 1, revision: sourceRevision, manifestSha256: sha256(bytes),
  }, null, 2)}\n`);
  return manifest;
}

function verify(root, expectedRevision) {
  revision(expectedRevision);
  const identity = JSON.parse(fs.readFileSync(localPath(root, IMAGE_IDENTITY), 'utf8'));
  check(identity.schemaVersion === 1 && identity.revision === expectedRevision, 'Image revision does not match expected revision');
  const bytes = fs.readFileSync(localPath(root, MANIFEST));
  check(identity.manifestSha256 === sha256(bytes), 'Asset manifest checksum mismatch');
  const manifest = JSON.parse(bytes);
  check(manifest.schemaVersion === 1 && manifest.mode === 'production' && manifest.revision === expectedRevision,
    'Asset manifest schema, mode or revision mismatch');
  const actual = inventory(root);
  check(JSON.stringify(actual) === JSON.stringify(manifest.files),
    'Prepared asset inventory/checksum mismatch (missing, changed or unexpected files)');
  checkPayload(root, manifest.files, manifest.applications);
  return manifest;
}

function contains(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}

function mountedSources(root, mountInfo) {
  // Read-only bind mounts and .git files (worktrees) count too.
  if (fs.existsSync(path.join(root, '.git'))) return true;
  const harmless = ['test', 'coverage', '.tmp/junit', '.tmp/attachments', 'bootstrap-data']
    .map(relative => path.join(root, relative));
  const lines = mountInfo.trim().split('\n');
  check(mountInfo.trim() !== '', 'Cannot determine mounts from empty mountinfo');
  for (const line of lines) {
    const fields = line.split(' ');
    check(fields.length >= 10 && fields.includes('-') && fields[4].startsWith('/'), 'Invalid Linux mountinfo');
    const mount = fields[4].replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    if (mount === '/') continue; // The container's overlay root is expected.
    if (contains(mount, root)) return true;
    if (contains(root, mount) && !harmless.some(directory => contains(directory, mount))) return true;
  }
  return false;
}

function startupMode(root, env = process.env, mountInfo) {
  const optIn = env.RBPORTAL_REUSE_PREBUILT_ASSETS || 'false';
  check(['true', 'false'].includes(optIn), 'RBPORTAL_REUSE_PREBUILT_ASSETS must be true or false');
  let mounted;
  try {
    mounted = mountedSources(root, mountInfo === undefined ? fs.readFileSync('/proc/self/mountinfo', 'utf8') : mountInfo);
  } catch (error) {
    // Normal development must still work without Linux procfs. An unknown mount
    // state cannot authorize prepared-asset reuse in CI.
    if (optIn === 'true') throw error;
    mounted = true;
  }
  if (mounted) {
    console.error('Source/asset mounts detected; rebuilding assets even if CI reuse was requested.');
    return 'mounted';
  }
  if (optIn !== 'true') return 'build';
  check(env.CI === 'true', 'Prepared assets require CI=true and an explicit immutable-image opt-in');
  verify(root, env.RBPORTAL_EXPECTED_IMAGE_REVISION);
  console.error('Verified immutable image revision and complete prepared asset checksums.');
  return 'reuse';
}

function main(args) {
  const [command, value, directory] = args;
  if (command === 'generate' || command === 'verify') {
    check(args.length >= 2 && args.length <= 3, `Usage: ${command} FULL_GIT_REVISION [ROOT]`);
    const root = path.resolve(directory || process.cwd());
    const manifest = command === 'generate' ? generate(root, value) : verify(root, value);
    console.log(`${command}: ${manifest.files.length} assets for ${manifest.revision}`);
  } else {
    check(command === 'startup' && args.length <= 2, 'Usage: integration-prebuilt-assets.cjs generate|verify REVISION [ROOT], or startup [ROOT]');
    console.log(startupMode(path.resolve(value || process.cwd())));
  }
}

module.exports = { generate, verify, startupMode, mountedSources, MANIFEST, IMAGE_IDENTITY, REQUIRED_APPS, REQUIRED_WEBPACK };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(`Prepared integration assets rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
