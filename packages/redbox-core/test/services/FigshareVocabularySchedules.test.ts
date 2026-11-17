import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareVocabularyService';
import { figshareSourceUpdateInput, updateFigshareSourceRoute } from '../../src/api-routes/groups/figshare-source-update';
import { agendaQueue } from '../../src/config/agendaQueue.config';

describe('Figshare vocabulary source updates and schedules', () => {
  let service: any; let source: any; let claimed: boolean; let release: sinon.SinonStub; let updates: any[];
  const ctx = { brandId: 'brand-a', userId: 'admin-a' };
  const input = () => ({ expectedRevision: source.settingsRevision ?? 0, displayName: 'Renamed source', scope: 'public', archived: false, syncSchedule: 'daily' });
  beforeEach(() => {
    source = { id: 'source-a', branding: ctx.brandId, scope: 'public', taxonomyId: '100', displayName: 'Old', syncSchedule: 'manual', archived: false, vocabulary: 'vocabulary-a' };
    claimed = false; updates = [];
    service = new Services.FigshareVocabularyService();
    release = sinon.stub().callsFake(async () => { claimed = false; return { id: 'claim' }; });
    (global as any).CacheEntry = {
      create: sinon.stub().callsFake(() => ({ fetch: async () => { if (claimed) throw Object.assign(new Error('duplicate'), { code: 'E_UNIQUE' }); claimed = true; return { id: 'claim' }; } })),
      destroyOne: release,
    };
    (global as any).FigshareVocabularySource = {
      findOne: sinon.stub().callsFake(async where => where.id === source.id && where.branding === source.branding ? { ...source } : null),
      updateOne: sinon.stub().callsFake(() => ({ set: async values => { updates.push(values); Object.assign(source, values); return source; } })),
      find: sinon.stub().callsFake(() => ({ sort: () => ({ limit: async () => [source] }) })),
    };
    (global as any).sails = { log: { warn: sinon.stub() } };
    sinon.stub(service, 'describeSource').callsFake(async value => ({ ...value }));
  });
  afterEach(() => { sinon.restore(); for (const key of ['CacheEntry','FigshareVocabularySource','sails']) delete (global as any)[key]; });
  it('validates strict metadata and a session/CSRF update contract', () => {
    expect(figshareSourceUpdateInput.safeParse(input()).success).to.equal(true);
    for (const change of [{ displayName: '' }, { displayName: '<script>' }, { scope: 'other' }, { syncSchedule: '* * * * *' }, { expectedRevision: -1 }, { connectionKey: 'arbitrary' }]) expect(figshareSourceUpdateInput.safeParse({ ...input(), ...change }).success).to.equal(false);
    expect(updateFigshareSourceRoute.csrf).to.equal(true);
    expect(updateFigshareSourceRoute.extensions?.['x-redbox-roles']).to.deep.equal(['Admin']);
  });
  it('persists revision-checked edits only in the route brand and registers a real Agenda job', async () => {
    const result = await service.updateSource(source.id, input(), ctx);
    expect(result.displayName).to.equal('Renamed source'); expect(result.settingsRevision).to.equal(1);
    expect(Date.parse(result.nextSyncAt) - Date.now()).to.be.closeTo(24 * 60 * 60 * 1000, 1000);
    expect(release.calledOnce).to.equal(true);
    const job: any = (agendaQueue.jobs as any)['Figshare-Vocabulary-Schedules'];
    expect(job.fnName).to.equal('figsharevocabularyservice.scheduledSyncJob');
    expect(job.backend).to.equal('mongodb'); expect(job.schedule.intervalOrSchedule).to.equal('5 minutes');
    let error: any; try { await service.updateSource(source.id, input(), { ...ctx, brandId: 'other-brand' }); } catch (caught) { error = caught; }
    expect(error.code).to.equal('relationship-boundary');
  });
  it('rejects stale edits and identity scope changes, and manual/archive clear scheduling', async () => {
    for (const draft of [{ ...input(), expectedRevision: 1 }, { ...input(), scope: 'account' }]) {
      let error: any; try { await service.updateSource(source.id, draft, ctx); } catch (caught) { error = caught; }
      expect(error).to.exist;
    }
    expect(updates).to.have.length(0);
    await service.updateSource(source.id, { ...input(), syncSchedule: 'weekly' }, ctx);
    expect(Date.parse(source.nextSyncAt) - Date.now()).to.be.closeTo(7 * 24 * 60 * 60 * 1000, 1000);
    await service.updateSource(source.id, { ...input(), archived: true }, ctx); expect(source.nextSyncAt).to.equal(null);
    await service.updateSource(source.id, { ...input(), syncSchedule: 'manual' }, ctx); expect(source.nextSyncAt).to.equal(null);
  });
  it('runs due sources, preserves mapping review and records failures without changing last success', async () => {
    source.syncSchedule = 'daily'; source.nextSyncAt = '2026-01-01T00:00:00Z'; source.lastSyncedAt = '2025-01-01T00:00:00Z';
    const preview = sinon.stub(service, 'createPreview').resolves({ runId: 'run-a', remoteHash: 'remote' });
    const apply = sinon.stub(service, 'applyPreviewUnlocked').resolves({});
    await service.scheduledSyncJob();
    expect(preview.firstCall.args[0]).to.deep.equal({ scope: 'public', taxonomyId: '100', sourceId: source.id });
    expect(apply.firstCall.args[1]).to.deep.equal({ remoteHash: 'remote' });
    expect(source.lastScheduleStatus).to.equal('succeeded');
    expect(source.lastSyncedAt).to.equal('2025-01-01T00:00:00Z'); // only normal apply updates the success cursor
    source.nextSyncAt = '2026-01-01T00:00:00Z'; preview.rejects(new Error('private credential'));
    await service.scheduledSyncJob(); expect(source.lastScheduleStatus).to.equal('failed');
    expect(source.lastSyncedAt).to.equal('2025-01-01T00:00:00Z');
    expect(JSON.stringify(source)).not.to.include('credential');
  });
  it('prevents overlapping scheduled syncs, manual apply and edits with the same distributed claim', async () => {
    source.syncSchedule = 'daily'; source.nextSyncAt = '2026-01-01T00:00:00Z';
    let finish: (value: any) => void;
    const preview = sinon.stub(service, 'createPreview').returns(new Promise(resolve => { finish = resolve; }));
    const apply = sinon.stub(service, 'applyPreviewUnlocked').resolves({});
    sinon.stub(service, 'requireRun').resolves({ scope: source.scope, taxonomyId: source.taxonomyId, source: source.id, state: 'previewed' });
    const running = service.scheduledSyncJob();
    await new Promise(resolve => setImmediate(resolve));
    await service.scheduledSyncJob();
    expect(preview.calledOnce).to.equal(true);
    let conflict: any; try { await service.updateSource(source.id, input(), ctx); } catch (error) { conflict = error; }
    expect(conflict.code).to.equal('stale-preview');
    try { await service.applyPreview('manual-run', { remoteHash: 'x' }, ctx); } catch (error) { conflict = error; }
    expect(conflict.code).to.equal('stale-preview');
    expect(apply.called).to.equal(false);
    finish!({ runId: 'run', remoteHash: 'x' }); await running;
    expect(apply.calledOnce).to.equal(true); expect(claimed).to.equal(false);
  });
  it('does not sync archived, manual, or not-yet-due sources even after a stale dispatcher read', async () => {
    const preview = sinon.stub(service, 'createPreview');
    for (const change of [{ archived: true, syncSchedule: 'daily', nextSyncAt: '2026-01-01' }, { archived: false, syncSchedule: 'manual' }, { syncSchedule: 'daily', nextSyncAt: '2999-01-01' }]) {
      Object.assign(source, change); await service.scheduledSyncJob();
    }
    expect(preview.called).to.equal(false);
  });
});
