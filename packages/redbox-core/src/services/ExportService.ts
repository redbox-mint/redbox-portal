import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Collection, Filter } from 'mongodb';
import { firstValueFrom } from 'rxjs';
import { DateTime } from 'luxon';
import type { ExportJobDto, ExportJobRequest } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { UserModel } from '../model/storage/UserModel';
import type { RoleModel } from '../model/storage/RoleModel';
import type { ExportJobModel } from '../model/storage/ExportJobModel';
import type { Services as storage } from './StorageManagerService';
import { EXPORT_GENERATE_JOB_NAME } from '../config/agendaQueue.config';

export interface ExportRequestContext {
  brand: BrandingModel;
  portal: string;
  user: UserModel;
}

export class ExportServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ExportServiceError';
  }
}

export interface ExportAgendaJob {
  attrs?: { data?: { jobId?: string } };
  touch?: () => Promise<unknown>;
}

export const EXPORT_HEARTBEAT_MS = 15000;
export const EXPORT_STALE_MS = 5 * 60 * 1000;
export const EXPORT_METADATA_RETENTION_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'exports/';
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function roleBrandId(role: RoleModel): string {
  const branding: unknown = role.branding;
  if (typeof branding === 'string' || typeof branding === 'number') return String(branding);
  return branding && typeof branding === 'object' && 'id' in branding ? String(branding.id) : '';
}

function authorizationContext(context: ExportRequestContext): string {
  const roles = context.user.roles
    .filter(role => roleBrandId(role) === String(context.brand.id))
    .map(role => [String(role.id), role.name])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash('sha256')
    .update(JSON.stringify({ id: context.user.id, username: context.user.username, roles }))
    .digest('hex');
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function normalizeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new ExportServiceError(400, 'export-invalid-date', 'Export dates must be ISO timestamps with a timezone.');
  }
  const date = DateTime.fromISO(value, { setZone: true });
  const normalized = date.isValid ? date.toUTC().toISO() : null;
  if (normalized === null)
    throw new ExportServiceError(400, 'export-invalid-date', 'Export dates must be valid timestamps.');
  return normalized;
}

export namespace Services {
  /** Background CSV lifecycle. All binary I/O stays behind the configured StorageManager disk. */
  export class Export extends services.Core.Service {
    protected override _exportedMethods = [
      'init',
      'createJob',
      'listJobs',
      'getJob',
      'deleteJob',
      'openDownload',
      'generateCsvJob',
      'maintenanceJob',
    ];
    private indexesReady?: Promise<void>;

    public override async init(): Promise<void> {
      // The storage manager creates disks after ready; config validation does not resolve a disk yet.
      try {
        this.settings();
      } catch (error) {
        if (!(error instanceof ExportServiceError)) throw error;
        // Export availability must not prevent deployments with custom disk maps from lifting.
        this.updateChronicle({ exportOperation: 'init-config' }, [error]);
      }
      await this.ensureIndexes();
    }

    private collection(): Collection<ExportJobModel> {
      return ExportJob.getDatastore().manager.collection<ExportJobModel>(ExportJob.tableName);
    }

    private ensureIndexes(): Promise<void> {
      this.indexesReady ??= (async () => {
        const collection = this.collection();
        await collection.createIndex({ jobId: 1 }, { unique: true });
        await collection.createIndex({ brandId: 1, portal: 1, requestedByUserId: 1, createdAt: -1 });
        await collection.createIndex({ status: 1, heartbeatAt: 1 });
        await collection.createIndex({ status: 1, expiresAt: 1 });
        await collection.createIndex({ status: 1, createdAt: 1, enqueuedAt: 1 });
        await collection.createIndex({ status: 1, enqueuedAt: 1 });
        await collection.createIndex({ diskName: 1, objectKey: 1 });
      })().catch(error => {
        this.indexesReady = undefined;
        throw error;
      });
      return this.indexesReady;
    }

