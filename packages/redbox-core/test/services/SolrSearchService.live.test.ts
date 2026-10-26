import assert from 'node:assert/strict';
import axios from 'axios';
import { solr, SOLR_EXACT_ACL_FIELDS, SOLR_EXACT_ACL_VERSION } from '../../src/config/solr.config';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { RoleModel } from '../../src/model/storage/RoleModel';
import type { RecordModel, StoredRecordAuthorization } from '../../src/model/storage/RecordModel';
import { Services } from '../../src/services/SolrSearchService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

// Point SOLR_TEST_URL at a fresh disposable core, e.g. http://127.0.0.1:18986/solr/redbox.
// Start the pinned repository image with `solr-precreate redbox`; remove it after this suite.
// All writes are index fixtures in that core. No source record storage is used.
const liveDescribe = process.env.SOLR_TEST_URL ? describe : describe.skip;

class LiveSolrSearchService extends Services.SolrSearchService {
  async loadImports(): Promise<void> {
    await this.processDynamicImports();
  }

  authParams(username: string, roles: RoleModel[], brand: BrandingModel, editOnly = false): URLSearchParams {
    const params = new URLSearchParams({ q: '*:*', fl: 'id', rows: '1000', sort: 'id asc' });
    this.addAuthParams(params, username, roles, brand, editOnly);
    return params;
  }
}

