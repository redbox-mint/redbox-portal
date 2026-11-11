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
  // A failed bracket match must not rescan the remaining suffix at every '['.
  const lastClose = path.lastIndexOf(']');
  let index = 0;
  while (index < path.length) {
    if (path.startsWith('../', index)) {
      index += 3;
      continue;
    }
    const start = index;
    const char = path[index++];
    if (char === '[') {
      if (start < lastClose) {
        const close = path.indexOf(']', index);
        if (close > index) result.push({ name: path.slice(index, close), start, end: close + 1 });
        index = close + 1;
      }
    } else if (char !== '.' && char !== ']' && char !== '/') {
      while (index < path.length && !'.[]/'.includes(path[index])) index++;
      result.push({ name: path.slice(start, index), start, end: index });
    }
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
