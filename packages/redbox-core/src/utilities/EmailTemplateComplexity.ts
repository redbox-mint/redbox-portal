import { normaliseVisual } from '@researchdatabox/sails-ng-common';

export interface EmailTemplateComplexityLimits {
  maxNesting: number;
  maxExpressions: number;
}

export const defaultEmailTemplateComplexityLimits: EmailTemplateComplexityLimits = {
  maxNesting: 64,
  maxExpressions: 1024,
};

/** Linear, pre-parser scan. Counts expression statements and subexpressions,
 * including the implicit blocks in chained `else if`. Comments, escaped
 * mustaches, string/segment literals and raw-block contents are not expressions.
 * Stops at the first exceeded bound; syntax validation belongs to Handlebars.
 * The result contains counts only, never source or parser diagnostics.
 */
export function scanEmailTemplateComplexity(
  source: string,
  limits = defaultEmailTemplateComplexityLimits
): { nesting: number; expressions: number; exceeded: boolean } {
  // Match the shared compiler, including compatibility delimiters and markers.
  source = normaliseVisual(source);
  let nesting = 0;
  let expressions = 0;
  let depth = 0;
  const blocks: number[] = [];
  const count = (level: number) => {
    expressions++;
    nesting = Math.max(nesting, level);
    return expressions > limits.maxExpressions || nesting > limits.maxNesting;
  };
  let exceeded = false;
  let cursor = 0;
  while ((cursor = source.indexOf('{{', cursor)) >= 0) {
    // Handlebars escapes one backslash; two trailing backslashes resume parsing.
    if (source[cursor - 1] === '\\' && source[cursor - 2] !== '\\') {
      cursor += 2;
      continue;
    }
    const raw = source.startsWith('{{{{', cursor);
    let index = cursor + (raw ? 4 : 2);
    if (source[index] === '~') index++;
    if (source.startsWith('!--', index)) {
      const end = /--~?}}/g;
      end.lastIndex = index + 3;
      if (!end.exec(source)) break;
      cursor = end.lastIndex;
      continue;
    }
    if (source[index] === '!') {
      const end = source.indexOf('}}', index + 1);
      if (end < 0) break;
      cursor = end + 2;
      continue;
    }
    while (/\s/.test(source[index] ?? '') && index < source.length) index++;
    const close = source[index] === '/';
    const elseHead = source.startsWith('else', index) && /[\s~}]/.test(source[index + 4] ?? '');
    let inverseEnd = index + (elseHead ? 4 : 1);
    while (/\s/.test(source[inverseEnd] ?? '') && inverseEnd < source.length) inverseEnd++;
    if (source[inverseEnd] === '~') inverseEnd++;
    const inverse = (elseHead || source[index] === '^') && source.startsWith('}}', inverseEnd);
    const chain = elseHead && !inverse;
    const block = raw || source[index] === '#' || (source[index] === '^' && !inverse);
    if (close) {
      depth = blocks.pop() ?? 0;
    } else if (!inverse) {
      if (block) {
        blocks.push(depth);
        depth++;
      } else if (chain) {
        // The explicit closing tag closes the entire inverse chain.
        depth++;
      }
      exceeded = count(depth);
      if (exceeded) break;
    }
    let subexpressions = 0;
    let quote = '';
    let bracket = false;
    const delimiter = raw ? '}}}}' : '}}';
    for (; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (char === '\\' && source[index + 1] === quote) index++;
        else if (char === quote) quote = '';
      } else if (bracket) {
        if (char === '\\' && source[index + 1] === ']') index++;
        else if (char === ']') bracket = false;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '[') {
        bracket = true;
      } else if (source.startsWith(delimiter, index)) {
        break;
      } else if (char === '(') {
        exceeded = count(depth + ++subexpressions);
        if (exceeded) break;
      } else if (char === ')') {
        subexpressions = Math.max(0, subexpressions - 1);
      }
    }
    if (exceeded) break;
    cursor = index + delimiter.length;
    if (raw && !close) {
      // Handlebars 4.x raw lexer rules 3/4: only a complete, unspaced ID
      // closing token pops raw mode. Invalid slash tokens are ordinary content.
      // A non-slash opener pushes raw mode even without a complete opening tag.
      const rawClose = /\{\{\{\{\/[^\s!"#%-,./;->@[-^`{-~]+\}\}\}\}/y;
      let rawDepth = 1;
      while (rawDepth && (cursor = source.indexOf('{{{{', cursor)) >= 0) {
        rawClose.lastIndex = cursor;
        if (rawClose.test(source)) {
          rawDepth--;
          cursor = rawClose.lastIndex;
        } else {
          if (source[cursor + 4] !== '/' && cursor + 4 < source.length) rawDepth++;
          cursor += 4;
        }
      }
      depth = blocks.pop() ?? 0;
      if (rawDepth) break;
    }
  }
  return { nesting, expressions, exceeded };
}
