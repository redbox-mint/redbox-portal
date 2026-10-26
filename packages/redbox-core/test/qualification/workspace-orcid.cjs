const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { MongoClient } = require('mongodb');
const { firstValueFrom, from, map } = require('rxjs');
const axios = require('axios').default;
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Workspaces } = require('../../dist/workspaces/Workspaces');
const { Services: Workers } = require('../../dist/workspaces/WorkspaceAsync');
const { Services: Orcid } = require('../../dist/integrations/Orcid');
const { ApplicationRuntime } = require('../../dist/application');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = require('../../dist/persistence/runtime');

test('owned workspace providers use real Mongo and HTTP and drain completion writes', { timeout: 30000 }, async () => {
  assert.equal(process.version, 'v26.11.1');
  const url = process.env.SR_WORKSPACE_MONGO_URL;
  assert(url, 'SR_WORKSPACE_MONGO_URL is required');
  assert.equal(new URL(url).pathname, '/sr_p7_workspace');
  const native = await new MongoClient(url).connect();
  const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ method: req.method, path: req.url, body });
    if (req.url === '/job') {
      entered.resolve();
      await release.promise;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.startsWith('/v1.2/')
          ? {
              'orcid-search-results': {
                'num-found': 1,
                'orcid-search-result': [
                  {
                    'orcid-profile': {
                      'orcid-identifier': { uri: 'https://orcid.org/0000-0001-2345-6789' },
                      'orcid-bio': {
                        'personal-details': { 'given-names': { value: 'Ada' }, 'family-name': { value: 'Lovelace' } },
                      },
                    },
                  },
                ],
              },
            }
          : { accepted: true }
      )
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    assert.equal((await native.db().listCollections().toArray()).length, 0);
    assert.equal((await prepareSelectedPersistenceIndexes(owner, 'ensure')).ready, true);
    let worker;
    app = new ApplicationRuntime(
      owner,
      [
        {
          name: 'workspaceAsync',
          create: () => {
            worker = new Workers.WorkspaceAsyncService({
              repository: runtime.getProgressRepositories(owner).workspaces,
              log,
              runWork: operation => runtime.runAcceptedPersistenceWork(owner, operation),
              resolveOperation: name => {
                assert.equal(name, 'institution.provision');
                return args => from(axios.get(origin + '/job', { params: args })).pipe(map(response => response.data));
              },
            });
            return worker;
          },
        },
      ],
      {
        preparePersistence: async () => {
          await runtime.initializeIdentityPersistence(owner);
          await runtime.initializeProgressPersistence(owner);
        },
      }
    );
    await app.initialize();
    await app.activate();
    const identities = runtime.getIdentityRepositories(owner);
    const user = await identities.create('user', {
      username: 'workspace-owner',
      type: 'local',
      name: 'Workspace Owner',
      email: 'workspace@example.invalid',
    });
    const unused = () => {
      throw new Error('Unconfigured record collaborator');
    };
    const workspaces = new Workspaces.WorkspaceService({
      identities,
      log,
      records: {
        getMeta: unused,
        appendToRecord: unused,
        removeFromRecord: unused,
      },
    });
    assert.equal((await firstValueFrom(workspaces.userInfo(user.id))).username, user.username);
    assert.equal((await firstValueFrom(workspaces.provisionerUser(user.username))).id, user.id);
    const created = workspaces.createWorkspaceInfo(user.id, 'qualified', { value: 1 });
    const info = await firstValueFrom(created);
    assert.equal((await firstValueFrom(created)).id, info.id, 'resubscription does not create again');
    assert.equal((await firstValueFrom(workspaces.workspaceAppFromUserId(user.id, 'qualified'))).info.value, 1);
    await firstValueFrom(workspaces.updateWorkspaceInfo(info.id, { value: 2 }));
    assert.equal((await firstValueFrom(workspaces.infoFormUserId(user.id))).workspaceApps[0].info.value, 2);
    const httpConfig = { brandingAndPortalUrl: origin, redboxHeaders: {} };
    assert.equal(
      (
        await firstValueFrom(
          workspaces.createWorkspaceRecord(httpConfig, user.username, { title: 'Qualified' }, 'workspace', 'draft')
        )
      ).status,
      200
    );
    assert.equal((await firstValueFrom(workspaces.getRecordMeta(httpConfig, 'record'))).status, 200);
    assert.equal(
      (await firstValueFrom(workspaces.updateRecordMeta(httpConfig, { title: 'Changed' }, 'record'))).status,
      200
    );
    const orcid = new Orcid.Orcids({ url: origin, method: 'get' });
    const people = await firstValueFrom(orcid.searchOrcid('Ada', 'Lovelace', 2));
    assert.equal(people.numFound, 1);
    assert.equal(people.items[0].givenNames, 'Ada');
    assert(requests.at(-1).path.includes('start=10&rows=10'));
    assert.deepEqual(
      requests.slice(0, 3).map(request => request.method),
      ['POST', 'GET', 'PUT']
    );
    assert.equal(requests[0].body.authorization.edit[0], user.username);
    await firstValueFrom(workspaces.removeAppFromUserId(user.id, info.id));
    assert.equal(await native.db().collection('workspaceapp').countDocuments(), 0);
    const work = await firstValueFrom(
      worker.start({
        name: 'qualify',
        username: user.username,
        recordType: 'workspace',
        service: 'institution',
        method: 'provision',
      })
    );
    await firstValueFrom(worker.update(work.id, { status: 'pending' }));
    const running = worker.loop();
    await entered.promise;
    let stopped = false;
    const stopping = app.stop().then(() => {
      stopped = true;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(stopped, false);
    release.resolve();
    await running;
    await stopping;
    const completed = await native.db().collection('workspaceasync').findOne({ name: 'qualify' });
    assert.equal(completed.status, 'finished');
    assert.equal(completed.message.accepted, true);
    assert.equal(typeof completed.date_completed, 'string');
    assert.equal(app.status().persistence.pools, 0);
    assert.equal(global.sails, undefined);
    assert(
      !Object.keys(require.cache).some(file =>
        /[/\\](compat[/\\]sails|CoreService|CoreBase|services[/\\]index)/.test(file)
      )
    );
    console.log(
      JSON.stringify({ httpRequests: requests.length, identityCRUD: true, completionWrites: 1, drainWaited: true })
    );
  } finally {
    release.resolve();
    await app?.stop();
    await runtime.cleanupPersistence(owner);
    await new Promise(resolve => server.close(resolve));
    await native.db().dropDatabase();
    await native.close();
  }
});
