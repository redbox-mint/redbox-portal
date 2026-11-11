import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Real route/policy/database coverage, including session-backed CSRF enforcement. */
describe('Schema-assisted query and report release contracts', function () {
  this.timeout(60_000);
  const suffix = randomUUID().replace(/-/g, '');
  const name = `assist_${suffix}`;
  const prefix = '/default/rdmp/api';
  const definition = {
    name,
    collectionName: 'record',
    mongoQuery: { 'metadata.releaseFixture': suffix },
    queryParams: {},
    resultObjectMapping: { projectTitle: 'record.metadata.title' },
  };
  const report = {
    name,
    title: 'Release verification',
    reportSource: 'database',
    databaseQuery: { queryName: name },
    solrQuery: null,
    filter: [],
    columns: [{ label: 'Project', property: 'metadata.projectTitle', exportTemplate: '{{recordTableMeta.val}}' }],
  };
  let admin: supertest.Agent;
  let author: supertest.Agent;
  let anonymous: supertest.Agent;
  let csrf: string;
  let authorCsrf: string;
  let userId: string;
  let brand: any;
  let role: any;
  let pathRule: any;
  let previousCsrf: typeof sails.config.security.csrf;

  async function login(agent: supertest.Agent, username: string, password: string): Promise<string> {
    const token = (await agent.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', token ?? '')
      .send({ username, password, branding: 'default', portal: 'rdmp' })
      .expect(200);
    return (await agent.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
  }
  function request(agent: supertest.Agent, method: string, path: string, token?: string) {
    const req = agent[method](`${prefix}${path}`).set('X-Source', 'jsclient').set('Accept', 'application/json');
    if (token) req.set('X-CSRF-Token', token);
    return req;
  }
  const post = (path: string, data: unknown) => request(admin, 'post', path, csrf).send(data);

  before(async function () {
    // Editor POSTs require CSRF even when the general integration harness disables it.
    // Enable token generation for /csrfToken as well, and restore the harness afterward.
    previousCsrf = sails.config.security.csrf;
    sails.config.security.csrf = true;
    const app = (sails as any).hooks.http.app;
    admin = supertest.agent(app);
    author = supertest.agent(app);
    anonymous = supertest.agent(app);
    csrf = await login(admin, 'admin', 'rbadmin');
    brand = BrandingService.getDefault();
    role = await Role.create({ name: `ReportAuthor_${suffix}`, branding: brand.id }).fetch();
    pathRule = await PathRule.create({
      path: '/:branding/:portal/api/report-config(/*)',
      branding: brand.id,
      role: role.id,
      can_read: true,
      can_update: true,
    }).fetch();
    await firstValueFrom(PathRulesService.loadRules());
    const username = `assist${suffix}`;
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'Report Author', `${username}@example.test`, 'RBTest123!')
    );
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(user.id, [role.id]));
    authorCsrf = await login(author, username, 'RBTest123!');
    await NamedQueryService.create(brand, name, definition);
    // More than a sample window, including an inaccessible ACL: administrative saved-query semantics.
    for (let index = 0; index < 103; index++) {
      await Record.create({
        redboxOid: `${name}_${index}`,
        metadata: { title: `Project ${index}`, releaseFixture: suffix },
        metaMetadata: { brandId: index === 102 ? 'foreign-brand' : brand.id, type: 'rdmp' },
        authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
      });
    }
  });

  after(async function () {
    sails.config.security.csrf = previousCsrf;
    await Record.destroy({ redboxOid: { startsWith: name } });
    if (brand) {
      await NamedQuery.destroy({ name, branding: brand.id });
      await RBReport.destroy({ name, branding: brand.id });
    }
    if (userId) await User.destroy({ id: userId });
    if (pathRule) await PathRule.destroy({ id: pathRule.id });
    if (role) await Role.destroy({ id: role.id });
    await firstValueFrom(PathRulesService.loadRules());
  });

  it('discovers fields and describes draft/saved output without executing or saving', async function () {
    await request(admin, 'get', '/named-query/editor/schema-targets').expect(200);
    const fields = await request(
      admin,
      'get',
      '/named-query/editor/fields?collectionName=record&recordType=rdmp'
    ).expect(200);
    assert.ok(fields.body.fields.length > 0);
    assert.ok(fields.body.envelopeFields.some(field => field.path === 'redboxOid'));
    const described = await post('/named-query/editor/describe', { definition }).expect(200);
    assert.match(JSON.stringify(described.body), /metadata\.projectTitle/);
    await request(admin, 'get', `/named-query/${name}/description`).expect(200);
    const output = await request(author, 'get', `/report-config/named-query/${name}/description`).expect(200);
    assert.ok(output.body.templateContexts.display);
    assert.ok(output.body.templateContexts.csv);
    assert.equal(await NamedQuery.count({ name, branding: brand.id }), 1);
  });

  it('separates query administration, report authoring and anonymous access', async function () {
    const routes = [
      ['get', '/named-query/editor/schema-targets'],
      ['get', '/named-query/editor/fields'],
      ['get', `/named-query/${name}/description`],
      ...['validate', 'describe', 'preview'].map(operation => ['post', `/named-query/editor/${operation}`]),
    ];
    for (const [method, path] of routes)
      await request(author, method, path, authorCsrf).send({ definition }).expect(403);
    for (const [method, path] of [
      ...routes,
      ['get', `/report-config/named-query/${name}/description`],
      ['post', '/report-config/validate'],
      ['post', '/report-config/preview'],
    ]) {
      const token = (await anonymous.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
      const response = await request(anonymous, method, path, token).send({ definition });
      assert.ok([401, 403].includes(response.status), `${method} ${path}: ${response.status}`);
    }
    await request(author, 'post', '/report-config/validate', authorCsrf).send(report).expect(200);
    const sample = await request(author, 'post', '/report-config/preview', authorCsrf).send(report).expect(200);
    assert.equal(sample.body.deadlineEnforced, true);
  });

  it('requires CSRF on every draft POST and session-backed mutation', async function () {
    for (const path of [
      '/named-query/editor/validate',
      '/named-query/editor/describe',
      '/named-query/editor/preview',
      '/report-config/validate',
      '/report-config/preview',
    ])
      await request(admin, 'post', path)
        .send(path.includes('named-query') ? { definition } : report)
        .expect(403);
    // Check the session-mutation policy itself, without the global CSRF hook
    // rejecting first and hiding a missing policy on one of these routes.
    sails.config.security.csrf = false;
    try {
      for (const [method, path, body] of [
        ['post', '/named-query', { ...definition, name: `${name}_csrf` }],
        ['put', `/named-query/${name}`, definition],
        ['delete', `/named-query/${name}`, undefined],
        ['post', '/report-config', report],
      ] as const) {
        const result = await request(admin, method, path).send(body).expect(403);
        assert.equal(result.body.error?.code, 'CSRF_MISMATCH');
      }
    } finally {
      sails.config.security.csrf = true;
    }
    assert.equal(await NamedQuery.count({ name, branding: brand.id }), 1);
  });

  it('rejects malformed drafts and server-owned size/complexity limits without persistence', async function () {
    const invalid = await post('/named-query/editor/validate', { definition: [] }).expect(200);
    assert.equal(invalid.body.valid, false);
    const malformed = await post('/named-query/editor/preview', {
      definition: { ...definition, mongoQuery: [] },
    }).expect(200);
    assert.equal(malformed.body.valid, false);
    const reportErrors = await post('/report-config/validate', { ...report, columns: [{}] }).expect(200);
    assert.equal(reportErrors.body.valid, false);
    await post('/named-query/editor/preview', { definition, parameters: { huge: 'x'.repeat(132000) } }).expect(413);
    let nested: any = {};
    for (let i = 0; i < 30; i++) nested = { child: nested };
    await post('/report-config/validate', { ...report, custom: nested }).expect(413);
    assert.equal(await RBReport.count({ name, branding: brand.id }), 0);
  });

  it('enforces record brand scoping and row limits despite caller-supplied scope and limits', async function () {
    const result = await post('/named-query/editor/preview', {
      definition: { ...definition, brandIdFieldPath: 'metadata.releaseFixture' },
      brandId: 'foreign-brand',
      limits: { rows: 10000, timeMs: 999999 },
    }).expect(200);
    assert.equal(result.body.valid, true);
    assert.equal(result.body.summary.numFound, 102);
    assert.equal(result.body.records.length, 100);
    assert.equal(result.body.truncated, true);
    assert.ok(result.body.truncationReasons.includes('rows'));
    assert.equal(result.body.limits.rows, 100);
    assert.ok(result.body.records.every(row => row.oid !== `${name}_102`));
    const sample = await post('/report-config/preview', report).expect(200);
    assert.equal(sample.body.total, 102);
    assert.equal(sample.body.records.length, 100);
    assert.equal(sample.body.deadlineEnforced, true);
    assert.equal(sample.body.renderedRows[0].cells[0].export, sample.body.records[0].metadata.projectTitle);
  });

  it('bounds response bytes while preserving an explicit truncation signal', async function () {
    const oid = `${name}_large`;
    await Record.create({
      redboxOid: oid,
      metadata: { title: 'L'.repeat(300000), releaseFixture: suffix },
      metaMetadata: { brandId: brand.id, type: 'rdmp' },
    });
    try {
      const sample = await post('/named-query/editor/preview', {
        definition: { ...definition, mongoQuery: { redboxOid: oid } },
      }).expect(200);
      assert.equal(sample.body.truncated, true);
      assert.ok(sample.body.truncationReasons.includes('bytes'));
      assert.ok(Buffer.byteLength(sample.text) <= sample.body.limits.responseBytes);
    } finally {
      await Record.destroy({ redboxOid: oid });
    }
  });

  it('refuses uncancellable draft queries but preserves saved user-query previews with deadlineEnforced=false', async function () {
    const userDefinition = {
      ...definition,
      name: `${name}_users`,
      collectionName: 'user',
      mongoQuery: { username: 'admin' },
      resultObjectMapping: { projectTitle: 'record.username' },
    };
    const refused = await post('/named-query/editor/preview', { definition: userDefinition }).expect(200);
    assert.equal(refused.body.valid, false);
    assert.ok(refused.body.diagnostics.some(item => item.code === 'PREVIEW_DEADLINE_UNSUPPORTED'));
    await NamedQueryService.create(brand, userDefinition.name, userDefinition);
    try {
      const sample = await post('/report-config/preview', {
        ...report,
        databaseQuery: { queryName: userDefinition.name },
      }).expect(200);
      assert.equal(sample.body.success, true);
      assert.equal(sample.body.deadlineEnforced, false);
      assert.equal(sample.body.records[0].metadata.projectTitle, 'admin');
    } finally {
      await NamedQueryService.delete(brand, userDefinition.name);
    }
  });
});
