import assert from 'node:assert/strict';
import { solr } from '../../src/config/solr.config';

export async function seedReadSearch(f: { brand: { id: string }; otherBrand: { id: string } }): Promise<void> {
  assert(process.env.HTTP_READ_SOLR_PORT, 'real Solr required');
  const base = 'http://127.0.0.1:' + process.env.HTTP_READ_SOLR_PORT + '/solr/redbox';
  const fields = [
    'metaMetadata_brandId',
    'metaMetadata_type',
    'workflow_stage',
    'authorization_edit',
    'authorization_view',
    'authorization_editRoles',
    'authorization_viewRoles',
    'full_text',
  ];
  for (const name of fields) {
    const existing = await fetch(base + '/schema/fields/' + name);
    if (existing.ok) continue;
    const r = await fetch(base + '/schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'add-field': solr.cores.default.schema['add-field']?.find(field => field.name === name) ?? {
          // workflow_stage normally uses the configured multivalued '*' dynamic field.
          // A scalar override cannot be introduced after a writer has indexed that field.
          name,
          type: 'string',
          stored: true,
          indexed: true,
          multiValued: true,
        },
      }),
    });
    assert.equal(r.status, 200, await r.text());
  }
  const docs = [
    ['visible', f.brand.id, 'pilot-admin', 'dataRecord'],
    ['foreign', f.otherBrand.id, 'pilot-admin', 'dataRecord'],
    ['private', f.brand.id, 'other', 'dataRecord'],
    ['other-type', f.brand.id, 'pilot-admin', 'secret'],
  ].map(([id, brandId, username, type]) => ({
    id,
    metaMetadata_brandId: brandId,
    metaMetadata_type: type,
    workflow_stage: 'draft',
    authorization_view: username,
    full_text: 'test',
    date_object_modified: '2026-01-01T00:00:00Z',
  }));
  const update = await fetch(base + '/update?commit=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(docs),
  });
  assert.equal(update.status, 200, await update.text());
}
