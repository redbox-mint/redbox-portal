import { firstValueFrom } from 'rxjs';
import * as sinon from 'sinon';
import type { Job } from 'agenda';
import { StorageServiceResponse, UserModel } from '@researchdatabox/redbox-core';

describe('The RecordsService', function () {
  this.timeout(60_000);

  let recordsService;
  const createdOids: string[] = [];
  const createdUserIds: string[] = [];

  async function waitForJob<T>(completion: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out waiting for the legacy audit Agenda job')), 15000);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  before(function () {
    recordsService = sails.services.recordsservice;
    if (typeof recordsService.getServices === 'function') {
      recordsService.getServices(recordsService);
    }
  });

  afterEach(async function () {
    if (createdOids.length > 0) {
      const oidsToDelete = createdOids.splice(0, createdOids.length);
      if (typeof RecordAudit !== 'undefined') {
        await RecordAudit.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof DeletedRecord !== 'undefined') {
        await DeletedRecord.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof Record !== 'undefined') {
        await Record.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
    }

    if (createdUserIds.length > 0) {
      const userIds = createdUserIds.splice(0, createdUserIds.length);
      if (typeof User !== 'undefined') {
        await User.destroy({ id: userIds });
      }
    }
  });

  it('resolves record permissions to user summaries and preserves pending access metadata', async function () {
    const suffix = Date.now().toString();
    const editorUsername = `recordaudit-editor-${suffix}`;
    const viewerUsername = `recordaudit-viewer-${suffix}`;

    const editor = await firstValueFrom(
      UsersService.addLocalUser(editorUsername, 'Record Audit Editor', `${editorUsername}@example.edu.au`, 'RBTest123!')
    );
    const viewer = await firstValueFrom(
      UsersService.addLocalUser(viewerUsername, 'Record Audit Viewer', `${viewerUsername}@example.edu.au`, 'RBTest123!')
    );
    createdUserIds.push(String(editor.id), String(viewer.id));

    const brand = BrandingService.getDefault();
    const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
    const requestedOid = `records-service-permissions-${suffix}`;

    const createResponse = await recordsService.create(
      brand,
      {
        redboxOid: requestedOid,
        metadata: {
          title: 'RecordsService permission summary integration test',
        },
        workflow: {
          stage: 'draft',
          name: 'Draft',
        },
        metaMetadata: {
          type: 'rdmp',
          packageType: 'rdmp',
          brandId: brand.id,
          createdBy: 'admin',
          searchCore: 'default',
          form: 'default-1.0-draft',
          attachmentFields: [],
        },
        authorization: {
          edit: [editorUsername, 'missing-record-audit-user'],
          view: [viewerUsername],
          editRoles: ['Admin'],
          viewRoles: ['Librarians'],
          editPending: ['pending-edit@example.edu.au'],
          viewPending: ['pending-view@example.edu.au'],
        },
      },
      recordType,
      { username: 'admin', password: 'audit-password', token: 'audit-token' },
      false,
      false
    );

    expect(createResponse.isSuccessful()).to.equal(true);
    const oid = String(createResponse.oid);
    createdOids.push(oid);

    // A completed save exposes its audit immediately, without waiting for an Agenda worker.
    const audits = await RecordAudit.find({ redboxOid: oid, action: 'created' });
    expect(audits).to.have.length(1);
    expect(audits[0].action).to.equal('created');
    expect(audits[0].record.metadata.title).to.equal('RecordsService permission summary integration test');
    expect(audits[0].occurredAt).to.equal(audits[0].record.metaMetadata.createdOn);
    expect(audits[0].user).to.deep.equal({ username: 'admin' });

    const summary = await recordsService.getResolvedPermissionsSummary(oid);

    expect(summary.edit).to.deep.equal([
      {
        username: editorUsername,
        name: 'Record Audit Editor',
        email: `${editorUsername}@example.edu.au`,
      },
      {
        username: 'missing-record-audit-user',
        name: '',
        email: '',
      },
    ]);
    expect(summary.view).to.deep.equal([
      {
        username: viewerUsername,
        name: 'Record Audit Viewer',
        email: `${viewerUsername}@example.edu.au`,
      },
    ]);
    expect(summary.editRoles).to.deep.equal(['Admin']);
    expect(summary.viewRoles).to.deep.equal(['Librarians']);
    expect(summary.editPending).to.deep.equal(['pending-edit@example.edu.au']);
    expect(summary.viewPending).to.deep.equal(['pending-view@example.edu.au']);
  });

  it('retains the restored response snapshot and class-backed actor through the Mongo audit sanitizer', async function () {
    const oid = `records-service-restored-audit-${Date.now()}`;
    createdOids.push(oid);
    const brand = BrandingService.getDefault();
    await DeletedRecord.create({
      redboxOid: oid,
      deletedRecordMetadata: {
        redboxOid: oid,
        metadata: { title: 'Restored record audit regression' },
        metaMetadata: { brandId: brand.id, type: 'rdmp', createdBy: 'admin' },
        workflow: { stage: 'draft' },
        authorization: { edit: ['admin'], view: ['admin'] }
      }
    });
    const actor = new UserModel();
    actor.username = 'admin';
    actor.password = 'restore-password';
    actor.token = 'restore-token';
    actor.lastLogin = new Date('2026-03-01T12:00:00Z');
    const startedAt = Date.now();

    const response = await recordsService.restoreRecord(oid, actor);

    expect(response).to.be.instanceOf(StorageServiceResponse);
    expect(response.isSuccessful()).to.equal(true);
    const audits = await RecordAudit.find({ redboxOid: oid, action: 'restored' });
    expect(audits).to.have.length(1);
    expect(audits[0].record).to.deep.equal(JSON.parse(JSON.stringify(response)));
    expect(audits[0].record.metadata.metadata.title).to.equal('Restored record audit regression');
    expect(audits[0].user).to.deep.equal(JSON.parse(JSON.stringify(actor)));
    expect(audits[0].user).to.include({ username: 'admin', lastLogin: '2026-03-01T12:00:00.000Z' });
    expect(audits[0].user).not.to.have.property('password');
    expect(audits[0].user).not.to.have.property('token');
    expect(Date.parse(audits[0].occurredAt)).to.be.within(startedAt, Date.now());
  });

  for (const failWrite of [false, true]) {
    it(`dispatches the configured legacy audit job and records ${failWrite ? 'storage failure' : 'completion after persistence'}`, async function () {
      const oid = `records-service-agenda-audit-${Date.now()}-${failWrite}`;
      createdOids.push(oid);
      const storageService = sails.services[sails.config.storage.serviceName];
      const originalWrite = storageService.createRecordAudit.bind(storageService);
      let releaseWrite!: () => void;
      let signalStarted!: () => void;
      const released = new Promise<void>(resolve => { releaseWrite = resolve; });
      const started = new Promise<void>(resolve => { signalStarted = resolve; });
      const failureMessage = 'Legacy audit integration storage failure';
      const write = sinon.stub(storageService, 'createRecordAudit').callsFake(async (payload: unknown) => {
        if (_.get(payload, 'redboxOid') !== oid) return originalWrite(payload);
        signalStarted();
        await released;
        if (failWrite) throw new Error(failureMessage);
        return originalWrite(payload);
      });
      let queuedJob: Job | undefined;
      let resolveComplete!: (job: Job) => void;
      let didComplete = false;
      const completed = new Promise<Job>(resolve => { resolveComplete = resolve; });
      const onComplete = (job: Job) => {
        if (_.get(job.attrs.data, 'redboxOid') === oid) {
          didComplete = true;
          resolveComplete(job);
        }
      };
      const jobName = sails.config.record.auditing.recordAuditJobName;

      try {
        queuedJob = await AgendaQueueService.now(jobName, {
          redboxOid: oid, action: 'updated', user: { username: 'admin' },
          record: { metadata: { title: 'Dispatched legacy snapshot' } }
        });
        queuedJob.agenda.on(`complete:${jobName}`, onComplete);
        await waitForJob(started);
        // Give Agenda time to expose an incorrectly completed fire-and-forget handler.
        await new Promise(resolve => setTimeout(resolve, 100));
        const running = await queuedJob.agenda.db.getJobById(String(queuedJob.attrs._id));
        expect(didComplete).to.equal(false);
        expect(running?.lastFinishedAt == null).to.equal(true);
        expect(running?.failedAt == null).to.equal(true);
        expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);

        releaseWrite();
        await waitForJob(completed);
        const finished = await queuedJob.agenda.db.getJobById(String(queuedJob.attrs._id));
        if (failWrite) {
          expect(finished?.failedAt).to.be.instanceOf(Date);
          expect(finished?.failReason).to.equal(failureMessage);
          expect(finished?.failCount).to.equal(1);
          expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);
        } else {
          expect(finished?.lastFinishedAt).to.be.instanceOf(Date);
          expect(finished?.failedAt == null).to.equal(true);
          const audits = await RecordAudit.find({ redboxOid: oid });
          expect(audits).to.have.length(1);
          expect(audits[0].record.metadata.title).to.equal('Dispatched legacy snapshot');
        }
      } finally {
        releaseWrite();
        try {
          if (queuedJob) await waitForJob(completed);
        } finally {
          write.restore();
          if (queuedJob) {
            queuedJob.agenda.off(`complete:${jobName}`, onComplete);
            await queuedJob.remove();
          }
        }
      }
    });
  }

  it('persists an outstanding legacy audit before the worker completes', async function () {
    const oid = `records-service-legacy-audit-${Date.now()}`;
    createdOids.push(oid);
    const data = {
      redboxOid: oid,
      action: 'updated',
      user: { username: 'admin' },
      record: { metadata: { title: 'Legacy snapshot' }, lastSaveDate: '2026-03-01T12:00:00Z' }
    };

    await recordsService.storeRecordAudit({ attrs: { data } });

    const audits = await RecordAudit.find({ redboxOid: oid });
    expect(audits).to.have.length(1);
    expect(audits[0].record).to.deep.equal(data.record);
    expect(audits[0].user).to.deep.equal(data.user);
    expect(audits[0].action).to.equal('updated');
  });
});