    private settings(): { diskName: string; retentionMs: number; runMs: number; queueMs: number } {
      const config = sails.config.record.export.background;
      const diskName = config?.diskName ?? 'exports';
      const retentionHours = config?.retentionHours ?? 24;
      const maxRunMinutes = config?.maxRunMinutes ?? 60;
      const maxQueueMinutes = config?.maxQueueMinutes ?? 24 * 60;
      const queueMs = maxQueueMinutes * 60000;
      const retentionMs = retentionHours * 3600000;
      const runMs = maxRunMinutes * 60000;
      if (
        typeof retentionHours !== 'number' ||
        typeof maxRunMinutes !== 'number' ||
        typeof maxQueueMinutes !== 'number' ||
        !Number.isSafeInteger(queueMs) ||
        queueMs <= 0 ||
        typeof diskName !== 'string' ||
        !diskName ||
        !Number.isSafeInteger(retentionMs) ||
        retentionMs <= 0 ||
        !Number.isSafeInteger(runMs) ||
        runMs <= 0 ||
        runMs > 2147483647
      ) {
        throw new ExportServiceError(503, 'export-invalid-config', 'Background export configuration is invalid.');
      }
      this.validateDisk(diskName);
      return { diskName, retentionMs, runMs, queueMs };
    }

    private validateDisk(diskName: string): void {
      try {
        const config = StorageManagerService.getDiskConfig(diskName);
        if (config.config.visibility !== 'private') throw new Error('Export disk must be private.');
      } catch {
        throw new ExportServiceError(
          503,
          'export-storage-unavailable',
          'The configured private export disk is unavailable.'
        );
      }
    }

    private async disk(diskName: string): Promise<storage.IDisk> {
      this.validateDisk(diskName);
      await StorageManagerService.bootstrap();
      return StorageManagerService.disk(diskName);
    }

    private async effectiveContext(context: ExportRequestContext): Promise<ExportRequestContext> {
      if (!context.brand?.id || !context.brand.name || !context.portal || !context.user?.id) {
        throw new ExportServiceError(403, 'export-access-denied', 'Export access is unavailable.');
      }
      const user = await firstValueFrom(UsersService.getEffectiveUser(context.user.id));
      if (!user || user.loginDisabled || user.effectiveLoginDisabled || !user.id || !user.username) {
        throw new ExportServiceError(403, 'export-access-denied', 'Export access is unavailable.');
      }
      const rules = PathRulesService.getRulesFromPath(
        `/${context.brand.name}/${context.portal}/export/record/download/csv`,
        context.brand
      );
      const roles = user.roles.filter(role => roleBrandId(role) === String(context.brand.id));
      const allowed = rules
        ? PathRulesService.canRead(
            rules,
            roles.map(role => ({ id: role.id, name: role.name })),
            context.brand.name
          )
        : roles.some(role => role.name === 'Admin' || role.name === 'Librarians');
      if (!allowed)
        throw new ExportServiceError(403, 'export-access-denied', 'You no longer have permission to export records.');
      return { ...context, user };
    }

    private scope(context: ExportRequestContext): Filter<ExportJobModel> {
      return { brandId: String(context.brand.id), portal: context.portal, requestedByUserId: String(context.user.id) };
    }

    private dto(job: ExportJobModel): ExportJobDto {
      if (job.status === 'deleted') throw new ExportServiceError(404, 'export-not-found', 'The export was not found.');
      const expired = job.expiresAt !== null && job.expiresAt <= Date.now();
      const status = expired ? 'expired' : job.status;
      return {
        id: job.jobId,
        recordType: job.recordType,
        format: job.format,
        modifiedBefore: job.modifiedBefore,
        modifiedAfter: job.modifiedAfter,
        status,
        createdAt: new Date(job.createdAt).toISOString(),
        startedAt: iso(job.startedAt),
        completedAt: iso(job.completedAt),
        expiresAt: iso(job.expiresAt),
        filename: job.filename,
        byteLength: job.byteLength,
        downloadUrl: status === 'ready' ? `export/jobs/${encodeURIComponent(job.jobId)}/download` : null,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      };
    }

