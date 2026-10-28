import { offsetAt } from './diagnostic-fix';
import { readTemplatePath } from './template-path';

/** Read a path/expression from the browser's own buffer only. Never send it in a
 * diagnostic, telemetry or draft metadata. Invalid/ambiguous positions return null.
 */
export function diagnosticExpressionAt(source: string, line: number, column: number): string | null {
  if (!Number.isInteger(line) || !Number.isInteger(column)) return null;
  const offset = offsetAt(source, line, column);
  if (offset < 0) return null;
  let cursor = 0;
  while ((cursor = source.indexOf('{{', cursor)) >= 0) {
    const open = cursor;
    if (source[open - 1] === '\\' && source[open - 2] !== '\\') {
      cursor += 2;
      continue;
    }
    if (source.startsWith('{{!--', open)) {
      const end = source.indexOf('--}}', open + 6);
      if (end < 0) return null;
      cursor = end + 4;
      continue;
    }
    const triple = source.startsWith('{{{', open);
    const start = open + (triple ? 3 : 2);
    const delimiter = triple ? '}}}' : '}}';
    let end = start;
    let quote = '';
    let bracket = false;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) {
        if (char === '\\') end++;
        else if (char === quote) quote = '';
      } else if (bracket) {
        if (char === ']') bracket = false;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '[') bracket = true;
      else if (source.startsWith(delimiter, end)) break;
      else if (source.startsWith('{{', end)) return null;
    }
    if (end === source.length) return null;
    cursor = end + delimiter.length;
    if (offset < open || offset >= cursor) continue;
    const expression = source
      .slice(start, end)
      .replace(/^~?\s*[#^/&]?\s*/, '')
      .replace(/\s*~?$/, '');
    if (!expression || /^[!>]/.test(expression)) return null;
    // Runtime lookups usually point at the start of the path, including helper arguments.
    const path = offset >= start && offset < end ? readTemplatePath(source.slice(offset, end)) : null;
    return path || expression;
  }
  return null;
}
