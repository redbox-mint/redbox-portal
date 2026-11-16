import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import sinon from 'sinon';
import supertest from 'supertest';
import { recordGraphql } from '@researchdatabox/redbox-core';

describe('Record GraphQL through the portal', function () {
  this.timeout(60_000);
  const suffix = randomUUID();
  const username = `graphql-viewer-${suffix}`;
  const token = `graphql-token-${suffix}`;
  const path = '/default/rdmp/api/graphql';
  const oids = ['draft', 'queued', 'published', 'denied', 'foreign'].map(stage => `graphql-${stage}-${suffix}`);
  let app: Parameters<typeof supertest>[0];
  let userId: string;
  let pathRuleId: string;
  let originalConfig;
  let caller;
  let formBefore;
  let formId: string;
  let graphql;

  async function request(query: string, bearer = token) {
    return supertest(app)
      .post(path)
      .set('Authorization', `Bearer ${bearer}`)
      .set('Accept', 'application/graphql-response+json')
      .send({ query });
  }
  function member(sdl: string, stage: string): string {
    const name = new RegExp(`type (M_dataPublication_${stage}_[a-f0-9]+)`).exec(sdl)?.[1];
    assert.ok(name, sdl);
    return name;
  }
  before(async () => {
    app = (sails.hooks.http as { app: Parameters<typeof supertest>[0] }).app;
    originalConfig = sails.config.recordGraphql;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true };
    graphql = sails.services.recordgraphqlservice;
    assert.equal(typeof graphql.execute, 'function');
    const brand = BrandingService.getDefault();
    const role = RolesService.getRole(brand, 'Researcher');
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'GraphQL viewer', `${username}@example.edu.au`, 'RBTest123!')
    );
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(user.id, [role.id]));
    await firstValueFrom(UsersService.setUserKey(user.id, token));
    caller = { brand, portal: 'rdmp', user: { ...user, roles: [role] }, roles: [role] };
    const rule = await PathRule.create({ path, role: role.id, branding: brand.id, can_read: true }).fetch();
    pathRuleId = String(rule.id);
    await firstValueFrom(PathRulesService.loadRules());
    for (const [index, stage] of ['draft', 'queued', 'published', 'denied', 'foreign'].entries()) {
      await Record.create({
        redboxOid: oids[index],
        metadata: { title: `Stored ${stage}`, legacy: 'Retained REST data' },
        metaMetadata: {
          brandId: stage === 'foreign' ? 'other-brand' : brand.id,
          type: 'dataPublication',
          form: `dataPublication-1.0-${index < 3 ? stage : 'draft'}`,
        },
        workflow: { stage: index < 3 ? stage : 'draft' },
        authorization: {
          view: stage === 'denied' ? [] : [username],
          edit: [],
          viewRoles: [],
          editRoles: [],
          editPending: [],
          viewPending: [],
        },
      });
    }
  });
  afterEach(() => sinon.restore());
  after(async () => {
    if (formId && formBefore) await Form.updateOne({ id: formId }).set({ configuration: formBefore });
    sails.config.recordGraphql = originalConfig;
    await Record.destroy({ redboxOid: oids });
    if (userId) await User.destroy({ id: userId });
    if (pathRuleId) await PathRule.destroy({ id: pathRuleId });
    await firstValueFrom(PathRulesService.loadRules());
  });

  for (const [index, stage] of ['draft', 'queued', 'published'].entries())
    it(`reads the checked-in ${stage} publication form with a real bearer viewer`, async () => {
      // Checked-in publication forms are title-only stubs, not institution fixtures.
      const type = member(await graphql.describeReadSchema(caller), stage);
      const result = await request(
        `{ record(oid:"${oids[index]}") { oid recordType workflowStep form metadata { ... on ${type} { title } } } }`
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.errors, undefined);
      assert.deepEqual(result.body.data.record.metadata, { title: `Stored ${stage}` });
      assert.equal(result.headers['content-type'].split(';')[0], 'application/graphql-response+json');
      assert.equal(result.headers['cache-control'], 'private, no-store');
    });
  it('rejects absent and invalid bearer authentication', async () => {
    const body = { query: `{ record(oid:"${oids[0]}") { oid } }` };
    for (const bearer of ['', 'invalid']) {
      const req = supertest(app).post(path).send(body);
      if (bearer) req.set('Authorization', `Bearer ${bearer}`);
      const result = await req;
      assert.equal(result.status, 401, JSON.stringify(result.body));
      assert.equal(result.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    }
  });
  it('requires an explicit matching read rule even when a caller can view the record', async () => {
    const original = PathRulesService.getRulesFromPath;
    sinon
      .stub(PathRulesService, 'getRulesFromPath')
      .callsFake((target, brand) => (target === path ? null : original(target, brand)));
    const result = await request(`{ record(oid:"${oids[0]}") { oid } }`);
    assert.equal(result.status, 403);
    assert.equal(result.body.errors[0].extensions.code, 'FORBIDDEN');
  });
  it('denies records and conceals foreign-brand and missing records', async () => {
    for (const [oid, code] of [
      [oids[3], 'FORBIDDEN'],
      [oids[4], 'NOT_FOUND'],
      [`missing-${suffix}`, 'NOT_FOUND'],
    ]) {
      const result = await request(`{ record(oid:"${oid}") { oid } }`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.record, null);
      assert.equal(result.body.errors[0].extensions.code, code);
    }
  });
  it('uses the runtime RecordsService read override and one read for repeated aliases', async () => {
    const records = sails.services.recordsservice;
    const getMeta = sinon.spy(records, 'getMeta');
    const view = sinon.spy(records, 'hasViewAccess');
    const result = await request(
      `{ first: record(oid:"${oids[0]}") { oid } second: record(oid:"${oids[0]}") { oid } }`
    );
    assert.equal(result.status, 200);
    assert.equal(getMeta.callCount, 1);
    assert.equal(view.callCount, 1);
    view.restore();
    sinon.stub(records, 'hasViewAccess').returns(false);
    const denied = await request(`{ record(oid:"${oids[0]}") { oid } }`);
    assert.equal(denied.body.errors[0].extensions.code, 'FORBIDDEN');
  });
  it('rejects excessive aliases, introspection, mutations and batches before reading storage', async () => {
    const reads = sinon.spy(sails.services.recordsservice, 'getMeta');
    for (const query of [
      `{ ${Array.from({ length: 6 }, (_, i) => `r${i}: record(oid:"${oids[0]}") { oid }`).join(' ')} }`,
      '{ __schema { queryType { name } } }',
      `mutation { record(oid:"${oids[0]}") { oid } }`,
    ]) {
      const result = await request(query);
      assert.equal(result.status, 400);
      assert.ok(result.body.errors);
    }
    const batch = await supertest(app)
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send([{ query: '{ __typename }' }]);
    assert.equal(batch.status, 400);
    assert.equal(reads.callCount, 0);
  });
  it('rebuilds types after a persisted form edit and preserves REST defaults', async () => {
    const brand = BrandingService.getDefault();
    const form = await firstValueFrom(FormsService.getFormByName('dataPublication-1.0-draft', true, brand.id));
    assert.ok(form?.configuration);
    formId = String(form.id);
    formBefore = form.configuration;
    const before = await graphql.describeReadSchema(caller);
    const type = member(before, 'draft');
    await Form.updateOne({ id: formId }).set({
      configuration: {
        ...form.configuration,
        componentDefinitions: [
          ...form.configuration.componentDefinitions,
          {
            name: 'synthetic_added',
            component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: {} },
          },
        ],
      },
    });
    const after = await graphql.describeReadSchema(caller);
    assert.ok(after.includes(type));
    assert.ok(after.includes('synthetic_added: String'));
    const result = await request(
      `{ record(oid:"${oids[0]}") { metadata { ... on ${type} { title synthetic_added } } } }`
    );
    assert.deepEqual(result.body.data.record.metadata, { title: 'Stored draft', synthetic_added: null });
    // Grant REST route access separately, then verify unprojected metadata still includes legacy fields.
    const role = RolesService.getRole(brand, 'Researcher');
    const rule = await PathRule.create({
      path: '/default/rdmp/api/records/metadata/:oid',
      role: role.id,
      branding: brand.id,
      can_read: true,
    }).fetch();
    try {
      await firstValueFrom(PathRulesService.loadRules());
      const rest = await supertest(app)
        .get(`/default/rdmp/api/records/metadata/${oids[0]}`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(rest.status, 200, JSON.stringify(rest.body));
      assert.ok(JSON.stringify(rest.body).includes('Retained REST data'));
    } finally {
      await PathRule.destroy({ id: rule.id });
      await firstValueFrom(PathRulesService.loadRules());
    }
  });
  it('returns a raw GraphQL response independent of REST API version and fails closed when disabled', async () => {
    const result = await supertest(app)
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-API-Version', '2.0')
      .send({ query: `{ record(oid:"${oids[0]}") { oid } }` });
    assert.equal(result.status, 200);
    assert.equal(result.body.meta, undefined);
    assert.ok(result.body.data.record);
    sails.config.recordGraphql = { ...recordGraphql, enabled: false };
    try {
      assert.equal((await request(`{ record(oid:"${oids[0]}") { oid } }`)).status, 503);
    } finally {
      sails.config.recordGraphql = { ...recordGraphql, enabled: true };
    }
  });
});