    public async createJob(
      context: ExportRequestContext,
      input: ExportJobRequest,
      filename: string
    ): Promise<ExportJobDto> {
      const settings = this.settings();
      const effective = await this.effectiveContext(context);
      if (
        !input ||
        input.format !== 'csv' ||
        typeof input.recType !== 'string' ||
        !input.recType ||
        input.recType.length > 200
      ) {
        throw new ExportServiceError(400, 'export-invalid-request', 'Select a valid record type and CSV format.');
      }
      const modifiedBefore = normalizeDate(input.before);
      const modifiedAfter = normalizeDate(input.after);
      if (modifiedBefore && modifiedAfter && modifiedBefore < modifiedAfter) {
        throw new ExportServiceError(400, 'export-invalid-range', 'The start date must not be after the end date.');
      }
      if (!(await firstValueFrom(RecordTypesService.get(effective.brand, input.recType)))) {
        throw new ExportServiceError(400, 'export-invalid-record-type', 'The selected record type does not exist.');
      }
      await this.ensureIndexes();
      const row: ExportJobModel = {
        jobId: randomUUID(),
        brandId: String(effective.brand.id),
        portal: effective.portal,
        requestedByUserId: String(effective.user.id),
        recordType: input.recType,
        format: 'csv',
        modifiedBefore,
        modifiedAfter,
        status: 'queued',
        createdAt: Date.now(),
        enqueuedAt: null,
        startedAt: null,
        completedAt: null,
        expiresAt: null,
        attemptId: null,
        heartbeatAt: null,
        deadlineAt: null,
        cleanupAfter: null,
        diskName: settings.diskName,
        objectKey: null,
        byteLength: null,
        filename,
        authorizationContext: null,
        errorCode: null,
        errorMessage: null,
        cleanedAt: null,
      };
      await this.collection().insertOne(row);
      try {
        await AgendaQueueService.now(EXPORT_GENERATE_JOB_NAME, { jobId: row.jobId });
        row.enqueuedAt = Date.now();
        await this.collection().updateOne({ jobId: row.jobId }, { $set: { enqueuedAt: row.enqueuedAt } });
      } catch (error) {
        this.updateChronicle({ exportJobId: row.jobId, exportOperation: 'enqueue' }, [error]);
        await this.fail(
          row.jobId,
          { status: 'queued' },
          'export-enqueue-failed',
          'The export could not be queued. Prepare it again.'
        );
        throw new ExportServiceError(503, 'export-enqueue-failed', 'The export could not be queued. Prepare it again.');
      }
      return this.dto(row);
    }

    public async listJobs(context: ExportRequestContext): Promise<ExportJobDto[]> {
      const effective = await this.effectiveContext(context);
      const rows = await this.collection()
        .find({ ...this.scope(effective), status: { $ne: 'deleted' } })
        .sort({ createdAt: -1, jobId: -1 })
        .limit(20)
        .toArray();
      return rows.map(row => this.dto(row));
    }

    private async ownedJob(
      context: ExportRequestContext,
      id: string,
      includeDeleted = false
    ): Promise<{ context: ExportRequestContext; row: ExportJobModel }> {
      const effective = await this.effectiveContext(context);
      const row =
        typeof id === 'string' && JOB_ID.test(id)
          ? await this.collection().findOne({
              ...this.scope(effective),
              jobId: id,
              ...(includeDeleted ? {} : { status: { $ne: 'deleted' } }),
            })
          : null;
      if (!row) throw new ExportServiceError(404, 'export-not-found', 'The export was not found.');
      return { context: effective, row };
    }

    public async getJob(context: ExportRequestContext, id: string): Promise<ExportJobDto> {
      return this.dto((await this.ownedJob(context, id)).row);
    }

    public async deleteJob(context: ExportRequestContext, id: string): Promise<void> {
      const { context: effective, row } = await this.ownedJob(context, id, true);
      if (row.status === 'queued' || row.status === 'running') {
        throw new ExportServiceError(
          409,
          'export-in-progress',
          'Wait for export preparation to finish before deleting it.'
        );
      }
      let deleted = row;
      if (row.status !== 'deleted') {
        const now = Date.now();
        // Revoke access before touching storage. Keep any existing grace period for a failed
        // worker whose remote upload might still be settling; its late cleanup can also retry.
        const changed = await this.collection().findOneAndUpdate(
          { ...this.scope(effective), jobId: id, status: { $in: ['ready', 'failed', 'expired'] } },
          {
            $set: {
              status: 'deleted',
              expiresAt: now,
              cleanupAfter: Math.max(now, row.cleanupAfter ?? now),
            },
          },
          { returnDocument: 'after', includeResultMetadata: false }
        );
        const current = changed ?? (await this.collection().findOne({ ...this.scope(effective), jobId: id }));
        if (!current || current.status !== 'deleted')
          throw new ExportServiceError(404, 'export-not-found', 'The export was not found.');
        deleted = current;
      }
      if (deleted.cleanedAt === null && deleted.cleanupAfter !== null && deleted.cleanupAfter <= Date.now()) {
        await this.cleanupArtifact(deleted);
      }
    }

