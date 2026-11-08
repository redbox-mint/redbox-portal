import assert from 'node:assert/strict';
import { request } from 'node:http';
import { ObjectId } from 'mongodb';
import { setTimeout as delay } from 'node:timers/promises';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { packed, preparePilot, fixture, login, normalize, target } from './pilotMongoFixture';

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Case = {
  name: string;
  method: 'GET' | 'HEAD' | 'PUT';
  query?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  condition?: string;
  denial?: 'anonymous' | 'csrf' | 'reader' | 'foreign-role' | 'foreign-brand' | 'no-view' | 'no-edit' | 'not-found';
  race?: 'view' | 'edit';
  status?: number;
  prelude?: boolean;
  fault?: 'read' | 'mutation';
};
const cases: Case[] = [];
const readQueries: [string, number][] = [
  ['', 200],
  ['include=relationships', 200],
  ['include=metadata,relationships', 200],
  ['include=metadata', 200],
  ['includeRelationships=true', 200],
  ['includeRelationships=false', 200],
  ['includeRelationships=TRUE', 200],
  ['includeRelationships=1', 200],
  ['includeRelationships=', 200],
  ...['0', '1', '2', '', '02'].map(
    value => ['include=relationships&relationshipDepth=' + value, 200] as [string, number]
  ),
  ...['-1', '1.5', 'nope', '9007199254740992'].map(
    value => ['include=relationships&relationshipDepth=' + value, 400] as [string, number]
  ),
  ...['links', 'missing', 'links,missing', ''].map(
    value => ['include=relationships&relationshipIds=' + value, 200] as [string, number]
  ),
  ...['dataRecord', 'missing', 'dataRecord,missing', ''].map(
    value => ['include=relationships&recordTypes=' + value, 200] as [string, number]
  ),
  ...['summary', 'SUMMARY', 'full', 'unknown', ''].map(
    value => ['include=relationships&fields=' + value, 200] as [string, number]
  ),
  ...['include', 'includeRelationships', 'relationshipDepth', 'relationshipIds', 'recordTypes', 'fields'].flatMap(
    key => [
      ['include=relationships&' + key + '[nested]=bad', key === 'includeRelationships' ? 200 : 400] as [string, number],
      ['include=relationships&' + key + '=a&' + key + '=b', key === 'includeRelationships' ? 200 : 400] as [
        string,
        number,
      ],
    ]
  ),
  ['relationshipDepth=-1&fields[nested]=ignored', 200],
  ['includeRelationships[nested]=bad', 400],
  ['includeRelationships=a&includeRelationships=b', 400],
];
const conditionals: [string, number][] = [
  ['none-match', 304],
  ['none-match-weak', 304],
  ['none-match-list', 304],
  ['none-match-star', 304],
  ['none-match-other', 200],
  ['none-match-invalid', 200],
  ['none-match-no-cache', 200],
  ['match', 200],
  ['match-stale', 200],
  ['match-star', 200],
  ['match-invalid', 200],
  ['modified-old', 200],
  ['modified-future', 200],
  ['modified-invalid', 200],
  ['none-match-and-modified', 304],
];
for (const method of ['GET', 'HEAD'] as const) {
  for (const [query, status] of readQueries)
    cases.push({ name: method + ' query ' + (query || '(none)'), method, query, status });
  for (const [condition, status] of conditionals)
    cases.push({ name: method + ' conditional ' + condition, method, condition, status });
  for (const denial of ['anonymous', 'reader', 'foreign-role', 'foreign-brand', 'no-view', 'not-found'] as const)
    cases.push({
      name: method + ' denial ' + denial,
      method,
      denial,
      status: denial === 'anonymous' ? 401 : denial === 'not-found' ? 404 : 403,
    });
}
const putQueries: [string, unknown, number | undefined][] = [
  ['', { title: 'Replacement' }, 200],
  ['merge=true', { title: 'Merge', list: [2] }, 200],
  ['merge=false', { title: 'Replace', list: [2] }, 200],
  ['merge=1', { title: 'Numeric true' }, 400],
  ['merge=0', { title: 'Numeric false' }, 400],
  ['merge=nope', { title: 'Invalid merge' }, 400],
  ['merge[nested]=true', { title: 'Invalid merge' }, 400],
  ['merge=true&merge=false', { title: 'Duplicate merge' }, 400],
  ['datastreams=true', { title: 'Datastream true' }, 200],
  ['datastreams=false', { title: 'Datastream false' }, 200],
  ['datastreams=1', { title: 'Datastream numeric' }, 400],
  ['datastreams=0', { title: 'Datastream numeric false' }, 400],
  ['datastreams=nope', { title: 'Invalid datastream' }, 400],
  ['datastreams[nested]=true', { title: 'Nested datastream' }, 400],
  ['datastreams=true&datastreams=false', { title: 'Duplicate datastream' }, 400],
  ['operation=submit', { title: 'Operation' }, undefined],
  ['operation=', { title: 'Empty operation' }, 400],
  ['operation=invalid%20operation', { title: 'Invalid operation' }, 400],
  ['operation[nested]=submit', { title: 'Nested operation' }, 400],
  ['operation=one&operation=two', { title: 'Duplicate operation' }, 400],
  ['', { title: 'Body merge fallback', merge: true, list: [2] }, 200],
  ['', { title: 'Body replace fallback', merge: false }, 200],
  ['', { title: 'Body datastream fallback', datastreams: true }, 200],
  ['', { title: 'Body datastream false fallback', datastreams: false }, 200],
  ['', { title: 'Invalid datastream fallback', datastreams: 'nope' }, 400],
  ['merge=false', { title: 'Query takes precedence', merge: true }, 200],
  ['', { title: 'Invalid fallback', merge: 'nope' }, 400],
  ['targetStep=draft', { title: 'Target workflow' }, undefined],
  ['targetStep=missing', { title: 'Missing target workflow' }, undefined],
  ['targetStep[nested]=draft', { title: 'Nested target workflow' }, 200],
  ['targetStep=draft&targetStep=missing', { title: 'Duplicate target workflow' }, 200],
  ['targetStep=%01', { title: 'Control character target workflow' }, 200],
  ['unknown=preserved', { title: 'Unknown query' }, 200],
  ['', [], 400],
  ['', 'text', 400],
  ['', 1, 400],
  ['', null, 400],
  ['', {}, undefined],
];
for (const [query, body, status] of putQueries)
  cases.push({ name: 'PUT query/body ' + (query || JSON.stringify(body)), method: 'PUT', query, body, status });
