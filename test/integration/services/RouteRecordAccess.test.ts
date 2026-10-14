import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';

describe('Route and record access checks', function () {
  this.timeout(60_000);

  let anonymous: supertest.Agent;
  let researcher: supertest.Agent;
  let admin: supertest.Agent;
  let userId: string;
  let targetId: string;
  const suffix = randomUUID();
  const username = `access-researcher-${suffix}`;
  const oids = {
    allowed: `access-allowed-${suffix}`,
    denied: `access-denied-${suffix}`,
    foreign: `access-foreign-${suffix}`,
  };

  async function csrf(agent: supertest.Agent): Promise<string> {
    if (!sails.config.security.csrf) return '';
    const response = await agent.get('/csrfToken').expect(200);
    return response.body._csrf;
  }

  before(async () => {
    const app = (sails.hooks.http as { app: Parameters<typeof supertest.agent>[0] }).app;
    anonymous = supertest.agent(app);
    researcher = supertest.agent(app);
    admin = supertest.agent(app);
    const brand = BrandingService.getDefault();
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'Access test researcher', `${username}@example.edu.au`, 'RBTest123!')
    );
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(user.id, RolesService.getRoleIds(brand.roles, ['Researcher'])));
    const target = await firstValueFrom(
      UsersService.addLocalUser(
        `access-target-${suffix}`,
        'Access test target',
        'target@example.edu.au',
        'RBTest123!'
      )
    );
    targetId = String(target.id);
    await firstValueFrom(UsersService.setUserKey(targetId, 'initial-regression-token'));

    for (const [agent, loginUsername, password] of [
      [researcher, username, 'RBTest123!'],
      [admin, 'admin', 'rbadmin'],
    ] as const) {
      await agent
        .post('/user/login_local')
        .set('X-Source', 'jsclient')
        .send({
          username: loginUsername,
          password,
          branding: 'default',
          portal: 'rdmp',
          _csrf: await csrf(agent),
        })
        .expect(200);
    }

    for (const [kind, oid] of Object.entries(oids)) {
      await Record.create({
        redboxOid: oid,
        metaMetadata: { brandId: kind === 'foreign' ? 'another-brand' : brand.id, type: 'rdmp' },
        metadata: { title: `${kind} access test record` },
        authorization: {
          view: kind === 'denied' ? [] : [username],
          edit: [],
          viewRoles: kind === 'foreign' ? ['Researcher'] : [],
          editRoles: [],
        },
      });
    }
  });

  after(async () => {
    await Record.destroy({ redboxOid: Object.values(oids) });
    const ids = [userId, targetId].filter(Boolean);
    if (ids.length) await User.destroy({ id: ids });
  });

  for (const actor of ['anonymous', 'researcher'] as const) {
    it(`blocks ${actor} access to mixed-case administrative user lists`, async () => {
      const agent = actor === 'anonymous' ? anonymous : researcher;
      await agent.get('/default/rdmp/AdMiN/users/get').set('Content-Type', 'application/json').expect(403);
    });

    for (const path of [
      '/default/rdmp/admin/users/genKey',
      '/default/rdmp/AdMiN/users/genKey',
      '/default/rdmp/ADMIN/USERS/GENKEY/',
    ]) {
      it(`blocks ${actor} credential issuance at ${path}`, async () => {
        const agent = actor === 'anonymous' ? anonymous : researcher;
        const before = await User.findOne({ id: targetId });
        await agent
          .post(path)
          .set('X-Source', 'jsclient')
          .send({
            userid: targetId,
            _csrf: await csrf(agent),
          })
          .expect(403);
        const after = await User.findOne({ id: targetId });
        assert.equal(after.token, before.token);
      });
    }
  }

  it('still permits administrators to issue credentials on mixed-case routes', async () => {
    const response = await admin
      .post('/default/rdmp/AdMiN/users/genKey')
      .set('X-Source', 'jsclient')
      .send({
        userid: targetId,
        _csrf: await csrf(admin),
      })
      .expect(200);
    assert.equal(response.body.status, true);
    assert.equal(typeof response.body.message, 'string');
  });

  it('denies an inaccessible related-record root at depth zero', async () => {
    const response = await researcher
      .get(`/default/rdmp/record/${oids.denied}/relatedRecords`)
      .query({ relationshipDepth: 0 })
      .expect(403);
    assert.equal(JSON.stringify(response.body).includes('denied access test record'), false);
  });

  it('conceals a foreign-tenant root despite matching usernames and role names', async () => {
    const response = await researcher
      .get(`/default/rdmp/record/${oids.foreign}/relatedRecords`)
      .query({ relationshipDepth: 0 })
      .expect(404);
    assert.equal(JSON.stringify(response.body).includes('foreign access test record'), false);
  });

  it('returns the root when the caller is allowed to view it', async () => {
    const response = await researcher
      .get(`/default/rdmp/record/${oids.allowed}/relatedRecords`)
      .set('X-Source', 'jsclient')
      .query({ relationshipDepth: 0 })
      .expect(200);
    assert.equal(response.body.rootOid, oids.allowed);
    assert.equal(response.body.relatedObjects.rdmp[0].redboxOid, oids.allowed);
  });

  it('returns 404 for an unknown related-record root', async () => {
    await researcher
      .get(`/default/rdmp/record/access-missing-${suffix}/relatedRecords`)
      .query({ relationshipDepth: 0 })
      .expect(404);
  });
});
