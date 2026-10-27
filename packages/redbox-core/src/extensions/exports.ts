/** Public package export keys are not filenames; dots and other Node subpath characters are valid. */
export function isPublicExtensionEntry(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '.' ||
      (value.startsWith('./') &&
        value.length > 2 &&
        !value.includes('\\') && !value.includes('\u0000') &&
        !value
          .slice(2)
          .split('/')
          .some(part => part === '.' || part === '..')))
  );
}

/** Select a package export with the supported Node 26 import conditions. No hook code or filesystem access. */
export function resolveExtensionExport(exports: unknown, entry: string, packageJsonURL: string): string | undefined {
  const invalidTarget = Symbol('invalid target');
  const invalidConfig = Symbol('invalid configuration');
  const invalidSubpath = Symbol('invalid subpath');
  type Target = string | null | undefined | typeof invalidTarget | typeof invalidConfig | typeof invalidSubpath;
  let patternMatch: string | undefined;
  const hasInvalidSegment = (value: string): boolean =>
    value.split(/[\\/]/).some(part => {
      try {
        return /^(?:\.{1,2}|node_modules)$/i.test(decodeURIComponent(part));
      } catch {
        // Malformed escapes fail after selection, so they must not enable fallback.
        return false;
      }
    });
  // The host resolves extensions for native import, even when their code is CJS.
  // Conditional keys are ordered: a selected null must mask later alternatives.
  const selectTarget = (value: unknown): Target => {
    if (typeof value === 'string') {
      if (!value.startsWith('./')) return invalidTarget;
      try {
        if (hasInvalidSegment(value.slice(2))) return invalidTarget;
        const resolved = new URL(value, packageJsonURL);
        if (!resolved.pathname.startsWith(new URL('.', packageJsonURL).pathname)) return invalidTarget;
        // Node validates the captured subpath even when the target has no '*'.
        // This error is terminal, unlike an invalid target in an export array.
        if (patternMatch !== undefined && hasInvalidSegment(patternMatch)) return invalidSubpath;
        return patternMatch === undefined ? resolved.href : resolved.href.replace(/\*/g, () => patternMatch!);
      } catch {
        return invalidTarget;
      }
    }
    if (Array.isArray(value)) {
      if (!value.length) return null;
      let last: Target;
      for (const target of value) {
        const selected = selectTarget(target);
        if (selected === undefined) continue;
        if (selected === null || selected === invalidTarget) {
          last = selected;
          continue;
        }
        return selected;
      }
      return last;
    }
    if (value === null) return null;
    if (typeof value !== 'object') return invalidTarget;
    if (Object.keys(value).some(key => String(Number(key)) === key && Number(key) >= 0 && Number(key) < 0xffffffff))
      return invalidConfig;
    for (const [condition, target] of Object.entries(value)) {
      // Node 26's default import condition set, in the manifest's key order.
      if (['node', 'import', 'module-sync', 'node-addons', 'default'].includes(condition)) {
        const selected = selectTarget(target);
        if (selected !== undefined) return selected;
      }
    }
    return undefined;
  };
  let target = exports;
  if (
    exports &&
    typeof exports === 'object' &&
    !Array.isArray(exports) &&
    Object.keys(exports).some(key => key.startsWith('.'))
  ) {
    if (Object.keys(exports).some(key => !key.startsWith('.'))) return undefined;
    const entries = Object.entries(exports);
    const exact = entries.find(([key]) => key === entry && !entry.includes('*') && !entry.endsWith('/'));
    if (exact) target = exact[1];
    else {
      const patterns = entries
        .filter(([key]) => {
          const star = key.indexOf('*');
          return (
            star >= 0 &&
            key.lastIndexOf('*') === star &&
            entry.length >= key.length &&
            entry.startsWith(key.slice(0, star)) &&
            entry.endsWith(key.slice(star + 1))
          );
        })
        .sort(([a], [b]) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
      if (!patterns.length) return undefined;
      const [key, value] = patterns[0];
      patternMatch = entry.slice(key.indexOf('*'), entry.length - key.slice(key.indexOf('*') + 1).length);
      target = value;
    }
  } else if (entry !== '.') return undefined;
  const selected = selectTarget(target);
  if (typeof selected !== 'string') return undefined;
  // Encoded separators fail after target selection in Node, so an array cannot
  // use them to fall through to a later target. Query/hash do not change its type.
  try {
    const pathname = new URL(selected).pathname;
    if (/%2f|%5c/i.test(pathname)) return undefined;
    decodeURIComponent(pathname);
    return selected;
  } catch {
    return undefined;
  }
}