liveDescribe('SolrSearchService real Solr authorization', function () {
  this.timeout(15000);
  const brand = Object.assign(new BrandingModel(), { id: 'Brand.A' });
  let coreUrl: string;
  let service: LiveSolrSearchService;

  const role = (name: string, branding = brand) => Object.assign(new RoleModel(), { name, branding });
  const record = (id: string, grants: Partial<StoredRecordAuthorization>, brandId = brand.id): RecordModel => {
    const authorization: StoredRecordAuthorization = {
      view: [],
      edit: [],
      viewRoles: [],
      editRoles: [],
      viewPending: [],
      editPending: [],
      ...grants,
    };
    return {
      id,
      redboxOid: id,
      harvestId: '',
      metadata: { title: id },
      metaMetadata: { brandId, createdBy: 'test', type: 'rdmp', searchCore: 'default', form: '', attachmentFields: [] },
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      authorization: { ...authorization, stored: structuredClone(authorization) },
      dateCreated: '2026-01-01T00:00:00Z',
      lastSaveDate: '2026-01-01T00:00:00Z',
    };
  };
  async function ids(
    username: string,
    roles: RoleModel[] = [],
    requestedBrand = brand,
    editOnly = false
  ): Promise<string[]> {
    const { data } = await axios.get<{ response: { docs: Array<{ id: string }> } }>(`${coreUrl}/select`, {
      params: service.authParams(username, roles, requestedBrand, editOnly),
    });
    return data.response.docs.map(doc => doc.id).sort();
  }

  before(async function () {
    const endpoint = new URL(process.env.SOLR_TEST_URL!);
    coreUrl = endpoint.href.replace(/\/$/, '');
    const coreName = endpoint.pathname.split('/').filter(Boolean).at(-1)!;
    const config = structuredClone(solr);
    config.cores.default.options = {
      host: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      https: endpoint.protocol === 'https:',
      core: coreName,
    };
    setupServiceTestGlobals(
      createMockSails({ config: { solr: config, queue: { serviceName: 'agendaqueueservice' } } })
    );
    service = new LiveSolrSearchService();
    await service.loadImports();
  });

  after(function () {
    cleanupServiceTestGlobals();
  });

  it('migrates a legacy schema and verifies effective StrField defaults before indexing', async function () {
    const legacySchema = structuredClone(solr.cores.default.schema);
    legacySchema['add-field'] = legacySchema['add-field'].filter(field => !field.name.startsWith('redbox_acl2_'));
    await axios.post(`${coreUrl}/schema`, legacySchema);
    await axios.post(
      `${coreUrl}/update`,
      [{ id: 'legacy', authorization_view: ['Owner+One'], metaMetadata_brandId: brand.id }],
      {
        params: { commit: true },
      }
    );
    const before = (await axios.get(`${coreUrl}/schema`, { params: { showDefaults: true, wt: 'json' } })).data.schema;
    assert.equal(
      before.fields.some((field: { name: string }) => field.name.startsWith('redbox_acl2_')),
      false
    );
    assert.equal(before.fieldTypes.find((type: { name: string }) => type.name === 'string').class, 'solr.StrField');
    await service.init();
    const after = (await axios.get(`${coreUrl}/schema`, { params: { showDefaults: true, wt: 'json' } })).data.schema;
    for (const required of SOLR_EXACT_ACL_FIELDS) {
      const effective = after.fields.find((field: { name: string }) => field.name === required.name);
      for (const [property, value] of Object.entries(required))
        assert.equal(effective[property], value, `${required.name}.${property}`);
    }
    assert.equal(await service.index('projected', record('projected', { view: ['Owner+One'] })), true);
    assert.deepEqual(await ids('Owner+One'), ['projected']);
    // A new service reconciles the already migrated schema without changing it.
    const restarted = new LiveSolrSearchService();
    await restarted.init();
    assert.deepEqual(
      (await axios.get(`${coreUrl}/schema`, { params: { showDefaults: true, wt: 'json' } })).data.schema,
      after
    );
  });

  for (const [index, identity] of [
    'Alice.Example@Example.EDU',
    'user with spaces',
    'slash\\quote"+colon:?[x]!*',
    '$rbAclBrand',
    '{!lucene v=*:*}',
    'x" OR *:* OR authorization_view:x',
    'x&fq=*:*&rbAclUser=admin',
    'user,with,commas',
    'ユーザー',
  ].entries()) {
    it(`matches only the literal identity ${JSON.stringify(identity)} through Solr's nested term parser`, async function () {
      const id = `literal-${index}`;
      assert.equal(await service.index(id, record(id, { view: [identity] })), true);
      assert.equal(await service.index(`${id}-role`, record(`${id}-role`, { viewRoles: [identity] })), true);
      assert.deepEqual(await ids(identity), [id]);
      assert.deepEqual(await ids(`${identity}-outsider`), []);
      assert.deepEqual(await ids('', [role(identity)]), [`${id}-role`]);
      assert.deepEqual(await ids('', [role(`${identity}-outsider`)]), []);
    });
  }

  it('preserves case and punctuation boundaries for usernames', async function () {
    assert.deepEqual(await ids('alice.example@example.edu'), []);
    assert.deepEqual(await ids('Alice-Example@Example.EDU'), []);
    assert.deepEqual(await ids('Alice'), []);
  });

  it('ORs user and same-brand role grants, and restricts edit-only searches', async function () {
    const fixtures: Array<[string, Partial<StoredRecordAuthorization>]> = [
      ['or-user-view', { view: ['or-user'] }],
      ['or-user-edit', { edit: ['or-user'] }],
      ['or-role-view', { viewRoles: ['Review.Admin+Team'] }],
      ['or-role-edit', { editRoles: ['Review.Admin+Team'] }],
      ['or-other-role', { viewRoles: ['Other'] }],
      ['or-pending', { viewPending: ['or-user'], editPending: ['or-user'] }],
      ['or-denied', { view: ['someone-else'] }],
    ];
    for (const [id, grants] of fixtures) assert.equal(await service.index(id, record(id, grants)), true);
    const roles = [role('Review.Admin+Team'), role('Other', Object.assign(new BrandingModel(), { id: 'other-brand' }))];
    assert.deepEqual(await ids('or-user', roles), ['or-role-edit', 'or-role-view', 'or-user-edit', 'or-user-view']);
    assert.deepEqual(await ids('or-user', roles, brand, true), ['or-role-edit', 'or-user-edit']);
    assert.deepEqual(await ids('', [role('Review.Admin+Team')]), ['or-role-edit', 'or-role-view']);
    assert.deepEqual(await ids('', [role('review-admin team')]), []);
    assert.deepEqual(await ids('', [role('review.admin+team')]), []);
    assert.deepEqual(await ids(''), []);
  });

  it('requires Admin to have an explicit document role grant', async function () {
    assert.equal(await service.index('admin-granted', record('admin-granted', { viewRoles: ['Admin'] })), true);
    assert.deepEqual(await ids('admin', [role('Admin')]), ['admin-granted']);
  });

  it('enforces exact brand and version filters, excluding legacy and unversioned documents', async function () {
    const unusualBrand = Object.assign(new BrandingModel(), { id: 'Brand with spaces:* " OR *:*' });
    for (const brandId of [brand.id, 'brand.a', 'Brand-A', unusualBrand.id, '$rbAclVersion']) {
      assert.equal(
        await service.index(`brand-${brandId}`, record(`brand-${brandId}`, { view: ['brand-user'] }, brandId)),
        true
      );
    }
    await axios.post(
      `${coreUrl}/update`,
      [
        {
          id: 'wrong-version',
          redbox_acl2_view: ['brand-user'],
          redbox_acl2_brand: brand.id,
          redbox_acl2_version: `${SOLR_EXACT_ACL_VERSION}-old`,
        },
        { id: 'no-version', redbox_acl2_view: ['brand-user'], redbox_acl2_brand: brand.id },
        { id: 'no-brand', redbox_acl2_view: ['brand-user'], redbox_acl2_version: SOLR_EXACT_ACL_VERSION },
      ],
      { params: { commit: true } }
    );
    assert.deepEqual(await ids('brand-user'), [`brand-${brand.id}`]);
    assert.deepEqual(await ids('brand-user', [], unusualBrand), [`brand-${unusualBrand.id}`]);
    assert.deepEqual(await ids('brand-user', [], Object.assign(new BrandingModel(), { id: '$rbAclVersion' })), [
      'brand-$rbAclVersion',
    ]);
    assert.deepEqual(await ids('brand-user', [], Object.assign(new BrandingModel(), { id: '' })), []);
    assert.deepEqual(await ids('Owner+One'), ['projected']);
  });
});
