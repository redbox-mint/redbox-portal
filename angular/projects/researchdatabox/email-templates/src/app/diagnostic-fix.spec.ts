import { offsetAt, pathAt, suggestionEdit } from './diagnostic-fix';
import { contextSchemaFixture } from './schema.fixture';

describe('diagnostic fixes', () => {
  const schema = contextSchemaFixture();

  it('maps one-based positions and reads the whole path there', () => {
    const source = 'Hi\n  {{record.metadata.titel}} and {{oid}}';
    expect(offsetAt(source, 2, 5)).toBe(7);
    expect(offsetAt(source, 3, 1)).toBe(-1);
    expect(pathAt(source, 2, 5)).toBe('record.metadata.titel');
    expect(pathAt(source, 1, 1)).toBe('Hi');
  });

  it('replaces only the unknown segment of that occurrence', () => {
    const source = '{{record.metadata.titel}} / {{record.metadata.titel}}';
    const edit = suggestionEdit(source, { line: 1, column: 31 }, 'title', schema)!;
    expect(edit).toEqual({ start: 46, end: 51, text: 'title' });
    const result = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    expect(result).toBe('{{record.metadata.titel}} / {{record.metadata.title}}');
  });

  it('resolves the unknown segment from the schema, not just the last segment', () => {
    const source = '{{#with record.metdata.title}}';
    const edit = suggestionEdit(source, { line: 1, column: 9 }, 'metadata', schema)!;
    expect(source.slice(edit.start, edit.end)).toBe('metdata');
  });

  it('uses segment metadata for relative paths and refuses stale or unsafe input', () => {
    const source = '{{#each record.metadata.authors}}{{this.nmae}}{{/each}}';
    const edit = suggestionEdit(source, { line: 1, column: 36, segmentIndex: 0 }, 'name', schema)!;
    expect(source.slice(edit.start, edit.end)).toBe('nmae');
    expect(suggestionEdit(source, { line: 1, column: 36 }, 'evil]key', schema)).toBeNull();
    expect(suggestionEdit('   ', { line: 1, column: 2 }, 'title', schema)).toBeNull();
    expect(suggestionEdit('{{record.metadata.title}}', { line: 1, column: 3 }, 'title', schema)).toBeNull();
  });
  it('fixes the first repeated segment in #with and suppresses ambiguous legacy diagnostics', () => {
    const source = '{{#with record.metadata}}{{this.titel.titel}}{{/with}}';
    const position = { line: 1, column: source.indexOf('this.') + 1, segmentIndex: 0 };
    const edit = suggestionEdit(source, position, 'title', schema)!;
    expect(source.slice(0, edit.start) + edit.text + source.slice(edit.end)).toBe(
      '{{#with record.metadata}}{{this.title.titel}}{{/with}}'
    );
    expect(suggestionEdit(source, { line: 1, column: source.indexOf('this.') + 1 }, 'title', schema)).toBeNull();
    expect(suggestionEdit(source, { ...position, segmentIndex: 99 }, 'title', schema)).toBeNull();
    expect(suggestionEdit(source, { ...position, segmentIndex: -1 }, 'title', schema)).toBeNull();
  });

  it('preserves scope and replaces a whole bracketed segment with a safe schema literal', () => {
    const source = '{{#each authors}}{{../record.metadata.[dc:acessRights]}}{{/each}}';
    const position = { line: 1, column: source.indexOf('../') + 1, segmentIndex: 2 };
    expect(pathAt(source, position.line, position.column)).toBe('../record.metadata.[dc:acessRights]');
    const edit = suggestionEdit(source, position, 'dc:accessRights')!;
    expect(source.slice(0, edit.start) + edit.text + source.slice(edit.end)).toBe(
      '{{#each authors}}{{../record.metadata.[dc:accessRights]}}{{/each}}'
    );
  });
});
