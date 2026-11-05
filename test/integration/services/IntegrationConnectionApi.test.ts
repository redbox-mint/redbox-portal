import supertest from 'supertest';
import { createServer, type Server } from 'node:http';
import { firstValueFrom } from 'rxjs';

/** Real session policies, CSRF, brand config merge and local upstream only. Never saves AppConfig. */
describe('Admin integration connection API', function () {
  this.timeout(60000);
  const root = '/default/rdmp/admin/appconfig/';
  const keys = ['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing'];
  let admin: supertest.Agent;
  let ordinary: supertest.Agent;
  let csrf: string;
  let userId: string;
  let server: Server;
  let base: string;
  let rows: any[];
  let hits: string[];
  const app = () => (sails as any).hooks.http.app;
  const token = async (agent: supertest.Agent) => {
    await agent.get('/default/rdmp/user/login').expect(200);
    return sails.config.security.csrf === false ? '' : (await agent.get('/csrfToken').expect(200)).body._csrf;
  };
  const login = async (username: string, password: string) => {
    const agent = supertest.agent(app());
    await agent.post('/user/login_local').set('X-CSRF-Token', await token(agent))
      .set('X-Source', 'jsclient').send({ username, password, branding: 'default', portal: 'rdmp' }).expect(200);
    return agent;
  };
  before(async () => {
    rows = await AppConfig.find({ branding: BrandingService.getBrand('default').id });
    hits = [];
    server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.setHeader('Content-Type', 'application/json');
      if (!req.headers.authorization) { res.statusCode = 401; res.end('{"message":"private upstream error"}'); return; }
      const data = req.url === '/account' ? { id: 1 } : req.url === '/clients/client-id' ? { data: { id: 'client-id', type: 'clients' } }
        : req.url === '/service-point/' ? [] : { isIndexed: false, count: 0 };
      res.end(JSON.stringify(data));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    const name = `connectionfixture${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(name, 'Connection fixture', `${name}@example.test`, 'Testing123!'));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher'])));
    admin = await login('admin', 'rbadmin'); ordinary = await login(name, 'Testing123!'); csrf = await token(admin);
  });
  after(async () => {
    if (rows) expect(await AppConfig.find({ branding: BrandingService.getBrand('default').id })).to.deep.equal(rows);
    if (userId) await User.destroy({ id: userId });
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it('rejects anonymous and ordinary users before contacting the upstream', async () => {
    const anonymous = supertest.agent(app());
    await anonymous.post(root + keys[0] + '/test-connection').set('X-CSRF-Token', await token(anonymous)).send({}).expect(403);
    await ordinary.post(root + keys[0] + '/test-connection').set('X-CSRF-Token', await token(ordinary)).send({}).expect(403);
    expect(hits).to.have.length(0);
  });
  it('requires valid session CSRF even for Admin', async function () {
    if (sails.config.security.csrf === false) this.skip();
    await admin.post(root + keys[0] + '/test-connection').send({}).expect(403);
    await admin.post(root + keys[0] + '/test-connection').set('X-CSRF-Token', 'invalid').send({}).expect(403);
    expect(hits).to.have.length(0);
  });
  for (const key of keys) it(`tests ${key} draft with a local upstream without saving it`, async () => {
    // The service deliberately limits the authenticated actor across all integrations.
    await new Promise(resolve => setTimeout(resolve, 5100));
    const draft = key === 'oniPublishing' ? { defaultSite: 'test', sites: { test: { enabled: true, ingestion: { enabled: true, apiUrl: base, adminToken: 'mock-secret' } } } }
      : { connection: { baseUrl: base, token: 'mock-secret', username: 'client-id', password: 'mock-secret' } };
    const result = await admin.post(root + key + '/test-connection').set('X-CSRF-Token', csrf).send({ draft }).expect(200);
    expect(result.body).to.include({ ok: true, status: 'ok', httpStatus: 200 });
    expect(JSON.stringify(result.body)).not.to.contain('mock-secret');
    expect(hits[hits.length - 1]).to.match(/^GET /);
    const throttled = await admin.post(root + key + '/test-connection').set('X-CSRF-Token', csrf).send({ draft }).expect(429);
    expect(throttled.headers['retry-after']).to.exist;
  });
  it('rejects unsupported integrations, secret references and tenant overrides', async () => {
    for (const [key, body] of [['unknown', {}], [keys[0], { branding: 'other' }], [keys[0], { draft: { connection: { token: { $appConfigSecret: { arn: 'private' } } } } }]] as const) {
      await admin.post(root + key + '/test-connection').set('X-CSRF-Token', csrf).send(body).expect(400);
    }
  });
});
