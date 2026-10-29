import { safeSchemaKey } from './schema-utils';

/** Handlebars segment literals have no escape for a closing bracket. */
export function templateSegment(key: string): string | null {
  if (!safeSchemaKey(key) || !key || /[\]\r\n\x00-\x1f]/.test(key)) return null;
  return /^[A-Za-z_$][\w$-]*$/.test(key) && !['this', 'true', 'false', 'null', 'undefined'].includes(key)
    ? key
    : `[${key}]`;
}

export interface PathSegment {
  name: string;
  start: number;
  end: number;
}

/** Keeps literal dots inside brackets and ignores parent/array presentation markers. */
export function pathSegments(path: string): PathSegment[] {
  const result: PathSegment[] = [];
  const pattern = /\.\.\/|\[([^\]]*)\]|([^.[\]/]+)/g;
  for (let match = pattern.exec(path); match; match = pattern.exec(path)) {
    if (match[0] === '../' || match[0] === '[]') continue;
    result.push({ name: match[1] ?? match[2], start: match.index, end: pattern.lastIndex });
  }
  return result;
}

export function pathParent(path: string): string {
  const last = pathSegments(path).pop();
  return last && last.start > 0 ? path.slice(0, last.start - 1) : '';
}

const SEGMENT = '(?:@?[A-Za-z_$][\\w$-]*|\\[[^\\]\\r\\n]+\\])';
const PATH = new RegExp(`^(?:(?:\\.\\.\\/)+|\\.\\/)?${SEGMENT}(?:[./]${SEGMENT})*`);

/** Token boundary for both complete paths and paths still being edited.
 * Literal segments keep spaces, dots and Unicode until their closing bracket.
 */
export function templatePathTokenEnd(source: string): number {
  let bracket = false;
  let end = 0;
  for (; end < source.length; end++) {
    const char = source[end];
    if (bracket) {
      if (/[\r\n\x00-\x1f]/.test(char) || source.startsWith('}}', end)) break;
      if (source.startsWith('{{', end)) return -1;
      if (char === '[') return -1; // Ambiguous unfinished/nested literal: do not replace.
      if (char === ']') bracket = false;
    } else if (char === '[') {
      // A complete segment may contain closing braces. Look for its own ]
      // before treating }} as a boundary of an unfinished segment. Never
      // consume a second opener, even if a later ] could close this literal.
      let close = end + 1;
      while (close < source.length && !/[\[\]\r\n\x00-\x1f]/.test(source[close]) && !source.startsWith('{{', close))
        close++;
      if (source[close] === ']') {
        end = close;
        continue;
      }
      bracket = true;
    } else if (char === ']') {
      return -1;
    } else if (!/[\w$@./:-]/.test(char)) break;
  }
  return end;
}

export function readTemplatePath(source: string): string | null {
  const end = templatePathTokenEnd(source);
  if (end < 0) return null;
  const token = source.slice(0, end);
  const path = PATH.exec(token)?.[0];
  // A diagnostic must describe the entire token. An unfinished literal cannot
  // safely identify an AST segment for a did-you-mean replacement.
  return path === token ? path : null;
}
