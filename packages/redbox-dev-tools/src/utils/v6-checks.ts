import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

export function findRetiredFrameworkDependencies(pkg: Record<string, any>): string[] {
  const historicalNames = new Set([
    '@researchdatabox/sails-ng-common', '@researchdatabox/sails-hook-redbox-storage-mongo',
    '@researchdatabox/sails-hook-redbox-pdfgen',
  ]);
  const findings: string[] = [];
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
    for (const name of Object.keys(pkg[section] || {})) {
      const leaf = name.split('/').pop()!;
      if (name.startsWith('@sailshq/') || /^(?:sails|sails[.]io[.]js|skipper|waterline)$/.test(leaf) ||
          /^(?:skipper-|waterline-)/.test(leaf) || (leaf.startsWith('sails-') && !historicalNames.has(name)))
        findings.push(`${section}.${name}: retired framework package is unsupported in v6`);
    }
  return findings;
}

/** Check declarations without importing the hook or requiring a completed build. */
export function hasRuntimeExtensionExport(exports: unknown, entry: string): boolean {
  const runtimeTarget = (value: unknown): boolean => {
    if (typeof value === 'string')
      return value.startsWith('./') && !value.split('/').some(part => part === '..' || part === 'node_modules') &&
        !/\.d\.[cm]?ts$/.test(value);
    if (Array.isArray(value)) return value.some(runtimeTarget);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([condition, target]) =>
      ['node', 'node-addons', 'require', 'import', 'default'].includes(condition) && runtimeTarget(target));
  };
  if (exports && typeof exports === 'object' && !Array.isArray(exports) &&
      Object.keys(exports).some(key => key.startsWith('.'))) {
    const declared = Object.entries(exports).find(([key]) => key === entry);
    return declared !== undefined && runtimeTarget(declared[1]);
  }
  return entry === '.' && runtimeTarget(exports);
}

const retiredViewGlobals: Record<string, string> = {
  TranslationService: 'page.t(key, values)',
  BrandingService: 'page.root, page.base or page.brand',
  CacheService: 'page.bundleHash(app, prefix, before?, after?, evenEmpty?)',
  'sails': 'request-scoped page.config or other page locals',
};

/** Only server EJS code is inspected; prose, JS strings and EJS comments are inert. */
export function findRetiredViewApis(root: string): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  const visitDirectory = (directory: string): void => {
    const real = fs.realpathSync(directory);
    if (seen.has(real)) return;
    seen.add(real);
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const file = path.join(directory, entry.name);
      if (fs.statSync(file).isDirectory()) {visitDirectory(file); continue;}
      if (!file.endsWith('.ejs')) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const block of source.matchAll(/<%([_=#%\-]?)([\s\S]*?)[_\-]?%>/g)) {
        if (block[1] === '#' || block[1] === '%') continue;
        const code = block[2];
        const ast = ts.createSourceFile(file + '.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const report = (node: ts.Node, message: string): void => {
          const offset = block.index! + 2 + block[1].length + node.getStart(ast);
          const line = source.slice(0, offset).split('\n').length;
          findings.push(`${path.relative(root, file)}:${line}: ${message}`);
        };
        const visit = (node: ts.Node): void => {
          if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
              ts.isIdentifier(node.expression) && Object.hasOwn(retiredViewGlobals, node.expression.text))
            report(node, `${node.expression.text}: replace retired view global with ${retiredViewGlobals[node.expression.text]}`);
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'include' &&
              node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) &&
              /^(?:\.\.\/)+functions(?:\.ejs)?$/.test(node.arguments[0].text))
            report(node, 'include: remove the retired functions helper; the page host supplies superPartial');
          ts.forEachChild(node, visit);
        };
        visit(ast);
      }
    }
  };
  const views = path.join(root, 'views');
  if (fs.existsSync(views)) visitDirectory(views);
  return findings;
}