for (const condition of [
  'match',
  'match-stale',
  'match-missing',
  'match-star',
  'match-weak',
  'match-list',
  'match-invalid',
  'match-foreign',
  'none-match',
  'none-match-star',
  'modified-old',
  'modified-future',
  'modified-invalid',
  'match-and-none',
  'match-and-modified',
])
  cases.push({
    name: 'PUT conditional ' + condition,
    method: 'PUT',
    condition,
    body: { title: 'Conditional' },
    status:
      condition === 'match-stale'
        ? 412
        : condition === 'match-missing'
          ? 428
          : ['match-star', 'match-weak', 'match-list', 'match-invalid', 'match-foreign'].includes(condition)
            ? 400
            : 200,
  });
const uuid = '10000000-0000-4000-8000-000000000001',
  previous = '10000000-0000-4000-8000-000000000002';
for (const [name, headers, status] of [
  ['save ID', { 'X-ReDBox-Save-Request-Id': uuid }, 200],
  ['invalid save ID', { 'X-ReDBox-Save-Request-Id': 'not-a-uuid' }, 200], // current API replaces a malformed correlation ID
  ['overlong save ID', { 'X-ReDBox-Save-Request-Id': 'a'.repeat(200) }, 400],
  ['direct resolution', { 'X-ReDBox-Concurrency-Resolution': 'direct' }, 200],
  [
    'auto merge resolution',
    {
      'X-ReDBox-Concurrency-Resolution': 'client-auto-merged',
      'X-ReDBox-Save-Request-Id': uuid,
      'X-ReDBox-Resolution-Of-Request-Id': previous,
    },
    200,
  ],
  [
    'manual resolution',
    {
      'X-ReDBox-Concurrency-Resolution': 'client-manually-resolved',
      'X-ReDBox-Save-Request-Id': uuid,
      'X-ReDBox-Resolution-Of-Request-Id': previous,
    },
    200,
  ],
  ['invalid resolution', { 'X-ReDBox-Concurrency-Resolution': 'server-forced' }, 400],
  ['missing linkage', { 'X-ReDBox-Concurrency-Resolution': 'client-auto-merged' }, 400],
  [
    'same request linkage',
    {
      'X-ReDBox-Concurrency-Resolution': 'client-auto-merged',
      'X-ReDBox-Save-Request-Id': uuid,
      'X-ReDBox-Resolution-Of-Request-Id': uuid,
    },
    400,
  ],
  ['unsolicited linkage', { 'X-ReDBox-Resolution-Of-Request-Id': previous }, 400],
  ['matching schema', { 'X-ReDBox-Record-Schema-If-Match': '<schema>' }, 200],
  ['stale schema', { 'X-ReDBox-Record-Schema-If-Match': '"sha256:' + 'a'.repeat(64) + '"' }, 412],
  ['invalid schema', { 'X-ReDBox-Record-Schema-If-Match': 'invalid' }, 400],
  ['irrelevant browser fingerprint', { 'X-ReDBox-Form-Fingerprint': 'invalid' }, 200],
] as [string, Record<string, string>, number][])
  cases.push({ name: 'PUT header ' + name, method: 'PUT', headers, body: { title: name }, status });
