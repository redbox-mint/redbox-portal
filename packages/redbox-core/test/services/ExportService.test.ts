import { expect } from 'chai';
import * as sinon from 'sinon';
import { PassThrough, Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { of } from 'rxjs';
import {
  Services,
  ExportServiceError,
  EXPORT_HEARTBEAT_MS,
  EXPORT_STALE_MS,
  EXPORT_METADATA_RETENTION_MS,
} from '../../src/services/ExportService';
import type { ExportJobModel } from '../../src/model/storage/ExportJobModel';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { UserModel } from '../../src/model/storage/UserModel';
import { RoleModel } from '../../src/model/storage/RoleModel';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

/** A small Mongo-shaped test double; real adapter/queue coverage lives in integration tests. */
function matches(row: ExportJobModel, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or' && Array.isArray(expected)) return expected.some(part => matches(row, part));
    const actual = row[key as keyof ExportJobModel];
    if (expected && typeof expected === 'object') {
      if ('$in' in expected && Array.isArray(expected.$in) && !expected.$in.includes(actual)) return false;
      if ('$ne' in expected && actual === expected.$ne) return false;
      if (
        '$gt' in expected &&
        typeof expected.$gt === 'number' &&
        !(typeof actual === 'number' && actual > expected.$gt)
      )
        return false;
      if (
        '$lte' in expected &&
        typeof expected.$lte === 'number' &&
        !(typeof actual === 'number' && actual <= expected.$lte)
      )
        return false;
      return true;
    }
    return actual === expected;
  });
}

function makeCollection(rows: ExportJobModel[]) {
  const update = (filter: Record<string, unknown>, change: { $set: Partial<ExportJobModel> }, many = false) => {
    let matchedCount = 0;
    for (const row of rows) {
      if (!matches(row, filter)) continue;
      Object.assign(row, change.$set);
      matchedCount++;
      if (!many) break;
    }
    return { matchedCount, modifiedCount: matchedCount };
  };
  return {
    createIndex: sinon.stub().resolves('index'),
    insertOne: sinon.stub().callsFake(async (row: ExportJobModel) => {
      rows.push(structuredClone(row));
      return {};
    }),
    findOne: sinon.stub().callsFake(async (filter: Record<string, unknown>) => {
      const row = rows.find(row => matches(row, filter));
      return row ? structuredClone(row) : null;
    }),
    findOneAndUpdate: sinon
      .stub()
      .callsFake(async (filter: Record<string, unknown>, change: { $set: Partial<ExportJobModel> }) => {
        const row = rows.find(row => matches(row, filter));
        if (!row) return null;
        Object.assign(row, change.$set);
        return structuredClone(row);
      }),
    updateOne: sinon
      .stub()
      .callsFake(async (filter: Record<string, unknown>, change: { $set: Partial<ExportJobModel> }) =>
        update(filter, change)
      ),
    updateMany: sinon
      .stub()
      .callsFake(async (filter: Record<string, unknown>, change: { $set: Partial<ExportJobModel> }) =>
        update(filter, change, true)
      ),
    deleteMany: sinon.stub().callsFake(async (filter: Record<string, unknown>) => {
      for (let idx = rows.length - 1; idx >= 0; idx--) if (matches(rows[idx], filter)) rows.splice(idx, 1);
      return {};
    }),
    distinct: sinon.stub().callsFake(async (key: keyof ExportJobModel) => [...new Set(rows.map(row => row[key]))]),
    find: sinon.stub().callsFake((filter: Record<string, unknown>) => {
      let selected = rows.filter(row => matches(row, filter)).map(row => structuredClone(row));
      const cursor = {
        sort: () => {
          selected.sort((a, b) => b.createdAt - a.createdAt);
          return cursor;
        },
        limit: (limit: number) => {
          selected = selected.slice(0, limit);
          return cursor;
        },
        batchSize: () => cursor,
        toArray: async () => selected,
        async *[Symbol.asyncIterator]() {
          yield* selected;
        },
      };
      return cursor;
    }),
  };
}

