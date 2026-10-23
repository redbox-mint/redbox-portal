import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { firstValueFrom } from 'rxjs';
import { Services } from '../../src/services/AsynchsService';
import * as runtime from '../../src/persistence/runtime';
import type { ProgressRepositories } from '../../src/persistence/progress/ProgressRepositories';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AsynchsService', () => {
  const progress = {
    startProgress: sinon.stub(),
    reviseProgress: sinon.stub(),
    listProgress: sinon.stub(),
    removeProgress: sinon.stub(),
  };
  let service: Services.Asynchs;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    for (const method of Object.values(progress)) method.reset();
    const repositories: ProgressRepositories = {
      progress,
      workspaces: {
        registerWork: sinon.stub(),
        reviseStatus: sinon.stub(),
        listStatus: sinon.stub(),
        removeWork: sinon.stub(),
      },
    };
    sinon.stub(require('../../src/persistence/progress/runtime'), 'getProgressRepositories').returns(repositories);
    service = new Services.Asynchs();
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    sinon.restore();
  });
  it('starts lazily and reuses one result for repeated subscriptions', async () => {
    const values = { name: 'test' };
    const row = { id: 'progress' };
    progress.startProgress.resolves(row);
    const observable = service.start(values);
    assert.equal(progress.startProgress.callCount, 0);
    assert.deepEqual(await firstValueFrom(observable), row);
    assert.deepEqual(await firstValueFrom(observable), row);
    assert.equal(progress.startProgress.callCount, 1);
    assert.equal(typeof progress.startProgress.firstCall.args[0].date_started, 'string');
  });
  it('retains supplied start date when completion is present', async () => {
    progress.startProgress.resolves({ id: 'progress' });
    await firstValueFrom(service.start({ date_started: '2023-01-01T12:00:00', date_completed: '2023-01-01T13:00:00' }));
    assert.equal(progress.startProgress.firstCall.args[0].date_started, '2023-01-01T12:00:00');
  });
  it('returns revision arrays and forwards criteria and values', async () => {
    const rows = [{ id: 'progress', status: 'running' }];
    progress.reviseProgress.resolves(rows);
    assert.deepEqual(await firstValueFrom(service.update({ id: 'progress' }, { status: 'running' })), rows);
    assert.deepEqual(progress.reviseProgress.firstCall.args, [{ id: 'progress' }, { status: 'running' }]);
  });
  it('finishes with a completion date and preserves supplied results', async () => {
    progress.reviseProgress.resolves([{ id: 'progress', status: 'finished' }]);
    await firstValueFrom(service.finish('progress', { metadata: { result: false } }));
    const [criteria, patch] = progress.reviseProgress.firstCall.args;
    assert.deepEqual(criteria, { id: 'progress' });
    assert.equal(patch.status, 'finished');
    assert.equal(typeof patch.date_completed, 'string');
    assert.deepEqual(patch.metadata, { result: false });
    await firstValueFrom(service.finish('progress'));
    assert.equal(progress.reviseProgress.callCount, 2);
  });
  it('returns reads and repository errors through its Observable', async () => {
    progress.listProgress.resolves([{ id: 'progress' }]);
    assert.deepEqual(await firstValueFrom(service.get({ status: 'running' })), [{ id: 'progress' }]);
    const failure = new Error('repository failure');
    progress.listProgress.rejects(failure);
    await assert.rejects(firstValueFrom(service.get({ id: 'progress' })), e => e === failure);
  });
  it('exports its existing service interface', () => {
    for (const name of ['start', 'update', 'finish', 'get'])
      assert.equal(typeof Reflect.get(service.exports(), name), 'function');
  });
});