for (const rawBody of ['', '{', '{"title":'])
  cases.push({ name: 'PUT JSON text ' + JSON.stringify(rawBody), method: 'PUT', rawBody, status: rawBody ? 400 : 200 });
for (const denial of [
  'anonymous',
  'csrf',
  'reader',
  'foreign-role',
  'foreign-brand',
  'no-view',
  'no-edit',
  'not-found',
] as const)
  cases.push({
    name: 'PUT denial ' + denial,
    method: 'PUT',
    denial,
    body: { title: 'Denied' },
    status: denial === 'anonymous' ? 401 : denial === 'not-found' ? 400 : 403,
  });
for (const race of ['view', 'edit'] as const)
  cases.push({
    name: 'PUT racing ' + race + ' revocation',
    method: 'PUT',
    race,
    body: { title: 'Must not persist' },
    status: 403,
  });
for (const query of ['apiVersion=1.0', 'apiVersion=2.0', 'apiversion=1.0', 'apiversion=2.0', 'apiVersion=unknown'])
  cases.push({ name: 'GET version negotiation ' + query, method: 'GET', query, status: 200 });

for (const method of ['GET', 'HEAD', 'PUT'] as const)
  cases.push({
    name: method + ' BigInt serialization fault',
    method,
    fault: method === 'PUT' ? 'mutation' : 'read',
    body: method === 'PUT' ? { title: 'Persisted before response fault' } : undefined,
    status: 500,
  });
for (const method of ['GET', 'HEAD'] as const)
  cases.push({
    name: method + ' conditional BigInt serialization fault',
    method,
    fault: 'read',
    condition: 'none-match',
    status: 500,
  });
// Deliberately omit brandActor and checkAuth: these exercise the action's own
// actor/brand-role guard, not an earlier policy refusal masking its precedence.
for (const denial of [
  undefined,
  'anonymous',
  'foreign-role',
  'foreign-brand',
  'reader',
  'no-view',
  'no-edit',
  'csrf',
] as const)
  for (const [label, query, body] of [
    ['valid', '', { title: 'Valid' }],
    ['array body', '', []],
    ['invalid merge', 'merge=nope', { title: 'Invalid' }],
    ['both invalid', 'merge=nope', []],
  ] as const)
    cases.push({
      name: 'PUT prelude ' + (denial ?? 'authorized') + ' × ' + label,
      method: 'PUT',
      denial,
      query,
      body,
      prelude: true,
      status:
        denial === 'anonymous'
          ? 401
          : ['foreign-role', 'foreign-brand', 'csrf'].includes(denial ?? '')
            ? 403
            : label === 'valid'
              ? denial === 'no-view' || denial === 'no-edit'
                ? 403
                : 200
              : 400,
    });

