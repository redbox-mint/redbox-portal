import { completionEdit, completionItems, completionQuery, CompletionSource } from './template-completion';

describe('shared template completion scaffolds', () => {
  it('accepts a feature scaffold without a YOUR_ placeholder', () => {
    const scaffold = '{{#each results}}\n  {{this.name}}\n{{/each}}';
    const source: CompletionSource = {
      fields: [],
      roots: [],
      helpers: ['each'],
      blockScaffold: () => scaffold,
    };
    const text = 'Before {{#ea}} after';
    const query = completionQuery(text, text.indexOf('ea') + 2, source.helpers)!;
    const item = completionItems(query, source)[0];
    const edit = completionEdit(text, query, item, source.blockScaffold);
    expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe('Before ' + scaffold + ' after');
    // Autocomplete's setRangeText(..., 'end') puts the caret at the end by default.
    expect(edit.selection).toBeUndefined();
  });
});
