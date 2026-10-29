import { compile } from 'handlebars';
import { buildFieldTree, fieldInsertion, searchFieldRows, visibleFieldRows } from './field-tree';
import { flattenContextFields } from './schema-fields';
import { contextSchemaFixture } from './schema.fixture';

describe('field tree', () => {
  const tree = () => buildFieldTree(flattenContextFields(contextSchemaFixture()), ['oid', 'record', 'scuEmail']);
  const find = (path: string) => searchFieldRows(tree(), path).find(row => row.node.path === path)!.node;

  it('nests fields, including array items, and adds hook roots as loose leaves', () => {
    const nodes = tree();
    expect(nodes.map(n => n.name)).toEqual(['oid', 'record', 'portal', 'scuEmail']);
    expect(nodes[3].loose).toBeTrue();
    const authors = find('record.metadata.authors');
    expect(authors.children.map(c => c.path)).toEqual([
      'record.metadata.authors[].name',
      'record.metadata.authors[].email',
    ]);
  });

  it('lists only expanded rows, depth first', () => {
    const rows = visibleFieldRows(tree(), new Set(['record']));
    expect(rows.map(r => `${r.depth}:${r.node.name}`)).toEqual([
      '0:oid',
      '0:record',
      '1:metadata',
      '1:workflow',
      '0:portal',
      '0:scuEmail',
    ]);
  });

  it('searches paths, titles and descriptions', () => {
    expect(searchFieldRows(tree(), 'zzz').length).toBe(0);
    expect(searchFieldRows(tree(), 'the record title').map(r => r.node.path)).toEqual(['record.metadata.title']);
    expect(searchFieldRows(tree(), 'NAME').map(r => r.node.path)).toEqual(['record.metadata.authors[].name']);
    expect(searchFieldRows(tree(), '  ')).toEqual([]);
  });

  it('lists matches under alias roots after the primary paths', () => {
    const nodes = buildFieldTree(
      flattenContextFields({
        type: 'object',
        properties: {
          imports: { $ref: '#/properties/record' },
          record: { type: 'object', properties: { title: { type: 'string' } } },
        },
      }),
      []
    );
    expect(searchFieldRows(nodes, 'title').map(r => r.node.path)).toEqual(['record.title', 'imports.title']);
  });

  it('inserts scalar paths, #each scaffolds for arrays and scoped item paths', () => {
    expect(fieldInsertion(find('record.metadata.title'))).toBe('{{record.metadata.title}}');
    expect(fieldInsertion(find('record.metadata.authors'))).toBe(
      '{{#each record.metadata.authors}}\n  {{this.name}}\n{{/each}}'
    );
    expect(fieldInsertion(find('record.metadata.keywords'))).toBe(
      '{{#each record.metadata.keywords}}\n  {{this}}\n{{/each}}'
    );
    expect(fieldInsertion(find('record.metadata.authors[].email'))).toBe(
      '{{#each record.metadata.authors}}\n  {{this.email}}\n{{/each}}'
    );
  });

  it('nests #each blocks for arrays inside arrays', () => {
    const nested = buildFieldTree(
      flattenContextFields({
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                members: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
              },
            },
          },
        },
      }),
      []
    );
    const id = searchFieldRows(nested, 'groups[].members[].id')[0].node;
    expect(fieldInsertion(id)).toBe(
      '{{#each groups}}\n  {{#each this.members}}\n    {{this.id}}\n  {{/each}}\n{{/each}}'
    );
  });
  it('inserts namespaced model keys and literal dots safely, including array item names', () => {
    const nodes = buildFieldTree(
      flattenContextFields({
        properties: {
          record: {
            properties: {
              metadata: {
                properties: {
                  'dc:accessRights': { type: 'string' },
                  'project.details': { properties: { 'dc:title': { type: 'string' } } },
                  authors: { type: 'array', items: { properties: { 'foaf:name': { type: 'string' } } } },
                },
              },
            },
          },
        },
      }),
      []
    );
    const access = searchFieldRows(nodes, 'dc:accessRights')[0].node;
    expect(access.name).toBe('dc:accessRights');
    expect(fieldInsertion(access)).toBe('{{record.metadata.[dc:accessRights]}}');
    expect(compile(fieldInsertion(access))({ record: { metadata: { 'dc:accessRights': 'Open' } } })).toBe('Open');
    const title = searchFieldRows(nodes, 'dc:title')[0].node;
    expect(fieldInsertion(title)).toBe('{{record.metadata.[project.details].[dc:title]}}');
    const authors = searchFieldRows(nodes, 'record.metadata.authors').find(row => row.node.isArray)!.node;
    expect(fieldInsertion(authors)).toBe('{{#each record.metadata.authors}}\n  {{this.[foaf:name]}}\n{{/each}}');
  });
});