const portableHeaders = [
  'content-type',
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'content-security-policy',
  'cache-control',
  'pragma',
  'expires',
  'etag',
  'link',
  'last-modified',
  'vary',
  'allow',
  'www-authenticate',
];
async function raw(url: string, method: string, headers: Record<string, string>, body?: string) {
  return new Promise<{ status: number; headers: Record<string, string | null>; body: unknown; bytes?: string }>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method,
          headers: { ...headers, ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }) },
        },
        res => {
          const bytes: Buffer[] = [];
          res.on('data', part => bytes.push(part));
          res.on('end', () => {
            const text = Buffer.concat(bytes).toString();
            resolve({
              bytes: text,
              status: res.statusCode!,
              headers: Object.fromEntries(
                portableHeaders.map(name => [name, res.headers[name] == null ? null : String(res.headers[name])])
              ),
              body: text ? JSON.parse(text) : null,
            });
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(20000, () => req.destroy(new Error('HTTP request deadline')));
      req.end(body);
    }
  );
}
function conditionHeaders(kind: string | undefined, tag: string) {
  const stale = formatRecordEntityTag('fm019-record', 999);
  const headers: Record<string, string> = {};
  if (kind?.startsWith('none-match') || kind === 'match-and-none')
    headers['If-None-Match'] =
      kind === 'none-match-star'
        ? '*'
        : kind === 'none-match-weak'
          ? 'W/' + tag
          : kind === 'none-match-list'
            ? '"other", ' + tag
            : kind === 'none-match-other'
              ? '"other"'
              : kind === 'none-match-invalid'
                ? 'invalid'
                : tag;
  if (kind === 'none-match-no-cache') headers['Cache-Control'] = 'no-cache';
  if (kind?.startsWith('modified') || kind === 'none-match-and-modified' || kind === 'match-and-modified')
    headers['If-Modified-Since'] =
      kind === 'modified-old'
        ? 'Thu, 01 Jan 1970 00:00:00 GMT'
        : kind === 'modified-invalid'
          ? 'invalid'
          : 'Thu, 01 Jan 2099 00:00:00 GMT';
  if (kind?.startsWith('match') && kind !== 'match-missing')
    headers['If-Match'] =
      kind === 'match-stale'
        ? stale
        : kind === 'match-star'
          ? '*'
          : kind === 'match-weak'
            ? 'W/' + tag
            : kind === 'match-list'
              ? tag + ', ' + stale
              : kind === 'match-invalid'
                ? 'invalid'
                : kind === 'match-foreign'
                  ? formatRecordEntityTag('other-record', 0)
                  : tag;
  return headers;
}
async function run(native: boolean, version: string, retainedExpress = false, prelude = false) {
  const f = await fixture(native, {
    retainedExpress,
    ...(prelude ? { policyConfiguration: { '*': ['noCache', 'brandingAndPortal', 'isWebServiceAuthenticated'] } } : {}),
  });
  if (retainedExpress && 'baselineHashes' in f)
    console.log('FM019 retained Express SHA256 ' + JSON.stringify(f.baselineHashes));
  try {
    const auth = await login(f, native),
      db = f.native.db(),
      collection = db.collection('record');
    const refs = getReferenceRepositories(f.owner),
      type = await refs.recordTypes.findByName(f.brand.id, 'dataRecord');
    await refs.recordTypes.reviseDefinition(type!.id!, {
      relatedTo: [
        {
          id: 'links',
          recordType: 'dataRecord',
          localField: 'metadata.links',
          foreignField: 'redboxOid',
          direction: 'inbound',
        },
      ],
    });
    for (const [oid, visible, foreign] of [
      ['related-record', true, false],
      ['private-record', false, false],
      ['foreign-record', true, true],
    ] as const)
      await f.storage.create(
        Object.assign(new BrandingModel(), foreign ? f.otherBrand : f.brand),
        {
          redboxOid: oid,
          metadata: { title: oid, secret: !visible ? 'PRIVATE-SECRET' : undefined },
          metaMetadata: { brandId: foreign ? f.otherBrand.id : f.brand.id, type: 'dataRecord' },
          authorization: { edit: [], view: visible ? ['pilot-admin'] : [], editRoles: [], viewRoles: [] },
        },
        'dataRecord'
      );
    await collection.updateOne(
      { redboxOid: 'fm019-record' },
      {
        $set: {
          'metadata.links': ['related-record', 'private-record', 'foreign-record'],
          'metadata.list': [1],
          'workflow.stage': 'draft',
        },
      }
    );
    // Keep physical and incarnation identities deterministic as well as actor IDs.
    // Relationship projections expose these fields; compare them without erasure.
    for (const [index, oid] of ['fm019-record', 'related-record', 'private-record', 'foreign-record'].entries()) {
      const record = (await collection.findOne({ redboxOid: oid }))!;
      const incarnationId = '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0');
      await collection.deleteOne({ _id: record._id });
      await collection.insertOne({
        ...record,
        _id: new ObjectId(String(100 + index).padStart(24, '0')),
        incarnationId,
      });
      await db.collection('recordidentity').updateOne({ redboxOid: oid }, { $set: { incarnationId } });
    }
    const baseline = (await collection.findOne({ redboxOid: 'fm019-record' }))!;
    const observations = [];
    for (const c of cases.filter(c => !!c.prelude === prelude)) {
      await collection.replaceOne({ redboxOid: 'fm019-record' }, baseline, { upsert: true });
      await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id] });
      const initial = await raw(f.url + target, 'GET', { 'X-ReDBox-Api-Version': version, Cookie: auth.cookie });
      assert.equal(initial.status, 200, JSON.stringify({ native, retainedExpress, initial }));
      assert(initial.headers.link, JSON.stringify({ native, retainedExpress, initial }));
      const tag = initial.headers.etag!;
      const schema = '"sha256:' + initial.headers.link!.split('/schemas/')[1].split('>')[0] + '"';
      let path = target + (c.query ? '?' + c.query : '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-ReDBox-Api-Version': version,
        Cookie: auth.cookie,
        'X-CSRF-Token': auth.token,
      };
      if (c.method === 'PUT' && c.condition !== 'match-missing') headers['If-Match'] = tag;
      Object.assign(headers, conditionHeaders(c.condition, tag), c.headers);
      if (headers['X-ReDBox-Record-Schema-If-Match'] === '<schema>')
        headers['X-ReDBox-Record-Schema-If-Match'] = schema;
      if (c.denial === 'anonymous') delete headers.Cookie;
      if (c.denial === 'csrf') delete headers['X-CSRF-Token'];
      if (c.denial === 'reader') await f.identities.update('user', { id: f.user.id }, { roles: [f.reader.id] });
      if (c.denial === 'foreign-role') {
        const role = await f.identities.create('role', {
          name: 'Foreign-' + cases.indexOf(c),
          branding: f.otherBrand.id,
        });
        await f.identities.update('user', { id: f.user.id }, { roles: [role.id] });
      }
      if (c.denial === 'foreign-brand') path = path.replace('/default/', '/other/');
      if (c.denial === 'no-view' || c.denial === 'no-edit')
        await collection.updateOne(
          { redboxOid: 'fm019-record' },
          { $set: { 'authorization.edit': [], 'authorization.view': c.denial === 'no-view' ? [] : ['pilot-admin'] } }
        );
      if (c.denial === 'not-found') path = path.replace('fm019-record', 'missing-record');
      const before = await collection.findOne({ redboxOid: 'fm019-record' }),
        auditBefore = await db.collection('recordaudit').countDocuments();
      const update = f.writer.updateMeta;
      const readMeta = f.storage.getMeta;
      if (c.race)
        f.writer.updateMeta = async (...args: Parameters<typeof update>) => {
          await collection.updateOne(
            { redboxOid: 'fm019-record' },
            { $set: { 'authorization.edit': [], 'authorization.view': c.race === 'view' ? [] : ['pilot-admin'] } }
          );
          return update.apply(f.writer, args);
        };
      if (c.fault === 'read')
        f.storage.getMeta = async (...args: Parameters<typeof readMeta>) => {
          const record = await readMeta.apply(f.storage, args);
          return Object.assign(record, { metadata: { ...record.metadata, fault: 1n } });
        };
      if (c.fault === 'mutation')
        f.writer.updateMeta = async (...args: Parameters<typeof update>) => {
          const result = await update.apply(f.writer, args);
          result.setProjectedMetadata({ ...result.metadata, fault: 1n });
          return result;
        };
      let result: Awaited<ReturnType<typeof raw>>;
      try {
        result = await raw(
          f.url + path,
          c.method,
          headers,
          c.rawBody ?? (c.body === undefined ? undefined : JSON.stringify(c.body))
        );
      } finally {
        f.writer.updateMeta = update;
        f.storage.getMeta = readMeta;
      }
      if (!c.fault) delete result.bytes;
      if (c.method === 'PUT' && (result.status === 200 || c.fault === 'mutation')) {
        for (let i = 0; i < 100 && (await db.collection('recordaudit').countDocuments()) <= auditBefore; i++)
          await delay(20);
      }
      const saved = await collection.findOne({ redboxOid: 'fm019-record' });
      const select = (value: typeof saved) =>
        value && {
          metadata: value.metadata,
          revision: value.revision,
          authorization: value.authorization,
          workflow: value.workflow,
          metaMetadata: value.metaMetadata,
        };
      observations.push(
        normalize(
          {
            result,
            before: select(before),
            saved: select(saved),
            auditDelta: (await db.collection('recordaudit').countDocuments()) - auditBefore,
            schemaReferences: await db.collection('recordschemareference').countDocuments({ oid: 'fm019-record' }),
          },
          f
        )
      );
    }
    console.log(
      'FM019 metadata composition complete ' +
        JSON.stringify({ native, retainedExpress, version, cases: observations.length })
    );
    return observations;
  } finally {
    await f.close();
  }
}

