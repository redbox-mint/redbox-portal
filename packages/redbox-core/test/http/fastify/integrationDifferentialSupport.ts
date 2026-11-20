import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId, type Document } from 'mongodb';
import { HttpIdentity } from '../../../src/authentication/HttpIdentity';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import {
  mutationCollections,
  normalizeMutation,
  settleMutationWork,
  type Fixture,
  type Wire,
} from './mutationDifferentialSupport';
export const integrationCollections = [
  'vocabulary',
  'vocabularyentry',
  'figsharevocabularysource',
  'figsharevocabularycategory',
  'figsharevocabularycrosswalk',
  'figsharevocabularycrosswalkmapping',
  'figsharevocabularysyncrun',
  'brandingconfig',
  'brandingconfighistory',
];
export const stateCollections = [...mutationCollections, ...integrationCollections, 'user', 'referenceSessions'];
/** Stable persisted seed identities, before the requests under comparison. Domain
 * methods still create and validate all rows; no HTTP/domain result is substituted. */
async function stabilize(f: Fixture) {
  const ids = new Map<string, string>();
  let index = 1000;
  for (const name of integrationCollections) {
    const rows = await f.client.db().collection(name).find({}).toArray();
    rows.sort((a, b) =>
      String(a.name ?? a.label ?? a.categoryId ?? a.state ?? '').localeCompare(
        String(b.name ?? b.label ?? b.categoryId ?? b.state ?? '')
      )
    );
    for (const row of rows)
      if (row._id instanceof ObjectId && !row._id.toHexString().startsWith('000000000000000000'))
        ids.set(row._id.toHexString(), (++index).toString(16).padStart(24, '0'));
  }
  const clean = (v: unknown): unknown =>
    v instanceof ObjectId
      ? new ObjectId(ids.get(v.toHexString()) ?? v.toHexString())
      : v instanceof Date
        ? v
        : Array.isArray(v)
          ? v.map(clean)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]))
            : typeof v === 'string'
              ? [...ids].reduce((s, [a, b]) => s.split(a).join(b), v)
              : v;
  for (const name of integrationCollections) {
    const rows = await f.client.db().collection(name).find({}).toArray();
    await f.client.db().collection(name).deleteMany({});
    if (rows.length)
      await f.client
        .db()
        .collection(name)
        .insertMany(rows.map(row => clean(row) as Document));
  }
}
export async function seedIntegrations(f: Fixture) {
  const vocabulary = f.data.reference.vocabulary.get(),
    figshare = f.portal.providers.figshareVocabulary.get();
  await vocabulary.create({
    name: 'Owned',
    slug: 'owned',
    branding: f.brand.id,
    source: 'rva',
    sourceId: '225',
    sourceVersionId: '1',
    entries: [{ label: 'Alpha', identifier: 'alpha', value: 'A' }],
  });
  await vocabulary.create({ name: 'Foreign', slug: 'foreign', branding: f.otherBrand.id, entries: [] });
  const ctx = { brandId: f.brand.id, userId: 'pilot-admin' };
  const initial = await figshare.createPreview(
    {
      scope: 'public',
      taxonomyId: '10',
      createLocalClone: true,
      localCloneName: 'Local clone',
      localCloneSlug: 'local-clone',
    },
    ctx
  );
  const reviewed = await figshare.getPreview(String(initial.runId), {}, ctx);
  await figshare.applyPreview(
    String(initial.runId),
    {
      remoteHash: String(initial.remoteHash),
      approvedProposalIds: reviewed.page.records.map(row => String(Reflect.get(Object(row), 'proposalId'))),
    },
    ctx
  );
  await stabilize(f);
  const source = (await f.client.db().collection('figsharevocabularysource').findOne({}))!;
  await figshare.createPreview({ scope: 'public', taxonomyId: '10', sourceId: String(source._id) }, ctx);
  await stabilize(f);
  const brand = f.data.reference.branding.get();
  const identities = getIdentityRepositories(f.owner);
  const admin = await new HttpIdentity(identities).bearer('pilot-api-token');
  assert(admin);
  const state = await brand.getAdminState('default');
  await brand.publish('default', 'rdmp', admin, {
    expectedVersion: state.active.version,
    expectedDraftRevision: state.draft.revision,
  });
  await brand.uploadTypefaceFace({
    branding: 'default',
    slot: 'regular',
    bytes: await readFile(path.resolve(__dirname, '../../../../../test/bruno/test-font-regular.woff2')),
    originalFilename: 'regular.woff2',
    expectedDraftRevision: (await brand.getAdminState('default')).draft.revision,
    actor: admin,
  });
  await stabilize(f);
  await f.data.reference.queries.get().create(Object.assign(new BrandingModel(), f.brand), 'owned', {
    name: 'owned',
    collectionName: 'record',
    brandIdFieldPath: 'metaMetadata.brandId',
    resultObjectMapping: {},
    mongoQuery: {},
    queryParams: {},
  });
  await settleMutationWork(f);
  return integrationIds(f);
}
export async function integrationIds(f: Fixture) {
  const row = async (name: string, query: Document = {}) => {
    const value = await f.client.db().collection(name).findOne(query);
    assert(value, name);
    return value;
  };
  const v = await row('vocabulary', { slug: 'owned' }),
    entry = await row('vocabularyentry', { vocabulary: v._id });
  const source = await row('figsharevocabularysource'),
    crosswalk = await row('figsharevocabularycrosswalk'),
    run = await row('figsharevocabularysyncrun', { state: 'previewed' }),
    version = await row('brandingconfighistory');
  return {
    vocabulary: String(v._id),
    entry: String(entry._id),
    source: String(source._id),
    crosswalk: String(crosswalk._id),
    run: String(run._id),
    version: String(version._id),
    remoteHash: String(run.remoteHash),
    revision: Number(crosswalk.workingRevision),
  };
}
export type IntegrationIds = Awaited<ReturnType<typeof integrationIds>>;
export async function normalizeIntegrations(f: Fixture, response: Wire, headEntityText?: string) {
  const base = await normalizeMutation(f, response, headEntityText),
    state: Record<string, unknown[]> = {};
  for (const name of integrationCollections) state[name] = await f.client.db().collection(name).find({}).toArray();
  const ids = new Map<string, string>();
  for (const [name, rows] of Object.entries(state))
    for (const row of rows as Document[])
      if (row._id && !String(row._id).startsWith('000000000000000000'))
        ids.set(String(row._id), name + ':' + String(row.name ?? row.label ?? row.categoryId ?? row.state ?? 'row'));
  const clean = (v: unknown, key = ''): unknown => {
    if (v instanceof ObjectId) return ids.get(v.toHexString()) ?? v.toHexString();
    if (v instanceof Date) return '<time>';
    if (Array.isArray(v)) return v.map(x => clean(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, k)]));
    if (
      [
        'uploadedAt',
        'dateCreated',
        'dateModified',
        'createdAt',
        'updatedAt',
        'lastSyncedAt',
        'firstSeenAt',
        'lastSeenAt',
        'expiresAt',
        'appliedAt',
        'approvedAt',
        'timestamp',
      ].includes(key) &&
      v != null
    )
      return '<time>';
    if (key === 'token' || key === 'previewToken') return '<preview-token>';
    if (typeof v !== 'string') return v;
    let text = v;
    for (const [id, label] of ids) text = text.split(id).join(label);
    if (key === 'url' || key === 'previewUrl')
      text = text
        .replace(/([?&]token=)[^&]+/, '$1<preview-token>')
        .replace(/(\/preview\/)[a-f0-9]{32}(\.css)/, '$1<preview-token>$2');
    return text.replace(/Message Id: <[^>]+>/g, 'Message Id: <generated>');
  };
  let text = headEntityText ?? base.wire.text;
  try {
    text = JSON.stringify(clean(JSON.parse(text)));
  } catch {}
  const headers = clean(base.wire.headers) as Record<string, unknown>;
  if (headers['content-length']) headers['content-length'] = String(Buffer.byteLength(text));
  if (typeof headers.etag === 'string' && headers.etag.startsWith('W/')) {
    if (response.text || headEntityText)
      assert.equal(response.headers.etag, require('etag')(Buffer.from(headEntityText ?? response.text)));
    headers.etag = response.text || headEntityText ? require('etag')(Buffer.from(text)) : headers.etag;
  }
  for (const [name, rows] of Object.entries(state))
    state[name] = rows.map(row => clean(row)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // Audits carry resource identities in their serialized context.
  const stableState = clean(base.state);
  return {
    wire: { ...base.wire, headers, text: headEntityText === undefined ? text : '' },
    state: { ...(stableState as object), ...state },
  };
}