    public async openDownload(
      context: ExportRequestContext,
      id: string
    ): Promise<{ stream: Readable; filename: string; byteLength: number }> {
      const { context: effective, row } = await this.ownedJob(context, id);
      if (row.status === 'expired' || (row.expiresAt !== null && row.expiresAt <= Date.now())) {
        throw new ExportServiceError(410, 'export-expired', 'This export has expired. Prepare another export.');
      }
      if (row.status !== 'ready' || !row.objectKey || row.byteLength === null) {
        throw new ExportServiceError(409, 'export-not-ready', 'The export is not ready to download.');
      }
      if (row.authorizationContext !== authorizationContext(effective)) {
        throw new ExportServiceError(
          403,
          'export-authorization-changed',
          'Your account permissions have changed. Prepare another export.'
        );
      }
      try {
        const disk = await this.disk(row.diskName);
        const stream = await disk.getStream(row.objectKey);
        let readError: Error | undefined;
        const keepReadError = (error: Error) => {
          readError = error;
        };
        stream.on('error', keepReadError);
        try {
          // Recheck after opening storage: deletion or expiry may have won during that await.
          const current = await this.collection().findOne({ ...this.scope(effective), jobId: id });
          if (!current || current.status === 'deleted')
            throw new ExportServiceError(404, 'export-not-found', 'The export was not found.');
          if (current.status === 'expired' || (current.expiresAt !== null && current.expiresAt <= Date.now()))
            throw new ExportServiceError(410, 'export-expired', 'This export has expired. Prepare another export.');
          if (readError) throw readError;
          return { stream, filename: row.filename, byteLength: row.byteLength };
        } catch (error) {
          stream.destroy();
          throw error;
        } finally {
          stream.off('error', keepReadError);
        }
      } catch (error) {
        if (error instanceof ExportServiceError) throw error;
        this.updateChronicle({ exportJobId: row.jobId, exportOperation: 'download' }, [error]);
        throw new ExportServiceError(503, 'export-file-unavailable', 'The prepared export is temporarily unavailable.');
      }
    }

    private async fail(jobId: string, filter: Filter<ExportJobModel>, code: string, message: string): Promise<void> {
      const now = Date.now();
      await this.collection().updateOne(
        { jobId, ...filter },
        {
          $set: {
            status: 'failed',
            completedAt: now,
            expiresAt: now + this.settings().retentionMs,
            cleanupAfter: now + EXPORT_STALE_MS,
            errorCode: code,
            errorMessage: message,
          },
        }
      );
    }

