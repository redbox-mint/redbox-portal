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
  const invalidTarget = Symbol('invalid target');
  const invalidConfig = Symbol('invalid configuration');
  type Target = string | null | typeof invalidTarget | typeof invalidConfig;
  // The host resolves extensions for native import, even when their code is CJS.
  // Conditional keys are ordered: a selected null must mask later alternatives.
  const selectTarget = (value: unknown): Target => {
    if (typeof value === 'string')
      return value.startsWith('./') && !value.split('/').some(part => part === '..' || part === 'node_modules')
        ? value : invalidTarget;
    if (Array.isArray(value)) {
      for (const target of value) {
        const selected = selectTarget(target);
        if (selected !== null && selected !== invalidTarget) return selected;
      }
      return null;
    }
    if (value === null) return null;
    if (typeof value !== 'object') return invalidTarget;
    if (Object.keys(value).some(key => /^(?:0|[1-9][0-9]*)$/.test(key))) return invalidConfig;
    for (const [condition, target] of Object.entries(value))
      if (['node', 'import', 'default'].includes(condition)) return selectTarget(target);
    return null;
  };
  let target = exports;
  if (exports && typeof exports === 'object' && !Array.isArray(exports) &&
      Object.keys(exports).some(key => key.startsWith('.'))) {
    if (Object.keys(exports).some(key => !key.startsWith('.'))) return false;
    target = Object.entries(exports).find(([key]) => key === entry)?.[1];
  } else if (entry !== '.') return false;
  const selected = selectTarget(target);
  return typeof selected === 'string' && !/\.d\.[cm]?ts$/.test(selected);
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
