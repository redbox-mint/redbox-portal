import { diagnosticExpressionAt } from './diagnostic-expression';

describe('diagnosticExpressionAt (UR-U02)', () => {
  it('extracts full paths at real strict-render locations from local source', () => {
    expect(diagnosticExpressionAt('First line\n             {{record.metadata.PRIVATE_MISSING}}', 2, 16)).toBe(
      'record.metadata.PRIVATE_MISSING'
    );
    expect(diagnosticExpressionAt('{{imports.record.metadata.[dc:title]}}', 1, 3)).toBe(
      'imports.record.metadata.[dc:title]'
    );
    expect(diagnosticExpressionAt('{{#each record.metadata.creators}}\n{{this.name}}{{/each}}', 2, 3)).toBe(
      'this.name'
    );
    expect(diagnosticExpressionAt('{{get record.metadata "title"}}', 1, 7)).toBe('record.metadata');
  });
  it('reads expressions at block/mustache openings, including triple braces and multiline arguments', () => {
    expect(diagnosticExpressionAt('{{#each record.metadata.creators}}', 1, 1)).toBe('each record.metadata.creators');
    expect(diagnosticExpressionAt('{{{get record.metadata "title" "}}"}}}', 1, 1)).toBe(
      'get record.metadata "title" "}}"'
    );
    expect(diagnosticExpressionAt('{{get\n record.metadata "title"}}', 2, 2)).toBe('record.metadata');
  });
  it('returns null for unavailable locations, literals, comments, escaped or incomplete expressions', () => {
    for (const source of [
      'Plain text',
      '{{! comment}}',
      '{{!-- comment --}}',
      '\\{{record.metadata.x}}',
      '{{record.metadata.x',
    ])
      expect(diagnosticExpressionAt(source, 1, 1)).toBeNull();
    expect(diagnosticExpressionAt('{{oid}}', 2, 1)).toBeNull();
    expect(diagnosticExpressionAt('{{oid}}', 1, 99)).toBeNull();
    expect(diagnosticExpressionAt('{{oid}}', NaN, 1)).toBeNull();
  });
});
