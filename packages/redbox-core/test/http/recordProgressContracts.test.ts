import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { authorizeProgressRoom } from '../../src/progress/authorization';
import { mountProgressOperationRoutes } from '../../src/http/express/progressOperations';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned record progress authorization contracts', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let records: Record<string, sinon.SinonStub>,
    progress: Record<string, sinon.SinonStub>,
    sockets: { issue: sinon.SinonStub; emit: sinon.SinonStub };
  const id = '0123456789abcdef01234567',
    other = '1123456789abcdef01234567';
  beforeEach(async () => {
    records = {
      getMeta: sinon
        .stub()
        .callsFake(async (oid: string) =>
          oid === 'record-1' ? { redboxOid: oid, metaMetadata: { brandId: 'brand-1' } } : null
        ),
      hasViewAccess: sinon.stub().returns(true),
    };
    progress = {
      get: sinon.stub().returns(of([])),
      finish: sinon.stub().returns(of([{ id, relatedRecordId: 'record-1' }])),
      update: sinon.stub().returns(of([{ id, relatedRecordId: 'record-1' }])),
      start: sinon.stub(),
    };
    sockets = { issue: sinon.stub().returns('grant'), emit: sinon.stub().resolves() };
    f = await httpRouteFixture((router, input) =>
      mountProgressOperationRoutes(router, {
        ...input,
        records: records as any,
        progress: progress as any,
        sockets,
        audit: async () => {},
      })
    );
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  it('resolves and authorizes direct, persisted progress and composite room references', async function () {
    progress.get.callsFake((query: any) =>
      of(
        query.id === id || (query.relatedRecordId === 'record-1' && query.taskType === 'export')
          ? [{ id, relatedRecordId: 'record-1', taskType: 'export' }]
          : []
      )
    );
    for (const room of ['record-1', id, 'record-1-export'])
      expect(
        await authorizeProgressRoom(room, f.brand, f.actor, { records: records as any, progress: progress as any }),
        room
      ).to.equal(true);
    expect(records.hasViewAccess.callCount).to.equal(3);
  });
  it('rejects invalid rooms, revoked permission, missing actors and retired socket RPC subscriptions', async function () {
    expect(
      await authorizeProgressRoom('unknown-room', f.brand, f.actor, {
        records: records as any,
        progress: progress as any,
      })
    ).to.equal(false);
    records.hasViewAccess.returns(false);
    expect(
      await authorizeProgressRoom('record-1', f.brand, f.actor, { records: records as any, progress: progress as any })
    ).to.equal(false);
    const retired = await f.request('/default/portal/asynch/subscribe/record-1');
    expect(retired.status).to.equal(410);
    expect(sockets.issue.called).to.equal(false);
    f.authenticate.resolves(false);
    expect((await f.request('/default/portal/asynch/subscribe/record-1')).status).to.equal(401);
  });
  for (const [method, owner] of [
    ['DELETE', 'finish'],
    ['PUT', 'update'],
  ] as const)
    it(`only ${owner === 'finish' ? 'stops' : 'updates'} jobs owned by the authenticated actor`, async function () {
      progress.get.callsFake((query: any) =>
        of(
          query.id === id
            ? [{ id, started_by: 'alice', relatedRecordId: 'record-1' }]
            : query.id === other
              ? [{ id: other, started_by: 'bob', relatedRecordId: 'record-1' }]
              : []
        )
      );
      const request = (job: string) =>
        f.request('/default/portal/asynch', {
          method,
          body: { id: job, relatedRecordId: 'record-1', taskType: 'export', status: 'running' },
        });
      expect((await request(id)).status).to.equal(200);
      expect(progress[owner].calledOnce).to.equal(true);
      expect((await request(other)).status).to.equal(403);
      f.authenticate.resolves(false);
      expect((await request(id)).status).to.equal(401);
      expect(progress[owner].callCount).to.equal(1);
    });
});
