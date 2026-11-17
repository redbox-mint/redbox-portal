import { compile, precompile } from 'handlebars';
import { flattenContextFields } from './schema-fields';
import { contextSchemaFixture } from './schema.fixture';
import { CompletionSource, completionEdit, completionItems, completionQuery } from './template-completion';
import { buildFieldTree, fieldInsertion, searchFieldRows } from './field-tree';
import { pathAt, suggestionEdit } from './diagnostic-fix';

describe('template completion', () => {
  const source: CompletionSource = {
    fields: flattenContextFields(contextSchemaFixture()),
    roots: ['oid', 'portal', 'record', 'scuEmail'],
    helpers: ['each', 'formatDate', 'if'],
  };
  const at = (text: string) => completionQuery(text, text.length, source.helpers);

  const accept = (text: string, caret: number, value: string) => {
    const query = completionQuery(text, caret, source.helpers)!;
    const item = completionItems(query, source).find(item => item.value === value)!;
    const edit = completionEdit(text, query, item);
    return { edit, result: text.slice(0, edit.start) + edit.text + text.slice(edit.end) };
  };

  it('keeps an inverse opener inverse when scaffolding a new block', () => {
    const { edit, result } = accept('{{^i', 4, 'if');
    expect(result).toBe('{{^if record.metadata.YOUR_FIELD}}\n  {{record.metadata.YOUR_FIELD}}\n{{/if}}');
    expect(edit.text.slice(edit.selection!.start, edit.selection!.end)).toBe('YOUR_FIELD');
    expect(() => precompile(result, { strict: true })).not.toThrow();
  });

  it('scaffolds a new block nested inside another block whose close follows', () => {
    const text = '{{#if oid}}{{#ea}}{{/if}}';
    const { edit, result } = accept(text, text.indexOf('ea}}') + 2, 'each');
    expect(result).toBe('{{#if oid}}{{#each record.metadata.YOUR_ARRAY}}\n  {{this}}\n{{/each}}{{/if}}');
    expect(edit.text.slice(edit.selection!.start, edit.selection!.end)).toBe('YOUR_ARRAY');
    expect(() => precompile(result, { strict: true })).not.toThrow();
    // A block nested between the opener and its own close is skipped.
    const own = '{{#ea}}{{#if oid}}x{{/if}}{{/each}}';
    expect(accept(own, 5, 'each').result).toBe('{{#each}}{{#if oid}}x{{/if}}{{/each}}');
  });

  it('only replaces the helper name when an expression already has arguments or block structure', () => {
    for (const text of ['{{#if oid}}OK{{/if}}', '{{#if}}OK{{/if}}', '{{{if oid}}}', '{{if oid}}']) {
      const query = completionQuery(text, text.indexOf('if') + 1, source.helpers)!;
      const item = completionItems(query, source).find(item => item.value === 'if')!;
      const edit = completionEdit(text, query, item);
      const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      expect(result).toBe(text);
      expect(edit.selection).toBeUndefined();
      expect(() => precompile(result)).not.toThrow();
    }
  });

  it('opens directly after {{ and inside known helper arguments only', () => {
    expect(at('Hello {{')).toEqual(
      jasmine.objectContaining({ start: 8, end: 8, prefix: '', head: true, block: false })
    );
    expect(at('{{#each record.me')).toEqual(jasmine.objectContaining({ prefix: 'record.me', head: false }));
    expect(at('{{#e')).toEqual(jasmine.objectContaining({ prefix: 'e', head: true, block: true }));
    expect(at('{{{record.')).toEqual(jasmine.objectContaining({ triple: true, prefix: 'record.' }));
    expect(at('{{record.title}} after')).toBeNull();
    expect(at('no mustache')).toBeNull();
    expect(at('{{! comment')).toBeNull();
    expect(at('{{/each')).toBeNull();
    expect(at('{{unknownHelper rec')).toBeNull();
  });

  it('replaces the whole path token around the caret', () => {
    const text = '{{record.metadata.tit}}';
    const query = completionQuery(text, 19, source.helpers)!;
    expect(query).toEqual(jasmine.objectContaining({ start: 2, end: 21, prefix: 'record.metadata.t' }));
  });

  it('suggests children of the typed parent, prefix matches before substring matches', () => {
    const items = completionItems(at('{{record.metadata.t')!, source);
    expect(items.map(i => i.value)).toEqual([
      'record.metadata.title',
      'record.metadata.description',
      'record.metadata.authors',
    ]);
    expect(items[0]).toEqual(
      jasmine.objectContaining({ label: 'title', type: 'string', title: 'Title', required: true })
    );
  });

  it('offers roots, loose hook roots and helpers at the top level; helpers first in a block', () => {
    const plain = completionItems(at('{{')!, source).map(i => i.value);
    expect(plain).toEqual(['oid', 'record', 'portal', 'scuEmail', 'each', 'formatDate', 'if']);
    const block = completionItems(at('{{#')!, source).map(i => i.value);
    expect(block.slice(0, 3)).toEqual(['each', 'formatDate', 'if']);
    expect(completionItems(at('{{#each ')!, source).some(i => i.kind === 'helper')).toBeFalse();
  });

  it('marks objects as containers and never suggests unscoped array item paths', () => {
    const items = completionItems(at('{{record.')!, source);
    expect(items.find(i => i.label === 'metadata')?.container).toBeTrue();
    expect(completionItems(at('{{record.metadata.')!, source).find(i => i.label === 'authors')?.container).toBeFalse();
    expect(completionItems(at('{{record.metadata.authors')!, source).some(i => i.value.includes('[]'))).toBeFalse();
    expect(completionItems(at('{{this.record.')!, source).length).toBeGreaterThan(0);
  });

  it('closes plain leaves, drills into objects and leaves block arguments open', () => {
    const leaf = completionItems(at('{{record.metadata.ti')!, source)[0];
    expect(completionEdit('{{record.metadata.ti', at('{{record.metadata.ti')!, leaf)).toEqual({
      start: 2,
      end: 20,
      text: 'record.metadata.title}}',
    });
    const existing = '{{record.metadata.ti}}';
    const query = completionQuery(existing, 20, source.helpers)!;
    expect(completionEdit(existing, query, leaf).text).toBe('record.metadata.title');
    const container = completionItems(at('{{rec')!, source)[0];
    expect(completionEdit('{{rec', at('{{rec')!, container).text).toBe('record.');
    const triple = at('{{{record.metadata.ti')!;
    expect(completionEdit('{{{record.metadata.ti', triple, leaf).text).toBe('record.metadata.title}}}');
    const block = at('{{#each record.metadata.au')!;
    const authors = completionItems(block, source)[0];
    expect(completionEdit('{{#each record.metadata.au', block, authors).text).toBe('record.metadata.authors');
    const helper = completionItems(at('{{#ea')!, source)[0];
    expect(completionEdit('{{#ea', at('{{#ea')!, helper).text).toBe(
      '{{#each record.metadata.YOUR_ARRAY}}\n  {{this}}\n{{/each}}'
    );
  });
  for (const prefix of ['@root.', 'this.', '../', '../../']) {
    it(`preserves ${prefix} for leaf and container completion`, () => {
      const text = `{{${prefix}record.workflow.sta}}`;
      const query = completionQuery(text, text.indexOf('sta}}') + 3, source.helpers)!;
      const item = completionItems(query, source).find(i => i.label === 'stage')!;
      const edit = completionEdit(text, query, item);
      expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(`{{${prefix}record.workflow.stage}}`);
      const containerText = `{{${prefix}rec`;
      const containerQuery = at(containerText)!;
      const container = completionItems(containerQuery, source).find(i => i.label === 'record')!;
      expect(completionEdit(containerText, containerQuery, container).text).toBe(`${prefix}record.`);
    });
  }

  it('renders the root-qualified completion inside #each', () => {
    const text = '{{#each record.metadata.authors}}{{@root.record.workflow.sta}}{{/each}}';
    const query = completionQuery(text, text.indexOf('sta}}') + 3, source.helpers)!;
    const edit = completionEdit(text, query, completionItems(query, source).find(i => i.label === 'stage')!);
    const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    expect(compile(result)({ record: { workflow: { stage: 'draft' }, metadata: { authors: [{ name: 'Jo' }] } } })).toBe(
      'draft'
    );
  });

  it('completes namespaced keys with bracket syntax and retains literal dots in parents', () => {
    const namespaced = {
      ...source,
      fields: flattenContextFields({
        properties: {
          record: {
            properties: {
              metadata: {
                properties: {
                  'dc:accessRights': { type: 'string' },
                  'project.details': { properties: { 'dc:title': { type: 'string' } } },
                },
              },
            },
          },
        },
      }),
    };
    for (const text of ['{{record.metadata.dc:ac', '{{record.metadata.[dc:ac']) {
      const query = at(text)!;
      const edit = completionEdit(text, query, completionItems(query, namespaced)[0]);
      expect(edit.text).toBe('record.metadata.[dc:accessRights]}}');
    }
    const text = '{{record.metadata.[project.details].dc:ti';
    expect(completionItems(at(text)!, namespaced)[0].value).toBe('record.metadata.[project.details].[dc:title]');
  });

  const literalSchema = {
    properties: {
      record: {
        properties: {
          metadata: {
            properties: {
              'access rights': { type: 'string' },
              'accès.権利': { type: 'string' },
              'project.é': { properties: { 'access rights': { type: 'string' }, title: { type: 'string' } } },
            },
          },
        },
      },
    },
  };
  const literalSource = { ...source, fields: flattenContextFields(literalSchema) };
  const literalContext = {
    record: {
      metadata: {
        'access rights': 'Open',
        'accès.権利': 'Open',
        'project.é': { 'access rights': 'Open', title: 'Open' },
      },
    },
  };
  for (const prefix of ['@root.', '@root/', '../', 'this.']) {
    for (const suffix of ['}} [Contact support]', '}} plain [text] after', '\n[Contact support]']) {
      it(`bounds an unfinished ${prefix}literal before ${JSON.stringify(suffix)}`, () => {
        const text = `{{${prefix}record.metadata.[acc${suffix}`;
        const caret = text.indexOf('[acc') + 4;
        const query = completionQuery(text, caret, source.helpers)!;
        expect(query).not.toBeNull();
        expect(query.end).toBe(caret);
        const item = completionItems(query, literalSource).find(item => item.label === 'access rights')!;
        const edit = completionEdit(text, query, item);
        const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
        const after = suffix.startsWith('}}') ? suffix : `}}${suffix}`;
        expect(result).toBe(`{{${prefix}record.metadata.[access rights]${after}`);
        // An incomplete path has no unambiguous AST segment to fix.
        expect(pathAt(text, 1, 3)).toBeNull();
        expect(suggestionEdit(text, { line: 1, column: 3, segmentIndex: 2 }, 'access rights')).toBeNull();
      });
    }
    it(`shares complete ${prefix}literal boundaries with field-tree insertion and did-you-mean`, () => {
      const text = `{{${prefix}record.metadata.[acc rights]}} [Contact support]`;
      const query = completionQuery(text, text.indexOf('[acc') + 4, source.helpers)!;
      const item = completionItems(query, literalSource).find(item => item.label === 'access rights')!;
      const edit = completionEdit(text, query, item);
      const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      const tree = buildFieldTree(literalSource.fields, []);
      const node = searchFieldRows(tree, 'record.metadata.[access rights]')[0].node;
      expect(result).toBe(fieldInsertion(node).replace('{{record', `{{${prefix}record`) + ' [Contact support]');
      const fix = suggestionEdit(
        text,
        { line: 1, column: 3, segmentIndex: prefix.startsWith('@') ? 3 : 2 },
        'access rights'
      )!;
      expect(text.slice(0, fix.start) + fix.text + text.slice(fix.end)).toBe(result);
    });
  }

  it('suppresses ambiguous nested and stray brackets instead of replacing surrounding text', () => {
    for (const text of ['{{record.metadata.[acc[other]}} [Contact]', '{{record.metadata.acc]}} [Contact]']) {
      const caret = text.indexOf('acc') + 3;
      expect(completionQuery(text, caret, source.helpers)).toBeNull();
      expect(suggestionEdit(text, { line: 1, column: 3, segmentIndex: 2 }, 'access rights')).toBeNull();
    }
  });
  it('preserves complete bracket literals containing closing braces across all three edit paths', () => {
    const schema = {
      properties: {
        record: {
          properties: {
            metadata: {
              properties: {
                'access}}rights': { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
        },
      },
    };
    const fields = flattenContextFields(schema);
    const text = '{{record.metadata.[access}}rights]}} {{record.metadata.title}}';
    for (let caret = text.indexOf('[access') + 1; caret <= text.indexOf('rights]') + 7; caret++) {
      const query = completionQuery(text, caret, source.helpers)!;
      expect(query).not.toBeNull();
      const item = completionItems(query, { ...source, fields }).find(item => item.label === 'access}}rights')!;
      expect(item).toBeDefined();
      const edit = completionEdit(text, query, item);
      const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      expect(result).toBe(text);
      expect(compile(result)({ record: { metadata: { 'access}}rights': 'BRACES', title: 'TITLE' } } })).toBe(
        'BRACES TITLE'
      );
    }
    const node = searchFieldRows(buildFieldTree(fields, []), 'access}}rights')[0].node;
    expect(fieldInsertion(node)).toBe('{{record.metadata.[access}}rights]}}');
    expect(pathAt(text, 1, 3)).toBe('record.metadata.[access}}rights]');
    const misspelled = text.replace('access}}rights', 'acces}}rights');
    const fix = suggestionEdit(misspelled, { line: 1, column: 3, segmentIndex: 2 }, 'access}}rights')!;
    expect(misspelled.slice(0, fix.start) + fix.text + misspelled.slice(fix.end)).toBe(text);
  });
  it('declines unfinished literals whose replacement would consume the next mustache', () => {
    for (const prefix of ['', '@root.', '@root/', '../', 'this.', './']) {
      const text = `{{${prefix}record.metadata.[acc {{record.metadata.title}} [Contact support]`;
      expect(completionQuery(text, text.indexOf('[acc') + 4, source.helpers)).toBeNull();
      expect(pathAt(text, 1, 3)).toBeNull();
      expect(
        suggestionEdit(text, { line: 1, column: 3, segmentIndex: prefix.startsWith('@') ? 3 : 2 }, 'access rights')
      ).toBeNull();
    }
  });
  for (const [token, label, expected] of [
    ['record.metadata.[acc rights]', 'access rights', 'record.metadata.[access rights]'],
    ['record.metadata.[access rights]', 'access rights', 'record.metadata.[access rights]'],
    ['record.metadata.[accès.権利]', 'accès.権利', 'record.metadata.[accès.権利]'],
    ['record.metadata.[project.é].[acc rights]', 'access rights', 'record.metadata.[project.é].[access rights]'],
  ]) {
    it(`replaces the whole ${token} at every caret position around its last bracketed segment`, () => {
      const text = `{{${token}}}`;
      let completed = 0;
      for (let caret = text.lastIndexOf('['); caret <= text.lastIndexOf(']') + 1; caret++) {
        const query = completionQuery(text, caret, source.helpers)!;
        expect(query).not.toBeNull();
        expect(text.slice(query.start, query.end)).toBe(token);
        const item = completionItems(query, literalSource).find(item => item.label === label);
        // A misspelled suffix may no longer match the label after the caret passes it.
        if (!item) continue;
        completed++;
        const edit = completionEdit(text, query, item);
        const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
        expect(result).toBe(`{{${expected}}}`);
        expect(compile(result, { strict: true })(literalContext)).toBe('Open');
      }
      // Includes the reported caret before the embedded space, not just an empty prefix.
      expect(completed).toBeGreaterThan(3);
    });
  }

  it('completes children after a Unicode bracketed parent and scans across all bracketed segments', () => {
    const text = '{{record.metadata.[project.é].ti}}';
    const query = completionQuery(text, text.indexOf('ti}}') + 2, source.helpers)!;
    const item = completionItems(query, literalSource).find(item => item.label === 'title')!;
    const edit = completionEdit(text, query, item);
    const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    expect(compile(result, { strict: true })(literalContext)).toBe('Open');
    const multiple = '{{record.metadata.[project.é].[access rights]}}';
    for (let caret = multiple.indexOf('['); caret <= multiple.indexOf('}}'); caret++) {
      const query = completionQuery(multiple, caret, source.helpers)!;
      expect(multiple.slice(query.start, query.end)).toBe('record.metadata.[project.é].[access rights]');
    }
  });

  it('keeps the same literal boundaries for field-tree insertion and did-you-mean replacement', () => {
    const tree = buildFieldTree(literalSource.fields, []);
    const field = searchFieldRows(tree, 'record.metadata.[project.é].[access rights]')[0].node;
    const inserted = fieldInsertion(field);
    expect(compile(inserted, { strict: true })(literalContext)).toBe('Open');
    const text = '{{record.metadata.[project.é].[acc rights]}}';
    expect(pathAt(text, 1, 3)).toBe('record.metadata.[project.é].[acc rights]');
    const edit = suggestionEdit(text, { line: 1, column: 3, segmentIndex: 3 }, 'access rights')!;
    const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    expect(result).toBe(inserted);
    expect(compile(result, { strict: true })(literalContext)).toBe('Open');
  });
});