    public async generateCsvJob(job: ExportAgendaJob): Promise<void> {
      const jobId = job.attrs?.data?.jobId;
      if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) return;
      const settings = this.settings();
      const now = Date.now();
      const attemptId = randomUUID();
      const row = await this.collection().findOneAndUpdate(
        { jobId, status: 'queued' },
        {
          $set: {
            status: 'running',
            attemptId,
            startedAt: now,
            heartbeatAt: now,
            deadlineAt: now + settings.runMs,
            objectKey: `${PREFIX}${jobId}/${attemptId}.csv`,
          },
        },
        { returnDocument: 'after', includeResultMetadata: false }
      );
      if (!row) return;
      let source: Readable | undefined;
      let stopped: ExportServiceError | undefined;
      let rejectStop: (error: ExportServiceError) => void = () => {};
      const stopping = new Promise<never>((_resolve, reject) => {
        rejectStop = reject;
      });
      const stop = (error: ExportServiceError) => {
        if (stopped) return;
        stopped = error;
        source?.destroy(error);
        rejectStop(error);
      };
      const assertActive = () => {
        if (stopped) throw stopped;
      };
      let heartbeatBusy = false;
      const heartbeat = setInterval(() => {
        if (heartbeatBusy || stopped) return;
        heartbeatBusy = true;
        void (async () => {
          if (job.touch) await job.touch();
          const renewed = await this.collection().updateOne(
            { jobId, status: 'running', attemptId, heartbeatAt: { $gt: Date.now() - EXPORT_STALE_MS } },
            { $set: { heartbeatAt: Date.now() } }
          );
          if (!renewed.matchedCount) {
            // Publication may win a race with an already-running heartbeat.
            const completed = await this.collection().findOne({ jobId, attemptId, status: 'ready' });
            if (!completed) throw new Error('Export claim is no longer active.');
          }
        })()
          .catch(() =>
            stop(
              new ExportServiceError(
                503,
                'export-worker-interrupted',
                'Export preparation was interrupted. Prepare it again.'
              )
            )
          )
          .finally(() => {
            heartbeatBusy = false;
          });
      }, EXPORT_HEARTBEAT_MS);
      heartbeat.unref();
      const deadline = setTimeout(
        () =>
          stop(
            new ExportServiceError(
              503,
              'export-timed-out',
              'Export preparation exceeded its time limit. Prepare it again.'
            )
          ),
        settings.runMs
      );
      deadline.unref();
      let settled = false;
      const work = (async () => {
        const brand = BrandingService.getBrandById(row.brandId);
        const user = await firstValueFrom(UsersService.getEffectiveUser(row.requestedByUserId));
        if (!brand || !user)
          throw new ExportServiceError(403, 'export-access-denied', 'The requester no longer has export access.');
        const effective = await this.effectiveContext({ brand, portal: row.portal, user });
        const disk = await this.disk(row.diskName);
        assertActive();
        const roles = effective.user.roles.map(role => ({ ...role, branding: roleBrandId(role) }));
        source = RecordsService.exportAllPlans(
          effective.user.username,
          roles,
          brand,
          'csv',
          row.modifiedBefore,
          row.modifiedAfter,
          row.recordType
        );
        // Keep errors handled even if a disk waits before attaching its stream consumer.
        source.on('error', () => {});
        await disk.putStream(row.objectKey!, source, { visibility: 'private', contentType: 'text/csv' });
        assertActive();
        const metadata = await disk.getMetaData(row.objectKey!);
        assertActive();
        if (!Number.isSafeInteger(metadata.contentLength) || metadata.contentLength < 0)
          throw new Error('Export storage returned an invalid length.');
        const completedAt = Date.now();
        const published = await this.collection().updateOne(
          {
            jobId,
            status: 'running',
            attemptId,
            heartbeatAt: { $gt: completedAt - EXPORT_STALE_MS },
            deadlineAt: { $gt: completedAt },
          },
          {
            $set: {
              status: 'ready',
              completedAt,
              expiresAt: completedAt + settings.retentionMs,
              byteLength: metadata.contentLength,
              authorizationContext: authorizationContext(effective),
            },
          }
        );
        if (!published.matchedCount)
          throw new ExportServiceError(
            503,
            'export-worker-interrupted',
            'Export preparation was interrupted. Prepare it again.'
          );
      })().finally(() => {
        settled = true;
      });
      // A deadline can win while a remote disk operation is still settling. Its late result must
      // never publish; when it settles, remove its own attempt artifact through the same disk.
      void work
        .catch(async () => {
          if (stopped) await this.cleanupArtifact(row);
        })
        .catch(error => {
          this.updateChronicle({ exportJobId: jobId, exportOperation: 'late-cleanup' }, [error]);
        });
      try {
        await Promise.race([work, stopping]);
      } catch (error) {
        const failure =
          error instanceof ExportServiceError
            ? error
            : new ExportServiceError(
                503,
                'export-generation-failed',
                'The CSV could not be prepared. Prepare it again.'
              );
        source?.destroy();
        this.updateChronicle({ exportJobId: jobId, exportOperation: 'generate' }, [error]);
        await this.fail(jobId, { status: 'running', attemptId }, failure.code, failure.message);
        if (settled) await this.cleanupArtifact(row);
      } finally {
        clearInterval(heartbeat);
        clearTimeout(deadline);
      }
    }

    private async cleanupArtifact(row: ExportJobModel): Promise<void> {
      const current = await this.collection().findOne({ jobId: row.jobId, attemptId: row.attemptId });
      // A storage acknowledgement or timer may race a successful publication. Never delete
      // the published object, nor remove an object while its active worker still owns it.
      if (current?.status === 'ready' || current?.status === 'running') return;
      if (!row.objectKey) {
        await this.collection().updateOne(
          { jobId: row.jobId, status: { $in: ['failed', 'expired', 'deleted'] } },
          { $set: { cleanedAt: Date.now() } }
        );
        return;
      }
      try {
        const disk = await this.disk(row.diskName);
        // Ordinary existence only promises readable files. GridFS also exposes incomplete
        // uploads to cleanup, without changing availability checks for other disk consumers.
        const exists = await disk.exists(row.objectKey);
        const incomplete = !exists && (await disk.listIncompleteUploads?.(row.objectKey));
        if (exists || (incomplete && incomplete.some(upload => upload.key === row.objectKey))) {
          await disk.delete(row.objectKey);
        }
        await this.collection().updateOne(
          { jobId: row.jobId, attemptId: row.attemptId, status: { $in: ['failed', 'expired', 'deleted'] } },
          { $set: { cleanedAt: Date.now() } }
        );
      } catch (error) {
        this.updateChronicle({ exportJobId: row.jobId, exportOperation: 'cleanup' }, [error]);
      }
    }

