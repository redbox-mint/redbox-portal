import { lookupPath } from '@researchdatabox/sails-ng-common';
import {
  completionEdit,
  completionItems,
  completionQuery,
  CompletionSource,
  pathCompletionQuery,
  pathCompletionEdit,
} from './template-completion';

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

describe('shared lookup path completion', () => {
  for (const key of ['literal.alias', 'dc:title', 'with spaces', 'a"quote']) {
    it(`matches presentation paths and inserts the literal ${key} with the shared lookup adapter`, () => {
      const source: CompletionSource = {
        fields: [{ path: `metadata.[${key}]`, type: 'string', required: false, isArray: false }],
        roots: [],
        helpers: [],
        pathInsertion: lookupPath,
      };
      const text = 'metadata.';
      const query = pathCompletionQuery(text, text.length)!;
      const items = completionItems(query, source);
      expect(items.length).toBe(1);
      expect(items[0].label).toBe(key);
      expect(items[0].value).toBe(`metadata.[${key}]`);
      expect(pathCompletionEdit(query, items[0], source.pathInsertion).text).toBe(`metadata[${JSON.stringify(key)}]`);
    });
  }

  it('continues drilling into a literal object after inserting its native lookup path', () => {
    const source: CompletionSource = {
      fields: [
        { path: 'metadata.[literal.alias]', type: 'object', required: false, isArray: false },
        { path: 'metadata.[literal.alias].title', type: 'string', required: false, isArray: false },
      ],
      roots: [],
      helpers: [],
      pathInsertion: lookupPath,
    };
    const parent = pathCompletionQuery('metadata.', 9)!;
    const object = completionItems(parent, source)[0];
    expect(object.container).toBeTrue();
    const text = pathCompletionEdit(parent, object, source.pathInsertion).text;
    expect(text).toBe('metadata["literal.alias"].');
    const child = pathCompletionQuery(text, text.length)!;
    const items = completionItems(child, source);
    expect(items.map(i => i.label)).toEqual(['title']);
    expect(pathCompletionEdit(child, items[0], source.pathInsertion).text).toBe('metadata["literal.alias"].title');
  });
});
