let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import {
  DashboardFieldCatalogue,
  collectSettingsFieldPaths,
  flattenRecordJsonSchema,
  isKnownFieldPath,
  labelForFieldPath
} from '../../src/configmodels/DashboardFieldCatalogue';

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  $defs: { person: { type: 'object', additionalProperties: false, properties: { text_full_name: { type: 'string' }, email: { type: ['string', 'null'] } } } },
  properties: {
    title: { type: 'string', description: 'Plan title' },
    status: { type: 'string', enum: ['open', 'closed'] },
    contributor_ci: { $ref: '#/$defs/person' },
    contributors: { type: 'array', items: { $ref: '#/$defs/person' } },
    keywords: { type: 'array', items: { type: 'string' } },
    custom_widget: { 'x-redbox-unsupported-component': 'Widget' },
    conditional: { type: 'object', additionalProperties: false, properties: {}, allOf: [{ if: { properties: { a: { const: 1 } } }, then: { properties: { b: { type: 'number' } } } }] }
  }
};

function catalogue(): DashboardFieldCatalogue {
  const flat = flattenRecordJsonSchema(schema);
  return { status: 'partial', recordType: 'rdmp', workflowStage: 'draft', fields: flat.fields, openPrefixes: flat.openPrefixes };
}

describe('DashboardFieldCatalogue', function () {
  it('flattens properties, $defs references, arrays and conditional branches into record paths', function () {
    const { fields, openPrefixes } = flattenRecordJsonSchema(schema);
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f]));
    expect(Object.keys(byPath)).to.include.members([
      'metadata.title',
      'metadata.status',
      'metadata.contributor_ci.text_full_name',
      'metadata.contributor_ci.email',
      'metadata.contributors.email',
      'metadata.keywords',
      'metadata.conditional.b'
    ]);
    expect(byPath['metadata.status'].enum).to.deep.equal(['open', 'closed']);
    expect(byPath['metadata.contributors.email'].repeated).to.equal(true);
    expect(byPath['metadata.keywords'].type).to.equal('string');
    expect(byPath['metadata.title'].description).to.equal('Plan title');
    expect(openPrefixes).to.include('metadata.custom_widget');
    expect(openPrefixes).to.not.include('metadata');
  });

  it('recognises known, parent, system and open paths only', function () {
    const c = catalogue();
    expect(isKnownFieldPath(c, 'metadata.title')).to.equal(true);
    expect(isKnownFieldPath(c, 'metadata.contributor_ci')).to.equal(true);
    expect(isKnownFieldPath(c, 'metaMetadata.lastSaveDate')).to.equal(true);
    expect(isKnownFieldPath(c, 'metadata.custom_widget.anything')).to.equal(true);
    expect(isKnownFieldPath(c, 'metadata.titel')).to.equal(false);
    expect(isKnownFieldPath({ ...c, status: 'unavailable' }, 'metadata.titel')).to.equal(true);
  });

  it('collects every field path a dashboard setting refers to', function () {
    const paths = collectSettingsFieldPaths({
      tableConfig: {
        rowConfig: [{ variable: 'metadata.title', secondarySort: 'metadata.status' }, { variable: '' }],
        formatRules: {
          filterBy: { filterField: 'metadata.contributor_ci.email' },
          queryFilters: { rdmp: [{ filterFields: [{ path: 'metadata.keywords' }] }] },
          sortBy: 'metaMetadata.createdOn:-1',
          sortGroupBy: [{ compareField: 'metaMetadata.type', relatedTo: 'metadata.rdmp.oid' }]
        }
      }
    }).map((p) => p.fieldPath);
    expect(paths).to.deep.equal(['metadata.title', 'metadata.status', 'metadata.contributor_ci.email', 'metadata.keywords', 'metaMetadata.createdOn', 'metaMetadata.type', 'metadata.rdmp.oid']);
  });

  it('labels paths readably', function () {
    expect(labelForFieldPath('metadata.contributor_ci.text_full_name')).to.equal('Contributor ci › Text full name');
  });
});
