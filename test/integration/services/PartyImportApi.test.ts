import supertest from 'supertest';
import * as sinon from 'sinon';

/** Transport/auth/CSRF coverage; service unit tests exercise parsing and the real create handoff. */
describe('Party CSV import API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent;
  let csrf = '';
  const tokens: string[] = [];
  const path = '/default/rdmp/admin/parties/import';
  const app = () => (sails as any).hooks.http.app;
  before(async () => {
    admin = supertest.agent(app());
    await admin.get('/default/rdmp/user/login').expect(200);
    csrf = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken').expect(200)).body._csrf;
    await admin.post('/user/login_local').set('X-CSRF-Token', csrf).set('X-Source', 'jsclient').send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' }).expect(200);
    // Login rotates the session; use its current CSRF token for subsequent writes.
    csrf = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken').expect(200)).body._csrf;
  });
  afterEach(() => sinon.restore());
  after(async () => {
    for (const token of tokens) await CacheEntry.destroy({ name: `party-import:${token}` });
  });
  const post = (action: string, body: unknown) => admin.post(`${path}/${action}`).set('X-ReDBox-Api-Version', '2.0').set('X-CSRF-Token', csrf).send(body);
  it('requires an Admin session, valid CSRF and bounded file/mapping payloads', async () => {
    const guest = supertest.agent(app());
    await guest.post(`${path}/preview`).send({}).expect(403);
    if (sails.config.security.csrf !== false) await admin.post(`${path}/inspect`).send({ csv: 'Name,Email\nA,a@b.org' }).expect(403);
    await post('inspect', { csv: 'Name,Email\nA,a@b.org' }).expect(200);
    await post('preview', { csv: 'Name,Email\nA,a@b.org', mapping: { fullName: 0, email: 0 } }).expect(400);
    await post('inspect', { csv: 'Name,Email\nA' }).expect(400);
    await post('inspect', { csv: 'x'.repeat(2 * 1024 * 1024 + 1) }).expect(400);
  });
  it('binds preview to file, columns and brand, and atomically consumes it before normal creation', async () => {
    const csv = 'Name,Email\nImport API fixture,party-import-api@example.test\nInvalid,invalid';
    const mapping = { fullName: 0, email: 1 };
    const create = sinon.stub(RecordsService, 'create').resolves({ wasPersisted: () => true, outcome: 'saved', oid: 'unit-only-not-a-record', problems: [] } as any);
    const preview = (await post('preview', { csv, mapping }).expect(200)).body.data;
    tokens.push(preview.token);
    expect(preview.valid).to.equal(1); expect(preview.invalid).to.equal(1);
    await post('apply', { csv: csv + '\nOther,o@b.org', mapping, token: preview.token }).expect(409);
    const simultaneous = await Promise.all([post('apply', { csv, mapping, token: preview.token }), post('apply', { csv, mapping, token: preview.token })]);
    expect(simultaneous.map(response => response.status).sort()).to.deep.equal([200, 409]);
    const results = simultaneous.find(response => response.status === 200)!.body.data;
    expect(results.rows.map((row: any) => row.status)).to.deep.equal(['saved', 'skipped']);
    expect(create.calledOnce).to.equal(true);
    expect(create.firstCall.args[2].name).to.equal('party');
    await post('apply', { csv, mapping, token: preview.token }).expect(409);
    expect(await CacheEntry.findOne({ name: `party-import:${preview.token}` })).not.to.exist;
  });
});
