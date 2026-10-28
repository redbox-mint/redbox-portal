import { handlebarsInstance } from '@researchdatabox/sails-ng-common';

/** Only these fixed names may leave the server. Never retain parser messages or text. */
export type EmailSyntaxHelper = 'each' | 'if' | 'unless' | 'with';
export interface EmailSyntaxDiagnostic {
  reason: 'UNCLOSED_BLOCK' | 'MISMATCHED_CLOSE' | 'UNEXPECTED_TOKEN';
  helper?: EmailSyntaxHelper;
  line: number;
  column: number;
}
type Location = { first_line: number; first_column: number };
type Lexer = {
  lex(): number;
  yytext: string;
  yylloc: Location;
};
type Parser = {
  yy: Record<string, unknown>;
  lexer: Lexer;
  terminals_: Record<number, string>;
  parse(source: string): unknown;
  parseError(message: string, hash: { token?: string }): never;
};
const helpers = new Set<string>(['each', 'if', 'unless', 'with']);

/** Called only after Handlebars rejects syntax. Use its lexer for comments, raw
 * blocks, strings and escaping, and an isolated parser to capture numeric positions.
 * The bounded validation pre-scan has already run. No shared parser is modified.
 */
export function emailSyntaxDiagnostic(source: string): EmailSyntaxDiagnostic {
  const shared = (handlebarsInstance() as unknown as { Parser: Parser }).Parser;
  const parser: Parser = Object.create(shared);
  parser.yy = { ...shared.yy };
  parser.lexer = Object.create(shared.lexer);
  const at = (loc: Location) => ({ line: loc.first_line, column: loc.first_column + 1 });
  type Block = { name: string; line: number; column: number };
  const stack: Block[] = [];
  let pending: { kind: string; line: number; column: number } | null = null;
  let mismatch: EmailSyntaxDiagnostic | null = null;
  let diagnostic: EmailSyntaxDiagnostic | null = null;
  const safe = (block: Block | undefined) =>
    block && helpers.has(block.name) ? { helper: block.name as EmailSyntaxHelper } : {};
  const lex = parser.lexer.lex;
  parser.lexer.lex = function () {
    const token = lex.call(this);
    const kind = parser.terminals_[token];
    if (['OPEN_BLOCK', 'OPEN_INVERSE', 'OPEN_ENDBLOCK', 'OPEN_RAW_BLOCK'].includes(kind)) {
      pending = { kind, ...at(this.yylloc) };
    } else if (pending && kind === 'ID') {
      if (pending.kind === 'OPEN_ENDBLOCK') {
        const opening = stack.pop();
        if (!opening || opening.name !== this.yytext)
          mismatch = { reason: 'MISMATCHED_CLOSE', ...safe(opening), line: pending.line, column: pending.column };
      } else stack.push({ name: this.yytext, line: pending.line, column: pending.column });
      pending = null;
    } else if (kind === 'END_RAW_BLOCK') {
      stack.pop();
    }
    return token;
  };
  parser.parseError = (_message, hash) => {
    const opening = stack.at(-1);
    diagnostic =
      hash.token === 'OPEN_ENDBLOCK'
        ? { reason: 'MISMATCHED_CLOSE', ...at(parser.lexer.yylloc) }
        : hash.token === 'EOF' && opening && !pending
          ? { reason: 'UNCLOSED_BLOCK', ...safe(opening), line: opening.line, column: opening.column }
          : { reason: 'UNEXPECTED_TOKEN', ...at(parser.lexer.yylloc) };
    throw new Error('Invalid email syntax.');
  };
  try {
    parser.parse(source);
  } catch {
    // Semantic mismatch errors bypass parseError; the lexer recorded the closing position.
  }
  return diagnostic ?? mismatch ?? { reason: 'UNEXPECTED_TOKEN', ...at(parser.lexer.yylloc) };
}

/** Map NFKC parser columns back to the administrator's original buffer. */
export function emailSyntaxSourcePosition(
  source: string,
  at: { line: number; column: number }
): {
  line: number;
  column: number;
} {
  const text = source.split('\n')[at.line - 1];
  if (text === undefined || text === text.normalize('NFKC')) return at;
  let normalizedOffset = 0;
  for (const segment of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)) {
    const length = segment.segment.normalize('NFKC').length;
    if (normalizedOffset + length > at.column - 1)
      return {
        line: at.line,
        column: segment.index + 1 + (length === segment.segment.length ? at.column - 1 - normalizedOffset : 0),
      };
    normalizedOffset += length;
  }
  return { line: at.line, column: text.length + 1 };
}
