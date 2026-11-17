import { firstValueFrom } from 'rxjs';
import sinon from 'sinon';
import supertest from 'supertest';
import _ from 'lodash';
const https = require('node:https');
import { DoiPublishing } from '../../../packages/redbox-core/src/configmodels/DoiPublishing';
import {
  namedQuery,
  relatedPlanRequest,
  relatedPlanEmail,
  relatedPlanDoi,
  relatedPlanDoiProfile,
  relatedPlanPdf,
} from '../../../packages/redbox-hook-dev/src/config/related-record-examples';

/** RR-19: real lifted services, HTTP routing and native Mongo; outbound boundaries only are doubled. */
describe('Related record resolution runtime integration (RR-19)', function () {
  this.timeout(60_000);
  let brand: any, service: any, storage: any, db: any, admin: any, librarian: any;
  let agent: any, a: string, b: string, p: string;
  const oids: string[] = [],
    userIds: string[] = [];
  const token = 'rr19-isolated-api-token';
  const password = 'RR19Test123!';
  let mail: any, originalEmailDisabled: any, originalMailEnabled: any;
  let csrfToken: string;
  let originalCsrf: any;
  const context = (user = admin, audience = 'service') => ({ brand, user, audience, serviceId: 'RR19' });
  const raw = (oid: string) => db.collection('record').findOne({ redboxOid: oid });
  const snapshot = async () => ({
    record: await raw(p),
    audit: await db.collection('recordaudit').find({ redboxOid: p }).sort({ _id: 1 }).toArray(),
  });
  const fresh = () => service.getMetaWithRelatedMetadata(p, context(), relatedPlanRequest);

  async function seed(type: string, metadata: any, brandId = String(brand.id)) {
    const oid = `rr19-${type}-${Date.now()}-${oids.length}`;
    oids.push(oid);
    const result = await storage.create(
      brand,
      {
        redboxOid: oid,
        revision: 0,
        harvestId: '',
        metadata,
        metaMetadata: {
          type,
          packageType: type,
          brandId,
          createdBy: admin.username,
          form: `${type}-1.0-draft`,
          searchCore: 'default',
          attachmentFields: [],
        },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: {
          edit: [admin.username, librarian.username],
          view: [admin.username, librarian.username],
          editRoles: [],
          viewRoles: [],
          editPending: [],
          viewPending: [],
        },
      },
      {},
      admin
    );
    expect(result.success, JSON.stringify(result)).to.equal(true);
    return oid;
  }
  async function save(oid: string, metadata: any, mode: 'merge' | 'replace' = 'merge', runtime?: any) {
    const current = await service.getMeta(oid);
    return service.updateMeta(
      brand,
      oid,
      { ...current, ...(runtime ? { relatedMetadata: runtime } : {}) },
      admin,
      false,
      false,
      {},
      { metadata, mode, arrayMergeMode: 'replace' }
    );
  }
  async function form(user = admin) {
    const record = await service.getMeta(p);
    const stored = await FormsService.getForm(brand, undefined, true, 'related-plan', record);
    return FormsService.buildClientFormConfig(
      stored.configuration,
      'edit',
      user.roles.map(r => r.name),
      record.metadata,
      sails.config.reusableFormDefinitions,
      brand.name,
      {},
      { record, user, brand }
    );
  }
  async function query() {
    return NamedQueryService.performNamedQueryFromConfig(
      _.cloneDeep(namedQuery.queries.relatedPlansByActivityDate),
      { fromDate: '2026-01-01' },
      brand,
      0,
      100,
      admin
    );
  }
  before(async function () {
    brand = BrandingService.getDefault();
    service = sails.services.recordsservice;
    storage = sails.services.mongostorageservice;
    db = sails.models.record.getDatastore().manager;
    for (const [username, roles] of [
      ['related-admin', ['Admin', 'Librarians', 'Researcher']],
      ['related-librarian', ['Librarians']],
      ['related-admin-only', ['Admin']],
    ]) {
      const created: any = await firstValueFrom(
        UsersService.addLocalUser(username, username, `${username}@example.invalid`, password)
      );
      userIds.push(String(created.id));
      await firstValueFrom(UsersService.updateUserRoles(created.id, RolesService.getRoleIds(brand.roles, roles)));
    }
    admin = await User.findOne({ id: userIds[0] }).populate('roles');
    expect(admin.roles.map(role => role.name)).to.have.members(['Admin', 'Librarians', 'Researcher']);
    librarian = await User.findOne({ id: userIds[1] }).populate('roles');
    await firstValueFrom(UsersService.setUserKey(admin.id, token));
    agent = supertest.agent(sails.hooks.http.app);
    await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .send({ username: admin.username, password, branding: 'default', portal: 'rdmp' })
      .expect(200);
    // Bootstrap disables global CSRF. Enable the real middleware for this isolated suite.
    originalCsrf = sails.config.security.csrf;
    sails.config.security.csrf = true;
    csrfToken = (await agent.get('/csrfToken').query({ branding: 'default', portal: 'rdmp' }).expect(200)).body._csrf;
    expect(csrfToken).to.be.a('string');
    originalEmailDisabled = _.get(sails.config, 'services.email.disabled');
    _.set(sails.config, 'services.email.disabled', 'false');
    originalMailEnabled = sails.config.emailnotification.settings.enabled;
    sails.config.emailnotification.settings.enabled = true;
    mail = sinon.stub().resolves({ messageId: 'rr19-mock-delivery' });
    // Sails reloads modules during lift; resolve transports only after bootstrap.
    const nodemailer = require(
      require.resolve('nodemailer', { paths: [require.resolve('@researchdatabox/redbox-core')] })
    );
    sinon.stub(nodemailer, 'createTransport').returns({ sendMail: mail });
  });
  beforeEach(async function () {
    a = await seed('related-activity', { title: 'Activity A', startDate: '2026-02-01', endDate: '2026-03-01' });
    b = await seed('related-activity', { title: 'Activity B', startDate: '2025-02-01', endDate: '2025-03-01' });
    p = await seed('related-plan', {
      title: 'Example plan',
      notes: 'Local note',
      primaryActivity: a,
      activities: [{ oid: a }, { oid: b }],
    });
    mail.resetHistory();
  });
  after(async function () {
    sinon.restore();
    sails.config.security.csrf = originalCsrf;
    _.set(sails.config, 'services.email.disabled', originalEmailDisabled);
    sails.config.emailnotification.settings.enabled = originalMailEnabled;
    for (const name of ['record', 'recordaudit', 'deletedrecord', 'integrationaudit']) {
      await db.collection(name).deleteMany({ redboxOid: { $in: oids } });
    }
    if (userIds.length) await User.destroy({ id: userIds });
  });

  it('Gate D: source-only edits refresh form/API/browser/email/query/PDF inputs without a plan write', async function () {
    const before = await snapshot();
    expect((await fresh()).relatedMetadata.primaryActivity.records[0].metadata.title).to.equal('Activity A');
    expect(JSON.stringify(await query())).to.contain(p);
    const changed = await save(a, { title: 'Activity A revised', startDate: '2024-02-01' });
    expect(changed.wasPersisted(), JSON.stringify(changed)).to.equal(true);
    const enriched = await fresh();
    expect(enriched.relatedMetadata.primaryActivity.records[0].metadata).to.include({
      title: 'Activity A revised',
      startDate: '2024-02-01',
    });
    const constructed = await form();
    expect(
      constructed.relatedRecords.sources.find(s => s.relationId === 'primaryActivity').initialResult.records[0].metadata
        .title
    ).to.equal('Activity A revised');
    const api = await agent
      .get(`/default/rdmp/api/records/resolved/${p}`)
      .set('Authorization', `Bearer ${token}`)
      .query({ relations: 'primaryActivity,activities' })
      .expect(200);
    expect(api.headers['cache-control']).to.equal('private, no-store');
    expect(JSON.stringify(api.body)).to.contain('Activity A revised');
    const currentRefresh = await agent
      .post('/default/rdmp/record/relatedMetadata/resolve')
      .set('X-CSRF-Token', csrfToken)
      .set('X-Source', 'jsclient')
      .send({ oid: p, relations: ['primaryActivity'] })
      .expect(200);
    expect(JSON.stringify(currentRefresh.body)).to.contain('Activity A revised');
    expect(JSON.stringify(currentRefresh.body)).to.contain('2024-02-01');
    const refresh = await agent
      .post('/default/rdmp/record/relatedMetadata/resolve')
      .set('X-CSRF-Token', csrfToken)
      .set('X-Source', 'jsclient')
      .send({ oid: p, relations: ['primaryActivity'], references: { primaryActivity: b } })
      .expect(200);
    expect(JSON.stringify(refresh.body)).to.contain('Activity B');
    await EmailService.sendRecordNotification(
      p,
      await service.getMeta(p),
      {
        ..._.cloneDeep(relatedPlanEmail.options),
        triggerCondition: '<%= true %>',
      },
      admin,
      {}
    );
    expect(mail.calledOnce).to.equal(true);
    expect(mail.firstCall.args[0].subject).to.contain('Activity A revised');
    expect(mail.firstCall.args[0].html).to.contain('Activity A revised');
    expect(mail.firstCall.args[0].html).to.contain('2024-02-01');
    expect(JSON.stringify(await query())).not.to.contain(p);
    expect((await save(b, { startDate: '2027-02-01' })).wasPersisted()).to.equal(true);
    expect(JSON.stringify(await query())).to.contain(p);
    expect(relatedPlanPdf).to.include({ waitForRelatedData: true, readinessStrategy: 'networkIdle' });
    expect(await snapshot()).to.deep.equal(before);
  });

  it('maps current DOI v2 inputs without saving, then persists only intended DOI writeback', async function () {
    const doi = sails.services.doiservice;
    const config = new DoiPublishing();
    config.enabled = true;
    config.defaultProfile = 'related-plan';
    config.connection.baseUrl = 'https://datacite.example.invalid';
    config.connection.password = 'rr19-mock-transport-only';
    config.profiles = { 'related-plan': { ..._.cloneDeep(relatedPlanDoiProfile), enabled: true } };
    const brandingAware = sails.config.brandingAware.bind(sails.config);
    const configStub = sinon.stub(sails.config, 'brandingAware').callsFake((name: string) => ({
      ...brandingAware(name),
      doiPublishing: config,
    }));
    const payloads: any[] = [];
    // Axios adapter replaces the HTTP transport itself, retaining real DOI mapping/runtime/audit.
    const mockAdapter = async request => {
      expect(request.url).to.contain('https://datacite.example.invalid/dois');
      payloads.push(JSON.parse(request.data));
      return {
        status: 201,
        statusText: 'Created',
        headers: {},
        config: request,
        data: { data: { id: '10.99999/rr19-test' } },
      };
    };
    const rootAxios = require('axios');
    const doiAxios = require(require.resolve('axios', { paths: [require.resolve('@researchdatabox/redbox-core')] }));
    const adapters = [...new Set([rootAxios.defaults, doiAxios.defaults])].map(defaults =>
      sinon.stub(defaults, 'adapter').value(mockAdapter)
    );
    const network = sinon.stub(https, 'request').throws(new Error('RR-19 forbids outbound DOI HTTP'));
    try {
      expect((await save(a, { title: 'Current DOI activity', startDate: '2028-02-01' })).wasPersisted()).to.equal(true);
      const before = await snapshot();
      const options = { ..._.cloneDeep(relatedPlanDoi.options), triggerCondition: '<%= true %>', user: admin };
      expect(await doi.publishDoi(p, await service.getMeta(p), 'draft', 'create', options)).to.equal(
        '10.99999/rr19-test'
      );
      expect(payloads[0].data.attributes.publicationYear).to.equal('2028');
      expect(payloads[0].data.attributes.titles).to.deep.include({ title: 'Current DOI activity' });
      expect(payloads[0].data.attributes.dates).to.deep.include({ date: '2028-02-01', dateType: 'Other' });
      expect(await snapshot()).to.deep.equal(before);
      await doi.publishDoiTrigger(p, await service.getMeta(p), options, admin);
      // Internal DOI saves preserve the existing detached post-hook/audit finalization.
      const deadline = Date.now() + 5000;
      let after = await snapshot();
      while (after.audit.length <= before.audit.length && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
        after = await snapshot();
      }
      expect(after.record.metadata).to.deep.equal({
        ...before.record.metadata,
        doi: '10.99999/rr19-test',
        citationUrl: `https://example.invalid/plans/${p}`,
      });
      expect(after.record).not.to.have.property('relatedMetadata');
      expect(after.record.revision).to.be.greaterThan(before.record.revision);
      expect(after.audit.length).to.be.greaterThan(before.audit.length);
      expect(payloads).to.have.length(2);
      expect(network.called).to.equal(false);
    } finally {
      network.restore();
      configStub.restore();
      adapters.forEach(adapter => adapter.restore());
    }
  });

  it('supplies separate current validation-operation related inputs without persisting them', async function () {
    const stored = await firstValueFrom(FormsService.getFormByName('related-plan-1.0-draft', true, String(brand.id)));
    const configuration = _.cloneDeep(stored.configuration);
    const configured = {
      ..._.cloneDeep(configuration),
      validationOperations: {
        rr19: { enabledValidationGroups: [], relatedMetadata: relatedPlanRequest },
      },
    };
    await sails.models.form.updateOne({ id: stored.id }).set({ configuration: configured });
    try {
      expect((await save(a, { title: 'Validation current activity' })).wasPersisted()).to.equal(true);
      const before = await snapshot();
      const result = await sails.services.recordvalidationservice.resolve({
        candidate: await service.getMeta(p),
        writeKind: 'update',
        validationOperation: 'rr19',
        actor: { authenticated: true, roles: ['Admin'] },
        relatedReadContext: context(),
      });
      expect(result.status, JSON.stringify(result)).to.equal('resolved');
      expect(result.shouldBlock, JSON.stringify(result)).to.equal(false);
      expect(result.resolved.expressionContext.relatedMetadata.primaryActivity.records[0].metadata.title).to.equal(
        'Validation current activity'
      );
      expect(result.transformedCandidate).not.to.have.property('relatedMetadata');
      expect(await snapshot()).to.deep.equal(before);
    } finally {
      await sails.models.form.updateOne({ id: stored.id }).set({ configuration });
    }
  });

  it('invalidates the form fingerprint when a relation projection changes', async function () {
    const type = await firstValueFrom(RecordTypesService.get(brand, 'related-plan'));
    const record = await service.getMeta(p);
    const before = await snapshot();
    const fingerprint = await service.getRecordFormFingerprint(record, type);
    expect(fingerprint).to.be.a('string');
    const changed = _.cloneDeep(type.relatedTo);
    changed[0].resolution.metadataFields = ['/title'];
    await sails.models.recordtype.updateOne({ id: type.id }).set({ relatedTo: changed });
    try {
      const currentType = await firstValueFrom(RecordTypesService.get(brand, 'related-plan'));
      expect(await service.getRecordFormFingerprint(record, currentType)).not.to.equal(fingerprint);
      expect((await fresh()).relatedMetadata.primaryActivity.records[0].metadata).to.deep.equal({
        title: 'Activity A',
      });
      expect(await snapshot()).to.deep.equal(before);
    } finally {
      await sails.models.recordtype.updateOne({ id: type.id }).set({ relatedTo: type.relatedTo });
    }
  });

  it('keeps the existing demo form and raw record opt-out behavior', async function () {
    const oid = await seed('rdmp', { title: 'Legacy demo', activityTitle: 'Ordinary local answer' });
    await db.collection('record').updateOne({ redboxOid: oid }, { $set: { 'metaMetadata.form': 'default-1.0-draft' } });
    const before = await raw(oid);
    const record = await service.getMeta(oid);
    expect(record).not.to.have.property('relatedMetadata');
    const stored = await FormsService.getForm(brand, undefined, true, 'rdmp', record);
    const constructed = await FormsService.buildClientFormConfig(
      stored.configuration,
      'edit',
      ['Admin'],
      record.metadata,
      sails.config.reusableFormDefinitions,
      brand.name,
      {},
      { record, user: admin, brand }
    );
    expect(constructed.relatedRecords).to.equal(undefined);
    const result = await save(oid, { activityTitle: 'Still an ordinary local answer' });
    expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    expect((await raw(oid)).metadata).to.deep.equal({
      ...before.metadata,
      activityTitle: 'Still an ordinary local answer',
    });
  });

  it('persists an ordinary local plan edit with advancing revision and edit audit', async function () {
    const before = await snapshot();
    const result = await save(p, { notes: 'Intended local edit' });
    expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    const after = await snapshot();
    expect(after.record.metadata).to.deep.equal({ ...before.record.metadata, notes: 'Intended local edit' });
    expect(after.record.revision).to.be.greaterThan(before.record.revision);
    expect(after.audit.length).to.be.greaterThan(before.audit.length);
  });

  for (const mode of ['replace', 'merge'] as const) {
    it(`rejects manipulated transient display copies under ${mode} without Mongo writes`, async function () {
      const before = await snapshot();
      const result = await save(p, { ...before.record.metadata, activityTitle: 'Forged display copy' }, mode);
      expect(result.wasPersisted(), JSON.stringify(result)).to.equal(false);
      expect(JSON.stringify(result)).to.contain('related-display-field-not-writable');
      expect(await snapshot()).to.deep.equal(before);
    });
  }
  it('strips root runtime keys on pipeline and native Mongo writes, retaining ordinary metadata keys', async function () {
    const result = await save(p, { notes: 'Normal write', relatedMetadata: { local: true } }, 'merge', {
      forged: true,
    });
    expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    expect(await raw(p)).not.to.have.property('relatedMetadata');
    expect((await raw(p)).metadata.relatedMetadata).to.deep.equal({ local: true });
    const record = await service.getMeta(p);
    record.relatedMetadata = { forged: true };
    const native = await storage.updateMeta(brand, p, record, admin);
    expect(native.success, JSON.stringify(native)).to.equal(true);
    expect(await raw(p)).not.to.have.property('relatedMetadata');
  });
  it('preflights active transient batches before inserting any record', async function () {
    const first = await service.getMeta(p);
    const batchIds = [`${p}-batch-local`, `${p}-batch-active`];
    oids.push(...batchIds);
    const local = { ..._.cloneDeep(first), redboxOid: batchIds[0], metadata: { title: 'Local' } };
    const active = { ..._.cloneDeep(first), redboxOid: batchIds[1] };
    for (const run of [
      () => service.createBatch('related-plan', [local, active]),
      () => storage.createBatch('related-plan', [local, active], ''),
    ]) {
      let error: any;
      try {
        await run();
      } catch (caught) {
        error = caught;
      }
      expect(String(error)).to.contain('related-display-batch-not-supported');
      expect(await db.collection('record').countDocuments({ redboxOid: { $in: batchIds } })).to.equal(0);
    }
  });
  it('honours explicit librarian grants, denied/deleted and cross-brand sources without root changes', async function () {
    const before = await snapshot();
    const allowed = await service.getMetaWithRelatedMetadata(p, context(librarian), relatedPlanRequest);
    expect(allowed.relatedMetadata.activities.records).to.have.length(2);
    const outsider = { username: 'related-unauthorised', roles: [] };
    let denied = false;
    try {
      await service.getMetaWithRelatedMetadata(p, context(outsider), relatedPlanRequest);
    } catch {
      denied = true;
    }
    expect(denied).to.equal(true);
    await db
      .collection('record')
      .updateOne({ redboxOid: b }, { $set: { 'authorization.view': [], 'authorization.edit': [] } });
    const restricted = await fresh();
    expect(JSON.stringify(restricted.relatedMetadata.activities)).not.to.contain(b);
    const cross = await seed('related-activity', { title: 'Cross brand secret' }, 'rr19-other-brand');
    const candidate = await service.getMeta(p);
    candidate.metadata.primaryActivity = cross;
    const crossResult = await service.resolveRelatedMetadata(candidate, context(), relatedPlanRequest);
    expect(JSON.stringify(crossResult)).not.to.contain('Cross brand secret');
    await db.collection('record').deleteOne({ redboxOid: a });
    const deleted = await fresh();
    expect(deleted.relatedMetadata.primaryActivity.records).to.have.length(0);
    expect(await snapshot()).to.deep.equal(before);
  });
  it('applies the existing raw record path restriction equally to Admin-only refresh callers', async function () {
    const onlyAdmin = supertest.agent(sails.hooks.http.app);
    const initialToken = (await onlyAdmin.get('/csrfToken').query({ branding: 'default', portal: 'rdmp' }).expect(200))
      .body._csrf;
    await onlyAdmin
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', initialToken)
      .send({ username: 'related-admin-only', password, branding: 'default', portal: 'rdmp' })
      .expect(200);
    const onlyAdminToken = (
      await onlyAdmin.get('/csrfToken').query({ branding: 'default', portal: 'rdmp' }).expect(200)
    ).body._csrf;
    const before = await snapshot();
    // Explicit record ACLs do not override the pre-existing browser path-role policy.
    await db.collection('record').updateMany(
      { redboxOid: { $in: [p, a, b] } },
      {
        $addToSet: { 'authorization.view': 'related-admin-only', 'authorization.edit': 'related-admin-only' },
      }
    );
    const granted = await snapshot();
    const rawResponse = await onlyAdmin
      .get(`/default/rdmp/record/metadata/${p}`)
      .set('X-Source', 'jsclient')
      .expect(403);
    const refreshResponse = await onlyAdmin
      .post('/default/rdmp/record/relatedMetadata/resolve')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', onlyAdminToken)
      .send({ oid: p, relations: ['primaryActivity'] })
      .expect(403);
    expect(refreshResponse.status).to.equal(rawResponse.status);
    expect(await snapshot()).to.deep.equal(granted);
    expect(granted.record.metadata).to.deep.equal(before.record.metadata);
  });

  it('enforces browser CSRF and unauthenticated HTTP access without root writes', async function () {
    const before = await snapshot();
    await agent
      .post('/default/rdmp/record/relatedMetadata/resolve')
      .set('X-Source', 'jsclient')
      .send({ oid: p, relations: ['primaryActivity'] })
      .expect(403);
    const anonymous = supertest(sails.hooks.http.app);
    const response = await anonymous
      .get(`/default/rdmp/api/records/resolved/${p}`)
      .set('Content-Type', 'application/json')
      .query({ relations: 'primaryActivity' });
    expect([401, 403]).to.include(response.status);
    expect(JSON.stringify(response.body)).not.to.contain('Activity A');
    expect(await snapshot()).to.deep.equal(before);
  });
  it('rejects undeclared refresh fields and request-body runtime data without persisting either', async function () {
    const before = await snapshot();
    for (const extra of [
      { relatedMetadata: { forged: true } },
      { references: { notes: 'forged' } },
      { brand: 'other' },
    ]) {
      await agent
        .post('/default/rdmp/record/relatedMetadata/resolve')
        .set('X-CSRF-Token', csrfToken)
        .set('X-Source', 'jsclient')
        .send({ oid: p, relations: ['primaryActivity'], ...extra })
        .expect(400);
    }
    expect(await snapshot()).to.deep.equal(before);
  });
});
