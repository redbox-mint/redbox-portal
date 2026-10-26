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
  type Target = string | null | undefined | typeof invalidTarget | typeof invalidConfig;
  // The host resolves extensions for native import, even when their code is CJS.
  // Conditional keys are ordered: a selected null must mask later alternatives.
  const selectTarget = (value: unknown): Target => {
    if (typeof value === 'string') {
      if (!value.startsWith('./')) return invalidTarget;
      try {
        if (value.slice(2).split(/[\\/]/).some(part => {
          try { return /^(?:\.{1,2}|node_modules)$/i.test(decodeURIComponent(part)); }
          // Malformed URI escapes fail after selection, without array fallback.
          catch { return false; }
        })) return invalidTarget;
        return new URL(value, 'file:///redbox-hook/package.json').pathname.startsWith('/redbox-hook/')
          ? value : invalidTarget;
      } catch { return invalidTarget; }
    }
    if (Array.isArray(value)) {
      if (!value.length) return null;
      let last: Target;
      for (const target of value) {
        const selected = selectTarget(target);
        if (selected === undefined) continue;
        if (selected === null || selected === invalidTarget) {last = selected; continue;}
        return selected;
      }
      return last;
    }
    if (value === null) return null;
    if (typeof value !== 'object') return invalidTarget;
    if (Object.keys(value).some(key => String(Number(key)) === key && Number(key) >= 0 && Number(key) < 0xFFFFFFFF))
      return invalidConfig;
    for (const [condition, target] of Object.entries(value)) {
      // Default import conditions of the supported Node 26 deployment.
      if (['node', 'import', 'module-sync', 'node-addons', 'default'].includes(condition)) {
        const selected = selectTarget(target);
        if (selected !== undefined) return selected;
      }
    }
    return undefined;
  };
  if (entry.endsWith('/')) return false;
  let target = exports;
  let patternMatch: string | undefined;
  if (exports && typeof exports === 'object' && !Array.isArray(exports) &&
      Object.keys(exports).some(key => key.startsWith('.'))) {
    if (Object.keys(exports).some(key => !key.startsWith('.'))) return false;
    const entries = Object.entries(exports);
    const exact = entries.find(([key]) => key === entry);
    if (exact) target = exact[1];
    else {
      const patterns = entries.filter(([key]) => {
        const star = key.indexOf('*');
        return star >= 0 && key.lastIndexOf('*') === star && entry.length >= key.length &&
          entry.startsWith(key.slice(0, star)) && entry.endsWith(key.slice(star + 1));
      }).sort(([a], [b]) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
      if (!patterns.length) return false;
      const [key, value] = patterns[0];
      patternMatch = entry.slice(key.indexOf('*'), entry.length - key.slice(key.indexOf('*') + 1).length);
      target = value;
    }
  } else if (entry !== '.') return false;
  const selected = selectTarget(target);
  if (typeof selected !== 'string') return false;
  const resolved = patternMatch === undefined ? selected : selected.replace(/\*/g, () => patternMatch!);
  // Encoded separators fail after target selection in Node, so an array cannot
  // use them to fall through to a later target. Query/hash do not change its type.
  if (/%2f|%5c/i.test(resolved)) return false;
  try {
    return !/\.d\.[cm]?ts$/.test(decodeURIComponent(new URL(resolved, 'file:///redbox-hook/package.json').pathname));
  } catch { return false; }
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
