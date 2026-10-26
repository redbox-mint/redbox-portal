const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { getProgressRepositories } from '@researchdatabox/redbox-core';

describe('J1 progress/workspace persistence through the selected backend', () => {
  it('uses its independent selector and preserves progress lifecycle and references through service Observables', async () => {
    const repositories = getProgressRepositories(fixture.owner),
      brand = fixture.services.BrandingService.getDefault();
    const row = await firstValueFrom(
      fixture.services.AsynchsService.start({
        name: 'p5-progress',
        branding: brand.id,
        started_by: 'admin',
        relatedRecordId: 'p5-opaque-oid',
        taskType: 'p5-test',
        targetIdx: 2,
        metadata: { result: false },
      })
    );
    const id = String(row.id);
    try {
      const read = await repositories.progress.listProgress({ id });
      assert.equal(read[0].branding, brand.id);
      assert.equal(read[0].relatedRecordId, 'p5-opaque-oid');
      assert.equal(read[0].currentIdx, 0);
      await firstValueFrom(
        fixture.services.AsynchsService.update({ id }, { currentIdx: 2, metadata: { result: { done: true }, failures: [] } })
      );
      const finished = await firstValueFrom(fixture.services.AsynchsService.finish(id));
      assert.equal(finished[0].status, 'finished');
      assert(finished[0].date_completed);
      assert.equal((await repositories.progress.listProgress({ id })).length, 1);
    } finally {
      await repositories.progress.removeProgress({ id });
    }
  });
  it('retains workspace started/pending/finished/error results, service return arrays and cleanup', async () => {
    const workspaces = getProgressRepositories(fixture.owner).workspaces;
    const row = await firstValueFrom(
      fixture.services.WorkspaceAsyncService.start({
        name: 'p5-workspace',
        recordType: 'workspace',
        username: 'admin',
        service: 'test',
        method: 'run',
        args: [],
      })
    );
    const id = String(row.id);
    try {
      await workspaces.reviseStatus(id, { status: 'pending' });
      assert((await firstValueFrom(fixture.services.WorkspaceAsyncService.pending())).some(r => r.id === id));
      const rows = await firstValueFrom(
        fixture.services.WorkspaceAsyncService.update(id, { status: 'finished', message: { result: false, failures: [] } })
      );
      assert.equal(rows[0].status, 'finished');
      assert(rows[0].date_completed);
      await workspaces.reviseStatus(id, { status: 'error', message: { failure: 'fixture' } });
      assert((await workspaces.listStatus('error', 'workspace')).some(r => r.id === id));
    } finally {
      await workspaces.removeWork(id);
    }
  });
});
