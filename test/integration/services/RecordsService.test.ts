import { firstValueFrom } from 'rxjs';
import * as sinon from 'sinon';
import type { Agenda, Job } from 'agenda';
import { randomBytes } from 'node:crypto';
import { createServer, connect, Socket } from 'node:net';
import { StorageServiceResponse, UserModel } from '@researchdatabox/redbox-core';
import { AuditWriter, AuditWriteTimeout } from '../../../packages/redbox-core/src/services/record-audit/writer';

// Mongo's repository exposes these lifecycle methods in addition to Agenda's generic contract.
type MongoAuditQueueRepository = Agenda['db'] & {
  disconnect(): Promise<void>;
  getDb(): import('mongodb').Db;
  collection: { drop(): Promise<boolean> };
};

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
          timer = setTimeout(() => reject(new Error('Timed out waiting for the record audit Agenda job')), 15000);
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

  it('deduplicates simultaneous direct inserts and queue redelivery using the same audit ID', async function () {
    const oid = `records-service-idempotent-audit-${Date.now()}`;
    createdOids.push(oid);
    const storageService = sails.services[sails.config.storage.serviceName];
    const data = {
      auditId: randomBytes(12).toString('hex'), redboxOid: oid, action: 'updated',
      occurredAt: '2026-03-01T12:00:00Z', user: { username: 'admin' },
      record: { metadata: { title: 'Single event, multiple deliveries' } }
    };

    const responses = await Promise.all(Array.from({ length: 4 }, () => storageService.createRecordAudit(data)));
    expect(responses.every(response => response.success === true)).to.equal(true);
    await recordsService.recoverRecordAudit({ attrs: { data: JSON.parse(JSON.stringify(data)) } });
    const audits = await RecordAudit.find({ redboxOid: oid });
    expect(audits).to.have.length(1);
    expect(audits[0].id).to.equal(data.auditId);
    expect(audits[0].record).to.deep.equal(data.record);
    expect(audits[0].occurredAt).to.equal(data.occurredAt);
  });

  it('keeps index builds alive and releases stalled audit and Agenda write permits at the driver', async function () {
    // Exercise the driver's actual network timeout, rather than another Promise.race.
    const { MongoClient } = require(require.resolve('mongodb', { paths: [require.resolve('sails-mongo')] })) as typeof import('mongodb');
    for (const datastore of ['mongodb', 'redboxStorage']) {
      const options = sails.config.datastores[datastore];
      expect(options.socketTimeoutMS).to.be.greaterThan(0);
      const manager = sails.getDatastore(datastore).manager;
      expect(manager.client.options.socketTimeoutMS).to.equal(options.socketTimeoutMS);
    }
    const target = new URL(sails.config.datastores.redboxStorage.url);
    const targetHost = target.hostname;
    const targetPort = Number(target.port || 27017);
    const sockets = new Set<Socket>();
    let stalled = false;
    let responseDelayMs = 0;
    const proxy = createServer(socket => {
      socket.setNoDelay(true);
      const upstream = connect(targetPort, targetHost);
      upstream.setNoDelay(true);
      sockets.add(socket);
      sockets.add(upstream);
      socket.on('data', data => { if (!stalled) upstream.write(data); });
      upstream.on('data', data => {
        if (responseDelayMs > 0) setTimeout(() => { if (!socket.destroyed) socket.write(data); }, responseDelayMs);
        else socket.write(data);
      });
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
      socket.on('close', () => { sockets.delete(socket); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); socket.destroy(); });
    });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Mongo fault proxy has no TCP address');
    target.host = `127.0.0.1:${address.port}`;
    const client = new MongoClient(target.toString(), {
      socketTimeoutMS: 1000, waitQueueTimeoutMS: 250, connectTimeoutMS: 1000,
      serverSelectionTimeoutMS: 2000, maxPoolSize: 1, retryWrites: false
    });
    const collectionName = `auditDriverTimeoutTest_${randomBytes(12).toString('hex')}`;
    const queueCollection = `${collectionName}_jobs`;
    let dispatcher: Agenda | undefined;
    let stage = 'opening the proxy connection';
    try {
      const collection = client.db().collection(collectionName);
      await collection.insertOne({ warmup: true });
      stage = 'building an index beyond the ordinary socket timeout';
      responseDelayMs = 1500;
      const indexBuildOptions = { socketTimeoutMS: 0, maxTimeMS: 0 };
      await collection.createIndex({ warmup: 1 }, indexBuildOptions);
      responseDelayMs = 0;
      stage = 'ending a stalled write';
      stalled = true;
      const writer = new AuditWriter();
      let finishWrite!: () => void;
      const underlyingEnded = new Promise<void>(resolve => { finishWrite = resolve; });
      let driverFailure: unknown;
      try {
        await writer.run(async () => {
          try { await collection.insertOne({ stalled: true }); }
          catch (error) { driverFailure = error; throw error; }
          finally { finishWrite(); }
        }, { maxConcurrentWrites: 1, writeAttempts: 1, writeTimeoutMs: 25 });
        throw new Error('Expected the audit caller deadline to expire');
      } catch (error) {
        expect(error).to.be.instanceOf(AuditWriteTimeout);
      }
      const poolFailure = await collection.insertOne({ waitingForConnection: true }).then(() => null, error => error);
      expect(poolFailure).to.have.property('name', 'MongoWaitQueueTimeoutError');
      await waitForJob(underlyingEnded);
      expect(driverFailure).to.have.property('name', 'MongoNetworkTimeoutError');
      stalled = false;
      stage = 'writing after driver recovery';
      await writer.run(async () => { await collection.insertOne({ recovered: true }); }, {
        maxConcurrentWrites: 1, writeAttempts: 3, writeTimeoutMs: 5000
      });
      expect(await collection.countDocuments({ recovered: true })).to.equal(1);

      stage = 'opening Agenda’s separate Mongo connection';
      target.searchParams.set('retryWrites', 'false');
      target.searchParams.set('maxPoolSize', '1');
      target.searchParams.set('serverSelectionTimeoutMS', '2000');
      dispatcher = await AgendaQueueService.createAgendaForBackend('mongodb', {
        ...sails.config.agendaQueue.options, db: target.toString(), collection: queueCollection,
        mongoOptions: { socketTimeoutMS: 1000, waitQueueTimeoutMS: 250 }
      }, User.getDatastore().manager);
      const queued = await dispatcher!.now('audit-timeout-test', {});
      const repository = dispatcher!.db as MongoAuditQueueRepository;
      expect(repository.getDb().client.options.socketTimeoutMS).to.equal(1000);
      expect(repository.getDb().client.options.waitQueueTimeoutMS).to.equal(250);
      const enqueueWriter = new AuditWriter();
      let finishSave!: () => void;
      const saveEnded = new Promise<void>(resolve => { finishSave = resolve; });
      let saveFailure: unknown;
      stage = 'ending a stalled Agenda quarantine save';
      stalled = true;
      try {
        await enqueueWriter.run(async () => {
          try { await queued.disable().save(); }
          catch (error) { saveFailure = error; throw error; }
          finally { finishSave(); }
        }, { maxConcurrentWrites: 1, writeAttempts: 1, writeTimeoutMs: 25 });
        throw new Error('Expected the recovery caller deadline to expire');
      } catch (error) {
        expect(error).to.be.instanceOf(AuditWriteTimeout);
      }
      await waitForJob(saveEnded);
      expect(saveFailure).to.have.property('name', 'MongoNetworkTimeoutError');
      stalled = false;
      stage = 'enqueuing after Agenda driver recovery';
      await enqueueWriter.run(async () => { await dispatcher!.now('audit-timeout-recovered', {}); }, {
        maxConcurrentWrites: 1, writeAttempts: 3, writeTimeoutMs: 5000
      });
      expect(await repository.getDb().collection(queueCollection).countDocuments({ name: 'audit-timeout-recovered' })).to.equal(1);
    } catch (error) {
      throw new Error(`Mongo fault test failed while ${stage}`, { cause: error });
    } finally {
      stalled = false;
      responseDelayMs = 0;
      try {
        await RecordAudit.getDatastore().manager.collection(collectionName).drop();
        if (dispatcher) await (dispatcher.db as MongoAuditQueueRepository).collection.drop();
      }
      finally {
        if (dispatcher) await (dispatcher.db as MongoAuditQueueRepository).disconnect();
        await client.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => proxy.close(() => resolve()));
      }
    }
  });

  it('quarantines an invalid recovery snapshot without blocking valid jobs or allowing history cleanup to remove it', async function () {
    const oid = `records-service-quarantine-audit-${Date.now()}`;
    createdOids.push(oid);
    const jobName = sails.config.record.auditing.recordAuditRecoveryJobName;
    const options = {
      ...sails.config.agendaQueue.options, processEvery: '0.1 seconds',
      collection: `recordAuditQuarantineTest_${randomBytes(12).toString('hex')}`
    };
    let dispatcher: Agenda | undefined;
    try {
      dispatcher = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      const originalQueueConfig = sails.config.agendaQueue;
      const definition = originalQueueConfig.jobs[jobName];
      dispatcher!.define(jobName, async job => {
        // Mixed-backend deployments also accept job arrays. Keep this override local to handler execution.
        const config = sinon.stub(sails.config, 'agendaQueue').value({
          ...originalQueueConfig, options: { ...originalQueueConfig.options, backend: 'sqs' },
          jobs: [{ ...definition, name: jobName, backend: 'mongodb' }]
        });
        try { await recordsService.recoverRecordAudit(job); }
        finally { config.restore(); }
      }, definition.options);
      const snapshot = {
        auditId: randomBytes(12).toString('hex'), redboxOid: oid, action: { invalid: true },
        record: { metadata: { title: 'Retain for operator inspection' } }
      };
      const invalid = await dispatcher!.now(jobName, snapshot);
      const clientOptions = (dispatcher!.db as MongoAuditQueueRepository).getDb().client.options;
      expect(clientOptions.socketTimeoutMS).to.equal(30000);
      expect(clientOptions.waitQueueTimeoutMS).to.equal(30000);
      const valid = await dispatcher!.now(jobName, { ...snapshot, action: 'updated', auditId: randomBytes(12).toString('hex') });
      const completed = new Set<string>();
      let finish!: () => void;
      const finished = new Promise<void>(resolve => { finish = resolve; });
      dispatcher!.on(`complete:${jobName}`, job => {
        completed.add(String(job.attrs._id));
        if (completed.has(String(invalid.attrs._id)) && completed.has(String(valid.attrs._id))) finish();
      });
      await dispatcher!.start();
      await waitForJob(finished);
      const quarantined = await dispatcher!.db.getJobById(String(invalid.attrs._id));
      expect(quarantined?.disabled).to.equal(true);
      expect(quarantined?.failCount).to.equal(1);
      expect(quarantined?.nextRunAt == null).to.equal(true);
      expect(quarantined?.data).to.deep.equal(snapshot);
      expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(1);

      const config = sinon.stub(sails.config.agendaQueue, 'options').value(options);
      try { await AgendaQueueService.moveCompletedJobsToHistory({}); }
      finally { config.restore(); }
      expect((await dispatcher!.db.getJobById(String(invalid.attrs._id)))?.data).to.deep.equal(snapshot);
      expect(await dispatcher!.db.getJobById(String(valid.attrs._id)) == null).to.equal(true);
    } finally {
      if (dispatcher) {
        await dispatcher.stop(false);
        try {
          await (dispatcher.db as MongoAuditQueueRepository).collection.drop();
          await User.getDatastore().manager.collection(`${options.collection}History`).drop();
        } finally { await (dispatcher.db as MongoAuditQueueRepository).disconnect(); }
      }
    }
  });

  it('recovers a failed direct write after dispatcher reconstruction and persists retry backoff', async function () {
    const oid = `records-service-durable-audit-${Date.now()}`;
    createdOids.push(oid);
    const storageService = sails.services[sails.config.storage.serviceName];
    const originalWrite = storageService.createRecordAudit.bind(storageService);
    let storageAvailable = false;
    const write = sinon.stub(storageService, 'createRecordAudit').callsFake(async (payload: unknown) => {
      if (_.get(payload, 'redboxOid') === oid && !storageAvailable) throw new Error('Durable audit integration outage');
      return originalWrite(payload);
    });
    const jobName = sails.config.record.auditing.recordAuditRecoveryJobName;
    const options = {
      ...sails.config.agendaQueue.options, processEvery: '0.1 seconds',
      collection: `recordAuditRecoveryTest_${randomBytes(12).toString('hex')}`
    };
    const originalNow = AgendaQueueService.now.bind(AgendaQueueService);
    let enqueue: sinon.SinonStub | undefined;
    let producer: Agenda | undefined;
    let queuedJob: Job | undefined;
    let restarted: Agenda | undefined;
    try {
      // The producer never starts polling. Existing application workers cannot see this collection.
      producer = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      const initial = producer!;
      enqueue = sinon.stub(AgendaQueueService, 'now').callsFake((name: string, data: unknown) => {
        return name === jobName && _.get(data, 'redboxOid') === oid
          ? initial.now(name, data)
          : originalNow(name, data);
      });
      await recordsService.auditRecord(oid, {
        metadata: { title: 'Snapshot retained through restart' }, lastSaveDate: '2026-03-01T12:00:00Z'
      }, { username: 'admin', password: 'secret', token: 'secret-token' });
      const recoveryCall = enqueue.getCalls().find(call => call.args[0] === jobName && _.get(call.args[1], 'redboxOid') === oid);
      if (!recoveryCall) throw new Error('Failed direct audit was not enqueued for recovery');
      queuedJob = await recoveryCall.returnValue;
      const saved = await initial.db.getJobById(String(queuedJob!.attrs._id));
      expect(saved?.data.auditId).to.match(/^[a-f0-9]{24}$/);
      expect(saved?.data.user).to.deep.equal({ username: 'admin' });
      expect(saved?.data.record.metadata.title).to.equal('Snapshot retained through restart');
      expect(saved?.data.occurredAt).to.equal('2026-03-01T12:00:00Z');

      // A fresh dispatcher reads the Mongo-persisted job; no in-memory retry fiber is reused.
      restarted = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      expect(restarted!.attrs.processEvery).to.equal(100);
      const configuredJob = sails.config.agendaQueue.jobs[jobName];
      expect(typeof configuredJob.options.backoff).to.equal('function');
      restarted!.define(jobName, job => recordsService.recoverRecordAudit(job), configuredJob.options);
      let resolveFailed!: () => void;
      let resolveRecovered!: () => void;
      const failed = new Promise<void>(resolve => { resolveFailed = resolve; });
      const recovered = new Promise<void>(resolve => { resolveRecovered = resolve; });
      restarted!.on(`complete:${jobName}`, job => {
        if (_.get(job.attrs.data, 'redboxOid') !== oid) return;
        if (!storageAvailable) resolveFailed();
        else resolveRecovered();
      });
      await restarted!.start();
      await waitForJob(failed);
      const retrying = await restarted!.db.getJobById(String(queuedJob!.attrs._id));
      expect(retrying?.failCount).to.be.greaterThan(0);
      expect(retrying?.nextRunAt).to.be.instanceOf(Date);
      expect(retrying?.data.auditId).to.equal(saved!.data.auditId);
      expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);

      storageAvailable = true;
      await waitForJob(recovered);
      const finished = await restarted!.db.getJobById(String(queuedJob!.attrs._id));
      expect(finished?.nextRunAt == null).to.equal(true);
      expect(finished?.lastFinishedAt).to.be.instanceOf(Date);
      const audits = await RecordAudit.find({ redboxOid: oid });
      expect(audits).to.have.length(1);
      expect(audits[0].id).to.equal(saved!.data.auditId);
      expect(audits[0].record.metadata.title).to.equal('Snapshot retained through restart');
      expect(audits[0].occurredAt).to.equal(saved!.data.occurredAt);
    } finally {
      storageAvailable = true;
      if (restarted) await restarted.stop(false);
      write.restore();
      enqueue?.restore();
      try {
        if (producer) await (producer.db as MongoAuditQueueRepository).collection.drop();
      } finally {
        if (producer) await (producer.db as MongoAuditQueueRepository).disconnect();
        if (restarted) await (restarted.db as MongoAuditQueueRepository).disconnect();
      }
    }
  });
});