describe('ExportService', function () {
  let service: Services.Export;
  let rows: ExportJobModel[];
  let collection: ReturnType<typeof makeCollection>;
  let clock: sinon.SinonFakeTimers;
  let brand: BrandingModel;
  let user: UserModel;
  let context: { brand: BrandingModel; portal: string; user: UserModel };
  let mockSails: ReturnType<typeof createMockSails>;
  let files: Map<string, Buffer>;
  let disk: {
    putStream: sinon.SinonStub;
    getStream: sinon.SinonStub;
    getMetaData: sinon.SinonStub;
    exists: sinon.SinonStub;
    delete: sinon.SinonStub;
    listAll: sinon.SinonStub;
    listIncompleteUploads: sinon.SinonStub;
  };
  let manager: { getDiskConfig: sinon.SinonStub; bootstrap: sinon.SinonStub; disk: sinon.SinonStub };
  let queue: { now: sinon.SinonStub };
  let users: { getEffectiveUser: sinon.SinonStub };
  let records: { exportAllPlans: sinon.SinonStub };

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      now: Date.parse('2026-10-30T00:00:00Z'),
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    rows = [];
    collection = makeCollection(rows);
    brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
    user = Object.assign(new UserModel(), {
      id: 'user-1',
      username: 'librarian',
      roles: [Object.assign(new RoleModel(), { id: 'role-1', name: 'Librarians', branding: brand })],
    });
    context = { brand, portal: 'rdmp', user };
    files = new Map();
    disk = {
      putStream: sinon.stub().callsFake(async (key: string, stream: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        files.set(key, Buffer.concat(chunks));
      }),
      getStream: sinon.stub().callsFake(async (key: string) => Readable.from([files.get(key)])),
      getMetaData: sinon
        .stub()
        .callsFake(async (key: string) => ({ contentLength: files.get(key)?.length ?? 0, lastModified: new Date() })),
      exists: sinon.stub().callsFake(async (key: string) => files.has(key)),
      delete: sinon.stub().callsFake(async (key: string) => {
        files.delete(key);
      }),
      listAll: sinon.stub().resolves({ objects: [] }),
      listIncompleteUploads: sinon.stub().resolves([]),
    };
    manager = {
      getDiskConfig: sinon.stub().returns({ driver: 'gridfs', config: { visibility: 'private' } }),
      bootstrap: sinon.stub().resolves(),
      disk: sinon.stub().returns(disk),
    };
    queue = { now: sinon.stub().resolves({}) };
    users = { getEffectiveUser: sinon.stub().callsFake(() => of(user)) };
    records = { exportAllPlans: sinon.stub().callsFake(() => Readable.from(['\uFEFF"title"\n"Test"'])) };
    mockSails = createMockSails({
      config: { record: { export: { background: { diskName: 'exports', retentionHours: 24, maxRunMinutes: 60 } } } },
    });
    setupServiceTestGlobals(mockSails);
    Object.assign(globalThis, {
      ExportJob: { tableName: 'exportjob', getDatastore: () => ({ manager: { collection: () => collection } }) },
      StorageManagerService: manager,
      AgendaQueueService: queue,
      UsersService: users,
      RecordsService: records,
      RecordTypesService: { get: sinon.stub().returns(of({ name: 'rdmp' })) },
      BrandingService: { getBrandById: sinon.stub().returns(brand) },
      PathRulesService: { getRulesFromPath: sinon.stub().returns(null), canRead: sinon.stub().returns(true) },
    });
    service = new Services.Export();
  });

  afterEach(function () {
    clock.restore();
    sinon.restore();
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(globalThis, 'ExportJob');
  });

  const request = { format: 'csv' as const, recType: 'rdmp' };
  const filename = 'Plan - Exported Records.csv';
  const prepare = async () => {
    const dto = await service.createJob(context, request, filename);
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    return dto.id;
  };
  const error = async (work: Promise<unknown>, status: number, code?: string) => {
    try {
      await work;
      expect.fail('Expected an export error.');
    } catch (failure) {
      expect(failure).to.be.instanceOf(ExportServiceError);
      if (!(failure instanceof ExportServiceError)) throw failure;
      expect(failure.status).to.equal(status);
      if (code) expect(failure.code).to.equal(code);
    }
  };

  it('validates config/indexes during initialization without resolving disks before ready', async function () {
    await service.init();
    expect(collection.createIndex.callCount).to.equal(7);
    expect(manager.bootstrap.called).to.equal(false);
    expect(manager.disk.called).to.equal(false);
  });

  it('keeps startup available when the export disk is missing or public but refuses export requests', async function () {
    for (const missing of [true, false]) {
      if (missing) manager.getDiskConfig.throws(new Error('Unknown disk: exports'));
      else manager.getDiskConfig.resetBehavior();
      if (!missing) manager.getDiskConfig.returns({ driver: 'gridfs', config: { visibility: 'public' } });
      await service.init();
      expect(collection.createIndex.callCount).to.equal(7);
      expect(manager.disk.called).to.equal(false);
      await error(service.createJob(context, request, filename), 503, 'export-storage-unavailable');
      await error(
        service.generateCsvJob({ attrs: { data: { jobId: randomUUID() } } }),
        503,
        'export-storage-unavailable'
      );
    }
  });

  it('still propagates index initialization failures', async function () {
    collection.createIndex.rejects(new Error('Index unavailable'));
    try {
      await service.init();
      expect.fail('Index errors must not be swallowed.');
    } catch (failure) {
      expect(failure).to.have.property('message', 'Index unavailable');
    }
  });

  it('accepts a durable job without scanning records or opening an artifact stream', async function () {
    const dto = await service.createJob(context, request, filename);
    expect(dto.status).to.equal('queued');
    expect(dto.downloadUrl).to.equal(null);
    expect(queue.now.firstCall.args).to.deep.equal(['ExportService-GenerateCsv', { jobId: dto.id }]);
    expect(records.exportAllPlans.called).to.equal(false);
    expect(disk.putStream.called).to.equal(false);
    expect(rows[0].enqueuedAt).to.equal(Date.now());
    expect(dto).not.to.have.any.keys('diskName', 'objectKey', 'authorizationContext', 'attemptId');
  });

  it('waits for durable enqueue acknowledgement before accepting a job', async function () {
    let acknowledge: (() => void) | undefined;
    queue.now.callsFake(
      () =>
        new Promise<void>(resolve => {
          acknowledge = resolve;
        })
    );
    let accepted = false;
    const creating = service.createJob(context, request, filename).then(() => {
      accepted = true;
    });
    await clock.tickAsync(0);
    expect(accepted).to.equal(false);
    expect(rows[0].enqueuedAt).to.equal(null);
    acknowledge?.();
    await creating;
    expect(accepted).to.equal(true);
  });

  it('records enqueue failures and refuses late delivery of failed jobs', async function () {
    queue.now.rejects(new Error('queue unavailable'));
    await error(service.createJob(context, request, filename), 503, 'export-enqueue-failed');
    expect(rows[0].status).to.equal('failed');
    await service.generateCsvJob({ attrs: { data: { jobId: rows[0].jobId } } });
    expect(records.exportAllPlans.called).to.equal(false);
  });

  it('normalizes timestamp bounds and rejects reversed or invalid dates before enqueue', async function () {
    const dto = await service.createJob(context, { ...request, after: '2026-10-01T11:00:00+11:00' }, filename);
    expect(dto.modifiedAfter).to.equal('2026-10-01T00:00:00.000Z');
    await error(service.createJob(context, { ...request, before: '2026-02-30T00:00:00Z' }, filename), 400);
    await error(
      service.createJob(
        context,
        { ...request, after: '2026-10-02T00:00:00Z', before: '2026-10-01T00:00:00Z' },
        filename
      ),
      400
    );
    expect(queue.now.callCount).to.equal(1);
  });

  it('rejects unsupported record types and private disk configuration failures', async function () {
    Object.assign(globalThis, { RecordTypesService: { get: () => of(null) } });
    await error(service.createJob(context, request, filename), 400, 'export-invalid-record-type');
    manager.getDiskConfig.throws(new Error('missing disk'));
    await error(service.createJob(context, request, filename), 503, 'export-storage-unavailable');
    manager.getDiskConfig.returns({ driver: 's3', config: { visibility: 'public' } });
    manager.getDiskConfig.resetBehavior();
    manager.getDiskConfig.returns({ driver: 's3', config: { visibility: 'public' } });
    await error(service.createJob(context, request, filename), 503, 'export-storage-unavailable');
    expect(rows).to.have.length(0);
  });

  it('streams through the selected disk and publishes only a complete artifact', async function () {
    mockSails.config.record.export.background.diskName = 'private-s3';
    manager.getDiskConfig.returns({ driver: 's3', config: { visibility: 'private' } });
    const dto = await service.createJob(context, request, filename);
    const touched = sinon.stub().resolves();
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } }, touch: touched });
    expect(rows[0].status).to.equal('ready');
    expect(rows[0].objectKey).to.match(new RegExp(`^exports/${dto.id}/.*\\.csv$`));
    expect(manager.disk.alwaysCalledWith('private-s3')).to.equal(true);
    expect(disk.putStream.firstCall.args[2]).to.deep.equal({ visibility: 'private', contentType: 'text/csv' });
    expect(records.exportAllPlans.firstCall.args.slice(0, 4)).to.deep.equal([
      user.username,
      [{ ...user.roles[0], branding: brand.id }],
      brand,
      'csv',
    ]);
    const ready = await service.getJob(context, dto.id);
    expect(ready.downloadUrl).to.equal(`export/jobs/${dto.id}/download`);
    expect(Date.parse(ready.expiresAt!)).to.equal(Date.now() + 24 * 60 * 60 * 1000);
    const download = await service.openDownload(context, dto.id);
    const chunks: Buffer[] = [];
    for await (const chunk of download.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).to.equal('\uFEFF"title"\n"Test"');
    expect(download.byteLength).to.equal(Buffer.concat(chunks).length);
  });

  it('does not publish while the artifact upload is incomplete, and ignores duplicate deliveries', async function () {
    const source = new PassThrough();
    records.exportAllPlans.returns(source);
    const dto = await service.createJob(context, request, filename);
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    await clock.tickAsync(0);
    expect(rows[0].status).to.equal('running');
    await error(service.openDownload(context, dto.id), 409);
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    expect(records.exportAllPlans.callCount).to.equal(1);
    source.end('csv');
    await running;
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    expect(records.exportAllPlans.callCount).to.equal(1);
  });

  it('retains zero-byte exports as valid downloads', async function () {
    records.exportAllPlans.callsFake(() => Readable.from([]));
    const id = await prepare();
    expect((await service.openDownload(context, id)).byteLength).to.equal(0);
  });

  it('enforces owner, brand, portal, disabled account, and authorization changes', async function () {
    const id = await prepare();
    await error(service.getJob({ ...context, portal: 'other' }, id), 404);
    await error(service.getJob({ ...context, brand: { ...brand, id: 'brand-2' } }, id), 403);
    const second = Object.assign(new UserModel(), { ...user, id: 'user-2' });
    users.getEffectiveUser.returns(of(second));
    await error(service.getJob({ ...context, user: second }, id), 404);
    users.getEffectiveUser.returns(of(user));
    user.loginDisabled = true;
    await error(service.openDownload(context, id), 403);
    user.loginDisabled = false;
    user.roles.push(Object.assign(new RoleModel(), { id: 'extra-role', name: 'Admin', branding: brand }));
    await error(service.openDownload(context, id), 403, 'export-authorization-changed');
  });

  it('rechecks the requester when queued work starts', async function () {
    const dto = await service.createJob(context, request, filename);
    users.getEffectiveUser.returns(of(null));
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    expect(rows[0].status).to.equal('failed');
    expect(records.exportAllPlans.called).to.equal(false);
  });

  it('uses fresh brand roles for record visibility and honors path-rule overrides', async function () {
    const dto = await service.createJob(context, request, filename);
    const rules = [{ role: { id: 'custom-role' }, branding: brand, can_read: true }];
    const custom = Object.assign(new UserModel(), {
      ...user,
      roles: [Object.assign(new RoleModel(), { id: 'custom-role', name: 'CustomExport', branding: brand })],
    });
    users.getEffectiveUser.returns(of(custom));
    Object.assign(globalThis, { PathRulesService: { getRulesFromPath: () => rules, canRead: () => true } });
    await service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    expect(rows[0].status).to.equal('ready');
    expect(records.exportAllPlans.firstCall.args[1][0].name).to.equal('CustomExport');
  });

  it('keeps the queue lease and job heartbeat alive during silent preparation', async function () {
    const source = new PassThrough();
    records.exportAllPlans.returns(source);
    const dto = await service.createJob(context, request, filename);
    const touch = sinon.stub().resolves();
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } }, touch });
    await clock.tickAsync(EXPORT_HEARTBEAT_MS * 2);
    expect(touch.callCount).to.equal(2);
    expect(rows[0].heartbeatAt).to.equal(Date.now());
    source.end('csv');
    await running;
  });

  it('aborts on a failed heartbeat and never exposes the partial artifact', async function () {
    const source = new PassThrough();
    records.exportAllPlans.returns(source);
    const dto = await service.createJob(context, request, filename);
    const running = service.generateCsvJob({
      attrs: { data: { jobId: dto.id } },
      touch: sinon.stub().rejects(new Error('lease lost')),
    });
    await clock.tickAsync(EXPORT_HEARTBEAT_MS);
    await running;
    expect(source.destroyed).to.equal(true);
    expect(rows[0].status).to.equal('failed');
    expect(rows[0].errorCode).to.equal('export-worker-interrupted');
    expect((await service.getJob(context, dto.id)).downloadUrl).to.equal(null);
  });

  it('stops preparation when the execution deadline elapses', async function () {
    mockSails.config.record.export.background.maxRunMinutes = 0.001;
    const source = new PassThrough();
    records.exportAllPlans.returns(source);
    const dto = await service.createJob(context, request, filename);
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    await clock.tickAsync(61);
    await running;
    expect(rows[0].status).to.equal('failed');
    expect(rows[0].errorCode).to.equal('export-timed-out');
    expect(source.destroyed).to.equal(true);
  });

  it('fails storage writes safely and retries failed artifact deletion', async function () {
    disk.putStream.callsFake(async (key: string) => {
      files.set(key, Buffer.from('partial'));
      throw new Error('disk full');
    });
    disk.delete.rejects(new Error('deletion unavailable'));
    const id = await prepare();
    expect(rows[0].status).to.equal('failed');
    expect(rows[0].cleanedAt).to.equal(null);
    expect(files.size).to.equal(1);
    disk.delete.callsFake(async (key: string) => {
      files.delete(key);
    });
    await clock.tickAsync(EXPORT_STALE_MS);
    await service.maintenanceJob();
    expect(files.size).to.equal(0);
    expect(rows[0].cleanedAt).to.equal(Date.now());
    await error(service.openDownload(context, id), 409);
  });

  it('refuses publication after maintenance has failed the worker claim', async function () {
    disk.putStream.callsFake(async (key: string, stream: Readable) => {
      for await (const _chunk of stream) {
        // Consume the completed CSV before simulating another worker recovering its claim.
      }
      files.set(key, Buffer.from('csv'));
      rows[0].status = 'failed';
    });
    await prepare();
    expect(rows[0].status).to.equal('failed');
    expect(files.size).to.equal(0);
  });

  it('removes a late remote upload that settles after the execution deadline', async function () {
    mockSails.config.record.export.background.maxRunMinutes = 0.001;
    let finishUpload: (() => void) | undefined;
    disk.putStream.callsFake(async (key: string) => {
      await new Promise<void>(resolve => {
        finishUpload = resolve;
      });
      files.set(key, Buffer.from('late result'));
    });
    const dto = await service.createJob(context, request, filename);
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    await clock.tickAsync(61);
    await running;
    expect(rows[0].status).to.equal('failed');
    finishUpload?.();
    await clock.tickAsync(0);
    expect(rows[0].status).to.equal('failed');
    expect(files.size).to.equal(0);
  });

  it('blocks expired downloads immediately and deletes from the saved disk on maintenance', async function () {
    mockSails.config.record.export.background.retentionHours = 0.001;
    const id = await prepare();
    const savedKey = rows[0].objectKey;
    mockSails.config.record.export.background.diskName = 'new-export-disk';
    await clock.tickAsync(3600);
    await error(service.openDownload(context, id), 410);
    expect((await service.getJob(context, id)).status).to.equal('expired');
    expect(files.size).to.equal(1);
    await service.maintenanceJob();
    expect(disk.delete.calledWith(savedKey)).to.equal(true);
    expect(manager.disk.calledWith('exports')).to.equal(true);
    expect(rows[0].status).to.equal('expired');
    expect(rows).to.have.length(1);
    await clock.tickAsync(EXPORT_METADATA_RETENTION_MS);
    await service.maintenanceJob();
    expect(rows).to.have.length(0);
  });

  it('deletes a completed export immediately through its saved disk and hides its metadata', async function () {
    const id = await prepare();
    const key = rows[0].objectKey;
    mockSails.config.record.export.background.diskName = 'new-export-disk';
    manager.disk.resetHistory();
    await service.deleteJob(context, id);
    expect(rows[0].status).to.equal('deleted');
    expect(rows[0].cleanedAt).to.equal(Date.now());
    expect(disk.delete.calledOnceWithExactly(key)).to.equal(true);
    expect(manager.disk.calledOnceWithExactly('exports')).to.equal(true);
    expect(files.size).to.equal(0);
    expect(await service.listJobs(context)).to.deep.equal([]);
    await error(service.getJob(context, id), 404);
    await error(service.openDownload(context, id), 404);
    await service.deleteJob(context, id);
    expect(disk.delete.calledOnce).to.equal(true);
    await clock.tickAsync(EXPORT_METADATA_RETENTION_MS);
    await service.maintenanceJob();
    expect(rows).to.have.length(0);
  });

  it('does not reset the completion-based retention period when an export is downloaded', async function () {
    const id = await prepare();
    const expiresAt = rows[0].expiresAt;
    await clock.tickAsync(60_000);
    const download = await service.openDownload(context, id);
    for await (const _chunk of download.stream) {
      // Consume the download as a client would.
    }
    expect(rows[0].expiresAt).to.equal(expiresAt);
    expect(files.size).to.equal(1);
  });

  it('refuses to delete queued and running exports without cancelling preparation', async function () {
    const source = new PassThrough();
    records.exportAllPlans.returns(source);
    const dto = await service.createJob(context, request, filename);
    await error(service.deleteJob(context, dto.id), 409, 'export-in-progress');
    expect(rows[0].status).to.equal('queued');
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    await clock.tickAsync(0);
    await error(service.deleteJob(context, dto.id), 409, 'export-in-progress');
    expect(source.destroyed).to.equal(false);
    source.end('csv');
    await running;
    expect(rows[0].status).to.equal('ready');
    expect(disk.delete.called).to.equal(false);
  });

  it('rechecks deletion ownership, portal, brand and current export permission', async function () {
    const id = await prepare();
    await error(service.deleteJob({ ...context, portal: 'other' }, id), 404);
    await error(service.deleteJob({ ...context, brand: { ...brand, id: 'brand-2' } }, id), 403);
    const second = Object.assign(new UserModel(), { ...user, id: 'user-2' });
    users.getEffectiveUser.returns(of(second));
    await error(service.deleteJob({ ...context, user: second }, id), 404);
    users.getEffectiveUser.returns(of(user));
    user.loginDisabled = true;
    await error(service.deleteJob(context, id), 403);
    user.loginDisabled = false;
    user.roles = [];
    await error(service.deleteJob(context, id), 403);
    expect(rows[0].status).to.equal('ready');
    expect(disk.delete.called).to.equal(false);
  });

  it('revokes access before a slow storage deletion completes', async function () {
    const id = await prepare();
    let finishDelete: (() => void) | undefined;
    disk.delete.callsFake(async (key: string) => {
      await new Promise<void>(resolve => {
        finishDelete = resolve;
      });
      files.delete(key);
    });
    const deleting = service.deleteJob(context, id);
    await clock.tickAsync(0);
    expect(files.size).to.equal(1);
    expect(rows[0].status).to.equal('deleted');
    expect(await service.listJobs(context)).to.deep.equal([]);
    await error(service.getJob(context, id), 404);
    await error(service.openDownload(context, id), 404);
    finishDelete?.();
    await deleting;
    expect(files.size).to.equal(0);
  });

  it('keeps failed storage deletions hidden and retains their references until maintenance succeeds', async function () {
    const id = await prepare();
    disk.delete.rejects(new Error('storage offline'));
    await service.deleteJob(context, id);
    expect(rows[0].status).to.equal('deleted');
    expect(rows[0].cleanedAt).to.equal(null);
    await clock.tickAsync(EXPORT_METADATA_RETENTION_MS);
    await service.maintenanceJob();
    expect(rows).to.have.length(1);
    expect(files.size).to.equal(1);
    await error(service.openDownload(context, id), 404);
    disk.delete.callsFake(async (key: string) => {
      files.delete(key);
    });
    await service.maintenanceJob();
    expect(files.size).to.equal(0);
    expect(rows).to.have.length(0);
  });

  it('deletes failed jobs without artifacts and expired jobs idempotently', async function () {
    queue.now.rejects(new Error('queue offline'));
    await error(service.createJob(context, request, filename), 503);
    const failedId = rows[0].jobId;
    await service.deleteJob(context, failedId);
    expect(rows[0].status).to.equal('deleted');
    expect(rows[0].cleanedAt).to.equal(null);
    await clock.tickAsync(EXPORT_STALE_MS);
    await service.maintenanceJob();
    expect(rows[0].cleanedAt).to.equal(Date.now());
    queue.now.resolves({});
    const expiredId = await prepare();
    rows[1].status = 'expired';
    rows[1].expiresAt = Date.now() - 1;
    await service.deleteJob(context, expiredId);
    await service.deleteJob(context, expiredId);
    expect(rows[1].status).to.equal('deleted');
    expect(files.size).to.equal(0);
  });

  it('preserves the failed-worker cleanup grace period and removes a late upload after deletion', async function () {
    mockSails.config.record.export.background.maxRunMinutes = 0.001;
    let finishUpload: (() => void) | undefined;
    disk.putStream.callsFake(async (key: string) => {
      await new Promise<void>(resolve => {
        finishUpload = resolve;
      });
      files.set(key, Buffer.from('late result'));
    });
    const dto = await service.createJob(context, request, filename);
    const running = service.generateCsvJob({ attrs: { data: { jobId: dto.id } } });
    await clock.tickAsync(61);
    await running;
    const cleanupAfter = rows[0].cleanupAfter;
    await service.deleteJob(context, dto.id);
    expect(rows[0].status).to.equal('deleted');
    expect(rows[0].cleanupAfter).to.equal(cleanupAfter);
    expect(rows[0].cleanedAt).to.equal(null);
    expect(disk.exists.called).to.equal(false);
    finishUpload?.();
    await clock.tickAsync(0);
    expect(files.size).to.equal(0);
    expect(rows[0].cleanedAt).to.equal(Date.now());
    await error(service.openDownload(context, dto.id), 404);
  });

  it('closes a download opened concurrently with deletion before returning its stream', async function () {
    const id = await prepare();
    const source = Readable.from(['csv']);
    let finishOpen: (() => void) | undefined;
    disk.getStream.callsFake(async () => {
      await new Promise<void>(resolve => {
        finishOpen = resolve;
      });
      return source;
    });
    const opening = service.openDownload(context, id);
    await clock.tickAsync(0);
    await service.deleteJob(context, id);
    const rejected = error(opening, 404);
    finishOpen?.();
    await rejected;
    expect(source.destroyed).to.equal(true);
  });

  it('accepts two concurrent delete requests without reviving the export', async function () {
    const id = await prepare();
    await Promise.all([service.deleteJob(context, id), service.deleteJob(context, id)]);
    expect(rows[0].status).to.equal('deleted');
    expect(files.size).to.equal(0);
    await error(service.getJob(context, id), 404);
  });

  it('recovers unacknowledged/stale jobs without failing acknowledged queue backlog', async function () {
    await service.createJob(context, request, filename);
    await service.createJob(context, request, filename);
    await service.createJob(context, request, filename);
    rows[0].enqueuedAt = null;
    rows[1].status = 'running';
    rows[1].heartbeatAt = Date.now();
    rows[1].deadlineAt = Date.now() + 60 * 60 * 1000;
    await clock.tickAsync(EXPORT_STALE_MS);
    await service.maintenanceJob();
    expect(rows.map(row => row.status)).to.deep.equal(['failed', 'failed', 'queued']);
  });

  it('fails acknowledged requests at the configured queue deadline and ignores late delivery', async function () {
    mockSails.config.record.export.background.maxQueueMinutes = 10;
    const old = await service.createJob(context, request, filename);
    rows[0].createdAt -= 48 * 60 * 60000;
    await clock.tickAsync(9 * 60000);
    await service.createJob(context, request, filename);
    await service.maintenanceJob();
    expect(rows.map(row => row.status)).to.deep.equal(['queued', 'queued']);
    await clock.tickAsync(60000);
    await service.maintenanceJob();
    expect(rows.map(row => row.status)).to.deep.equal(['failed', 'queued']);
    expect(rows[0].errorCode).to.equal('export-queue-timed-out');
    expect(rows[0].completedAt).to.equal(Date.now());
    expect(rows[0].cleanedAt).to.equal(Date.now());
    await service.generateCsvJob({ attrs: { data: { jobId: old.id } } });
    expect(records.exportAllPlans.called).to.equal(false);
    expect(rows[0].status).to.equal('failed');
  });

  it('defaults acknowledged queue recovery to 24 hours', async function () {
    await service.createJob(context, request, filename);
    await clock.tickAsync(24 * 60 * 60000 - 1);
    await service.maintenanceJob();
    expect(rows[0].status).to.equal('queued');
    await clock.tickAsync(1);
    await service.maintenanceJob();
    expect(rows[0].errorCode).to.equal('export-queue-timed-out');
  });

  it('supports ordinary disks without incomplete-upload discovery', async function () {
    Reflect.deleteProperty(disk, 'listIncompleteUploads');
    const id = await prepare();
    await service.deleteJob(context, id);
    expect(files.size).to.equal(0);
    expect(rows[0].cleanedAt).to.equal(Date.now());
    await service.maintenanceJob();
  });

  it('rejects invalid queue age limits', async function () {
    for (const value of [0, -1, '60', NaN, Infinity]) {
      mockSails.config.record.export.background.maxQueueMinutes = value;
      await error(service.createJob(context, request, filename), 503, 'export-invalid-config');
    }
  });

  it('cleans failed pending uploads even though they are not readable files', async function () {
    const id = await prepare();
    const key = rows[0].objectKey!;
    rows[0].status = 'failed';
    rows[0].cleanupAfter = Date.now();
    disk.exists.resolves(false);
    disk.listIncompleteUploads.resolves([{ key, lastModified: new Date() }]);
    await service.maintenanceJob();
    expect(disk.delete.calledWith(key)).to.equal(true);
    expect(files.has(key)).to.equal(false);
    expect(rows[0].cleanedAt).to.equal(Date.now());
    expect((await service.getJob(context, id)).status).to.equal('failed');
  });

  it('lists only the latest 20 jobs owned in the current portal', async function () {
    for (let idx = 0; idx < 22; idx++) {
      await service.createJob(context, request, filename);
      await clock.tickAsync(1);
    }
    rows.push({ ...rows[0], jobId: randomUUID(), requestedByUserId: 'another-user' });
    rows.push({ ...rows[0], jobId: randomUUID(), portal: 'another-portal' });
    const list = await service.listJobs(context);
    expect(list).to.have.length(20);
    expect(list[0].id).to.equal(rows[21].jobId);
  });

  it('reconciles old unreferenced objects using paginated disk listings', async function () {
    const old = 'exports/abandoned/attempt.csv';
    const fresh = 'exports/fresh/attempt.csv';
    files.set(old, Buffer.from('old'));
    files.set(fresh, Buffer.from('fresh'));
    disk.listAll.onFirstCall().resolves({ objects: [{ key: old }], paginationToken: 'page2' });
    disk.listAll.onSecondCall().resolves({ objects: [{ key: fresh }] });
    disk.getMetaData.callsFake(async (key: string) => ({
      contentLength: 3,
      lastModified: new Date(Date.now() - (key === old ? EXPORT_STALE_MS + 1 : 0)),
    }));
    await service.maintenanceJob();
    expect(files.has(old)).to.equal(false);
    expect(files.has(fresh)).to.equal(true);
    expect(disk.listAll.secondCall.args).to.deep.equal(['exports/', { recursive: true, paginationToken: 'page2' }]);
  });

  it('preserves fresh and referenced incomplete uploads during orphan reconciliation', async function () {
    await prepare();
    const key = rows[0].objectKey!;
    disk.listIncompleteUploads.resolves([
      { key, lastModified: new Date(Date.now() - EXPORT_STALE_MS - 1) },
      { key: 'exports/fresh.csv', lastModified: new Date() },
    ]);
    await service.maintenanceJob();
    expect(disk.delete.called).to.equal(false);
  });

  it('reconciles incomplete orphan uploads from listing timestamps without reading unpublished metadata', async function () {
    const key = 'exports/abandoned/pending.csv';
    files.set(key, Buffer.from('partial'));
    disk.listIncompleteUploads.resolves([{ key, lastModified: new Date(Date.now() - EXPORT_STALE_MS - 1) }]);
    disk.getMetaData.rejects(Object.assign(new Error('Upload is not published'), { code: 'ENOENT' }));
    await service.maintenanceJob();
    expect(disk.getMetaData.called).to.equal(false);
    expect(files.has(key)).to.equal(false);
  });
});