describe('FM-019 complete metadata raw HTTP retained differential', function () {
  this.timeout(900000);
  let results: unknown[][][];
  before(async () => {
    await preparePilot();
    results = [];
    for (const version of ['1.0', '2.0']) {
      const pair = [];
      for (const [native, retained] of [
        [false, true],
        [false, false],
        [true, false],
      ])
        pair.push([...(await run(native, version, retained)), ...(await run(native, version, retained, true))]);
      results.push(pair);
    }
  });
  after(async () => {
    await packed?.close();
  });
  for (const [v, version] of ['1.0', '2.0'].entries())
    for (const [i, c] of cases.entries())
      it('API ' + version + ' ' + c.name, () => {
        const native = results[v][2][i] as {
          result: Awaited<ReturnType<typeof raw>>;
          before: { metadata: unknown; revision: number };
          saved: { metadata: unknown; revision: number };
          auditDelta: number;
        };
        assert.deepEqual(results[v][1][i], results[v][0][i], 'Refactored Express changed');
        assert.deepEqual(results[v][2][i], results[v][0][i], 'Fastify differs from retained Express');
        if (c.status !== undefined)
          assert.equal(
            native.result.status,
            c.race === 'edit' && version === '1.0' ? 500 : c.status,
            JSON.stringify(native.result)
          );
        if (c.method !== 'PUT' || (native.result.status >= 400 && c.fault !== 'mutation')) {
          assert.deepEqual(native.saved.metadata, native.before.metadata);
          assert.equal(native.saved.revision, native.before.revision);
          assert.equal(native.auditDelta, 0);
        } else {
          assert.equal(native.saved.revision, native.before.revision + 1);
          assert(native.auditDelta >= 1);
        }
        if (c.fault) {
          const detail = c.fault === 'read' ? 'Record read failed.' : 'Record mutation failed';
          assert.equal(
            native.result.bytes,
            c.method === 'HEAD'
              ? ''
              : version === '1.0'
                ? JSON.stringify({ message: detail, details: '' })
                : JSON.stringify({ errors: [{ detail }], meta: {} })
          );
        }
        if (c.race === 'view' && version === '1.0')
          assert.deepEqual(native.result.body, { message: 'Not authorised.' });
        if (c.method === 'GET' && c.query === 'includeRelationships=true') {
          const payload = native.result.body as { data?: unknown };
          const projected = (version === '2.0' ? payload.data : payload) as {
            relationships: { relatedObjects: Record<string, { redboxOid: string }[]> };
          };
          const related = Object.values(projected.relationships.relatedObjects)
            .flat()
            .map(record => record.redboxOid);
          assert(related.includes('related-record'));
          assert(!related.includes('private-record'));
          assert(!related.includes('foreign-record'));
        }
        if (c.method === 'HEAD' || native.result.status === 304) assert.equal(native.result.body, null);
        assert(!JSON.stringify(native.result.body).includes('PRIVATE-SECRET'));
      });
});