    public async maintenanceJob(job?: ExportAgendaJob): Promise<void> {
      const { retentionMs, queueMs } = this.settings();
      const collection = this.collection();
      const now = Date.now();
      await collection.updateMany(
        { status: 'queued', enqueuedAt: null, createdAt: { $lte: now - EXPORT_STALE_MS } },
        {
          $set: {
            status: 'failed',
            completedAt: now,
            expiresAt: now + retentionMs,
            cleanupAfter: now,
            errorCode: 'export-enqueue-failed',
            errorMessage: 'Export submission was interrupted. Prepare it again.',
          },
        }
      );
      // An acknowledged delivery may be lost by the queue backend. Bound its wait
      // separately from the short unacknowledged-submission and running-worker timeouts.
      await collection.updateMany(
        { status: 'queued', enqueuedAt: { $ne: null, $lte: now - queueMs } },
        {
          $set: {
            status: 'failed',
            completedAt: now,
            expiresAt: now + retentionMs,
            cleanupAfter: now,
            errorCode: 'export-queue-timed-out',
            errorMessage: 'Export preparation did not start within its queue time limit. Prepare it again.',
          },
        }
      );
      await collection.updateMany(
        { status: 'running', $or: [{ heartbeatAt: { $lte: now - EXPORT_STALE_MS } }, { deadlineAt: { $lte: now } }] },
        {
          $set: {
            status: 'failed',
            completedAt: now,
            expiresAt: now + retentionMs,
            cleanupAfter: now + EXPORT_STALE_MS,
            errorCode: 'export-worker-interrupted',
            errorMessage: 'Export preparation was interrupted. Prepare it again.',
          },
        }
      );
      await collection.updateMany(
        { status: 'ready', expiresAt: { $lte: now } },
        { $set: { status: 'expired', cleanupAfter: now } }
      );
      const cursor = collection
        .find({ status: { $in: ['failed', 'expired', 'deleted'] }, cleanedAt: null, cleanupAfter: { $lte: now } })
        .batchSize(100);
      for await (const row of cursor) {
        if (job?.touch) await job.touch();
        await this.cleanupArtifact(row);
      }
      await collection.deleteMany({
        status: { $in: ['failed', 'expired', 'deleted'] },
        cleanedAt: { $ne: null },
        expiresAt: { $lte: now - EXPORT_METADATA_RETENTION_MS },
      });
      await this.reconcileOrphans(job);
    }

    private async reconcileObject(
      diskName: string,
      disk: storage.IDisk,
      object: unknown,
      job?: ExportAgendaJob
    ): Promise<void> {
      if (job?.touch) await job.touch();
      if (
        !object ||
        typeof object !== 'object' ||
        !('key' in object) ||
        typeof object.key !== 'string' ||
        !object.key.startsWith(PREFIX)
      )
        return;
      // Cleanup listings may include uploads that cannot be read yet.
      // Prefer a valid listing timestamp; only request metadata when it is absent.
      const listedTime =
        'lastModified' in object &&
        object.lastModified instanceof Date &&
        Number.isFinite(object.lastModified.getTime())
          ? object.lastModified
          : undefined;
      const lastModified = listedTime ?? (await disk.getMetaData(object.key)).lastModified;
      if (!Number.isFinite(lastModified.getTime()) || lastModified.getTime() > Date.now() - EXPORT_STALE_MS) return;
      const referenced = await this.collection().findOne({ diskName, objectKey: object.key });
      if (!referenced) await disk.delete(object.key);
    }

    private async reconcileOrphans(job?: ExportAgendaJob): Promise<void> {
      const diskNames = await this.collection().distinct('diskName');
      diskNames.push(this.settings().diskName);
      for (const diskName of new Set(diskNames)) {
        try {
          const disk = await this.disk(diskName);
          let paginationToken: string | undefined;
          do {
            const page = await disk.listAll(PREFIX, { recursive: true, paginationToken });
            for (const object of page.objects) {
              await this.reconcileObject(diskName, disk, object, job);
            }
            paginationToken = page.paginationToken;
          } while (paginationToken);
          for (const upload of (await disk.listIncompleteUploads?.(PREFIX)) ?? []) {
            await this.reconcileObject(diskName, disk, upload, job);
          }
        } catch (error) {
          this.updateChronicle({ exportOperation: 'orphan-cleanup', exportDisk: diskName }, [error]);
        }
      }
    }
  }
}

declare global {
  const ExportService: Services.Export;
}
