import _ from 'lodash';
import { createHash, randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import type { FigshareSyncModel, FigshareIntentKind, FigshareBinding } from '../../model/storage/FigshareSyncModel';
import type { RecordModel, FigshareArticle, FigshareArticlePayload, FigsharePublicationPlan, FigshareJob } from './types';
import { getRecordField, setRecordField } from './types';
import { DEFAULT_FIGSHARE_PROCESSING, type FigshareOperation } from '../../configmodels/FigsharePublishing';
import { resolveFigsharePublishingConfig, type ResolvedFigsharePublishingConfigData } from './config';
import { FigshareSyncStore, FigshareLeaseLost } from './sync-store';
import { figshareExecution, FigshareWaiting, FigshareRepairRequired, type FigshareExecution } from './execution';
import { apiNamespace, resolveCreationOwner, newCreateOperation, provisionalTitle, recoverCreate, observedPublished } from './identity';
import { currentExecutionEligible } from './source-intent';
import { makeLiveClient, makeFixtureClient, FigshareHttpError, type FigshareClient } from './http';
import { isCurationLocked, listArticleFiles } from './runtime';
import { syncEmbargoPhase } from './embargo';
import { mirrorManagedAssets, cleanupProjection } from './managed-assets';
import { startFigshareAudit, completeFigshareAudit, failFigshareAudit } from './audit';
import { createRunContext } from './context';
import { IntegrationAuditAction } from '../../model/storage/IntegrationAuditModel';
import { RecordWriteConflict } from '../../RecordWriteOptions';

export interface QueuedFigshareService {
  makeClient(config: ResolvedFigsharePublishingConfigData, record: RecordModel, jobId?: string, triggerSource?: string): FigshareClient;
  syncMetadata(record: RecordModel, plan?: FigsharePublicationPlan): Promise<FigshareArticle>;
}
export const contentHash = (value: unknown): string => {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};
export function getSyncStore(): FigshareSyncStore {
  const manager: Db = FigshareSync.getDatastore().manager;
  return new FigshareSyncStore(manager);
}
export function projectionPaths(config: ResolvedFigsharePublishingConfigData): string[] {
  return [...new Set([config.record.articleIdPath, config.record.statusPath, config.record.errorPath, config.record.syncStatePath,
    config.record.dataLocationsPath, config.record.allFilesUploadedPath, config.writeBack.articleId, ...config.writeBack.articleUrls,
    ...config.writeBack.extraFields.map(f => f.targetPath)].filter((p): p is string => !!p))];
}

/** Source import never acknowledges before durable state exists. Queue delivery is disposable. */
export async function importRecordIntent(store: FigshareSyncStore, record: RecordModel): Promise<void> {
  const intent = record.figshareSyncIntent;
  if (!intent?.pending || intent.readiness !== 'ready') return;
  const storage = RecordsService.getFigshareIntentStorage();
  if (!storage.acknowledgeFigshareIntent) throw new Error('Storage adapter cannot acknowledge Figshare intent');
  await store.importSource(record.redboxOid, record.metaMetadata.brandId, intent);
  await storage.acknowledgeFigshareIntent(record.redboxOid, intent.generation);
}

export async function dispatchFigshare(): Promise<void> {
  const storage = RecordsService.getFigshareIntentStorage();
  if (!storage.pendingFigshareIntents) return;
  const store = getSyncStore();
  await store.ensureIndexes();
  for (const record of await storage.pendingFigshareIntents(100)) {
    if (resolveFigsharePublishingConfig(record, { requireToken: false })?.processing?.enabled) await importRecordIntent(store, record);
  }
  for (const due of await store.due()) {
    if (!await store.dispatchClaim(due.oid)) continue;
    try { await AgendaQueueService.now('Figshare-SyncRecord', { oid: due.oid, brandId: due.brandId }); }
    catch (error) { sails.log.error('Figshare delivery failed; durable work remains due', error); }
  }
}

export async function runFigshareWorker(service: QueuedFigshareService, job: FigshareJob, store = getSyncStore()): Promise<void> {
  const { oid, brandId } = job.attrs?.data ?? {};
  if (!oid || !brandId) return;
  let record = await RecordsService.getMeta(oid);
  if (!record) {
    const existing = await store.get(oid);
    if (existing) await store.change(oid, s => { s.status = 'cancelled'; for (const work of Object.values(s.work)) work.dueAt = null; });
    return;
  }
  if (record.metaMetadata.brandId !== brandId) throw new FigshareRepairRequired('Queue brand does not match the fresh record');
  const config = resolveFigsharePublishingConfig(record, { requireToken: false });
  if (!config?.processing?.enabled) return;
  const settings = { ...DEFAULT_FIGSHARE_PROCESSING, ...config.processing };
  if (settings.heartbeatMs <= 0 || settings.leaseMs < settings.heartbeatMs * 3) throw new Error('Figshare lease must cover at least three heartbeat intervals');
  await store.ensureIndexes();
  await importRecordIntent(store, record);
  const owner = randomUUID();
  const claimed = await store.claim(oid, brandId, owner, settings.leaseMs);
  if (!claimed) return;
  let state: FigshareSyncModel = claimed;
  const startedWork = _.cloneDeep(state.work);
  const due = (k: FigshareIntentKind) => startedWork[k].dueAt != null && startedWork[k].dueAt! <= Date.now();
  // Attribute errors in the initial account/article reads to the work being polled.
  let kind: FigshareIntentKind = due('sync') ? 'sync' : due('cleanup') ? 'cleanup' : 'observe';
  const abort = new AbortController();
  let heartbeatBusy = false;
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void (async () => {
      await store.renew(oid, owner, settings.leaseMs);
      if (job.touch) await job.touch();
    })().catch(() => abort.abort()).finally(() => { heartbeatBusy = false; });
  }, settings.heartbeatMs);
  heartbeat.unref();
  const checkpoint = async (fn: (s: FigshareSyncModel) => void) => {
    if (abort.signal.aborted) throw new FigshareLeaseLost();
    state = await store.change(oid, fn, owner); return state;
  };
  const finish = async (k: FigshareIntentKind) => checkpoint(s => {
    const w = s.work[k]; w.processed = Math.max(w.processed, startedWork[k].requested);
    if (w.requested === startedWork[k].requested) w.dueAt = null;
  });
  const wait = async (reason: string) => checkpoint(s => {
    s.status = 'waiting'; s.waitingReason = reason;
    // Readiness is an expected wait, not a failed attempt. Clear recovered polling
    // errors, while retaining a genuine terminal failure of unfinished source sync.
    const unresolvedSyncFailure = s.error?.terminal && (!s.error.kind || s.error.kind === 'sync')
      && s.work.sync.requested > s.work.sync.processed;
    if (!unresolvedSyncFailure && (!s.error?.kind || s.error.kind === kind)) delete s.error;
    if (s.work[kind].requested === startedWork[kind].requested) s.work[kind].dueAt = Date.now() + settings.observationMs;
  });
  const rawClient = config.runtime.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, createRunContext(record, config, owner, 'worker'));
  let article: FigshareArticle | undefined;
  let metadataChanged = false;
  const sourceGeneration = record.figshareSyncIntent?.generation ?? 0;
  const eligible = async (policies: FigshareSyncModel['work']['sync']['policies'], current: RecordModel) => {
    const brand = BrandingService.getBrandById(brandId);
    if (!brand) return false;
    const recordType = await RecordTypesService.get(brand, current.metaMetadata.type).toPromise();
    return currentExecutionEligible(recordType, policies, oid, current);
  };
  const assertCurrent = async () => {
    await store.assertOwner(oid, owner);
    if (abort.signal.aborted) throw new FigshareLeaseLost();
    const fresh = await RecordsService.getMeta(oid);
    if (!fresh || fresh.metaMetadata.brandId !== brandId) throw new FigshareWaiting('record_changed');
    const latestConfig = resolveFigsharePublishingConfig(fresh, { requireToken: false });
    if (!latestConfig?.processing?.enabled || contentHash(latestConfig) !== contentHash(config)) throw new FigshareWaiting('configuration_changed');
    if (fresh.figshareSyncIntent?.readiness === 'initialising' || (fresh.figshareSyncIntent?.generation ?? 0) !== sourceGeneration) throw new FigshareWaiting('newer_save');
    if (kind === 'sync' && !await eligible(startedWork.sync.policies, fresh)) throw new FigshareWaiting('eligibility');
    return fresh;
  };
  const execution: FigshareExecution = {
    signal: abort.signal,
    async guard(operation: FigshareOperation) {
      await assertCurrent();
      if (kind !== 'sync' && operation !== 'read') throw new Error('Observation or cleanup intent cannot authorise remote mutation');
      if (state.binding?.articleId) {
        const current = await rawClient.getArticle(state.binding.articleId);
        if (isCurationLocked(config, current)) throw new FigshareWaiting('curation');
      }
    },
    async metadata(id, payload, send) {
      const current = await rawClient.getArticle(id);
      const hash = contentHash(payload);
      // Compare only managed fields, preserving remote fields not mapped by ReDBox.
      const remoteFields: Record<string, unknown> = {};
      for (const key of Object.keys(payload)) {
        if (key === 'custom_fields') {
          const remote = Array.isArray(current.custom_fields)
            ? Object.fromEntries((current.custom_fields as Array<{ name: string; value: unknown }>).map(f => [f.name, f.value]))
            : current.custom_fields as Record<string, unknown> ?? {};
          remoteFields[key] = Object.fromEntries(Object.keys(payload.custom_fields ?? {}).map(k => [k, remote[k]]));
        } else if (key === 'defined_type' && typeof payload[key] === 'string') remoteFields[key] = current.defined_type_name ?? current[key];
        else if (key === 'categories' && Array.isArray(current[key])) remoteFields[key] = current[key].map(value => typeof value === 'object' && value ? value.id : value);
        else if (key === 'authors' && Array.isArray(current[key])) remoteFields[key] = current[key].map(value => typeof value === 'object' && value ? { id: value.id } : value);
        else remoteFields[key] = current[key];
      }
      if (contentHash(remoteFields) === hash) { await checkpoint(s => { s.checkpoints.metadata = hash; }); return current; }
      metadataChanged = true;
      const outgoing: FigshareArticlePayload = { ...payload };
      if (payload.custom_fields) {
        const remote = Array.isArray(current.custom_fields)
          ? Object.fromEntries((current.custom_fields as Array<{ name: string; value: unknown }>).map(f => [f.name, f.value]))
          : current.custom_fields as Record<string, unknown> ?? {};
        outgoing.custom_fields = { ...remote, ...payload.custom_fields };
      }
      await assertCurrent();
      const result = await send(outgoing);
      await checkpoint(s => { s.checkpoints.metadata = hash; });
      return { ...result, id };
    }
  };
  const recovery = <T>(fn: () => Promise<T>) => figshareExecution.run({ ...execution, binding: state.create?.binding ?? state.binding, recovery: true }, fn);
  try {
    await figshareExecution.run(execution, async () => {
      if (config.runtime.mode !== 'fixture' && !config.connection.token) throw new FigshareRepairRequired('Configure a Figshare API token before enabling processing');
      const brand = BrandingService.getBrandById(brandId);
      if (!brand) throw new FigshareRepairRequired('Record brand cannot be resolved');
      const username = settings.serviceUsername || config.workflow.transitionJob.username;
      const userType = settings.serviceUserType || config.workflow.transitionJob.userType;
      if (!username || !userType) throw new FigshareRepairRequired('Configure a per-brand Figshare local service identity');
      const user = await UsersService.getUserWithUsername(username).toPromise();
      if (!user || user.type !== userType || user.disabled === true) throw new FigshareRepairRequired('Configured Figshare local service user is unavailable');
      if (!await RecordsService.hasEditAccess(brand, user, (user.roles ?? []).map(role => ({ ...role })), record)) throw new FigshareRepairRequired('Figshare service user does not have record edit access');
      if (!rawClient.getAccount) throw new FigshareRepairRequired('Figshare client cannot verify authenticated account');
      const account = await rawClient.getAccount();
      const accountId = String(account.id);
      if (!/^\d+$/.test(accountId)) throw new FigshareRepairRequired('Authenticated account response has no valid account ID');
      if (state.binding && (state.binding.namespace !== apiNamespace(config) || state.binding.accountId !== accountId)) throw new FigshareRepairRequired('Figshare API environment or token account changed');
      execution.binding = state.binding;
      if (state.binding?.articleId) {
        article = await rawClient.getArticle(state.binding.articleId);
      } else {
        const legacyId = String(getRecordField(record, config.record.articleIdPath) ?? '');
        if (legacyId) {
          const lookup = RecordsService.getFigshareIntentStorage().findFigshareArticleRecords;
          if (!lookup) throw new FigshareRepairRequired('Storage adapter cannot verify legacy binding uniqueness');
          const matching = await lookup.call(RecordsService.getFigshareIntentStorage(), config.record.articleIdPath, legacyId);
          if (matching.some(other => other.redboxOid !== oid && resolveFigsharePublishingConfig(other)?.connection.baseUrl.replace(/\/+$/, '') === apiNamespace(config))) throw new FigshareRepairRequired('Duplicate legacy article bindings require repair before mutation');
          article = await rawClient.getArticle(legacyId);
          const binding: FigshareBinding = { namespace: apiNamespace(config), accountId, ownerId: String(article.account_id ?? accountId), articleId: String(article.id) };
          await checkpoint(s => { s.binding = binding; s.namespace = binding.namespace; s.articleId = binding.articleId; });
          execution.binding = binding;
        }
      }
      const project = async () => {
        if (!state.binding?.articleId) return;
        for (let attempt = 0; attempt < 3; attempt++) {
          const fresh = await RecordsService.getMeta(oid);
          const fields: Record<string, unknown> = {
            [config.record.articleIdPath]: state.binding.articleId,
            [config.writeBack.articleId]: state.binding.articleId,
            [config.record.statusPath]: state.status,
            [config.record.errorPath]: state.error?.message ?? ''
          };
          for (const path of config.writeBack.articleUrls) fields[path] = article?.url_public_html ?? article?.url_private_html ?? `${config.connection.frontEndUrl}/articles/${state.binding.articleId}`;
          for (const binding of config.writeBack.extraFields) {
            const source = binding.from === 'article' ? article : binding.from === 'publishResult' ? state.publish : undefined;
            const value: unknown = _.get(source, binding.sourcePath);
            if (value !== undefined) fields[binding.targetPath] = value;
          }
          await store.assertOwner(oid, owner);
          if ((await RecordsService.setRecordFields(oid, fields, fresh.recordVersion ?? 0, projectionPaths(config), user)).updated) return;
        }
        throw new FigshareWaiting('record_changed');
      };
      if (due('sync')) {
        kind = 'sync';
        await assertCurrent();
        if (!state.audit || state.auditClosed) {
          const audit = startFigshareAudit(oid, IntegrationAuditAction.syncRecordWithFigshare, createRunContext(record, config, owner, 'worker'), {
            sourceGeneration, requestedBy: startedWork.sync.requestedBy, requests: startedWork.sync.requested - startedWork.sync.processed
          });
          await checkpoint(s => { s.audit = audit; s.auditClosed = false; });
        }
        if (!state.binding?.articleId) {
          if (state.create) {
            const recovered = await recovery(() => recoverCreate(rawClient, state.create!));
            if (!recovered) throw new FigshareRepairRequired('Uncertain create has no unique visible token match; do not create again');
            const binding = { ...state.create.binding, articleId: String(recovered.id) };
            await checkpoint(s => { s.binding = binding; s.namespace = binding.namespace; s.articleId = binding.articleId; s.create!.verifiedId = binding.articleId; });
            execution.binding = binding; article = recovered;
            if (state.create.error && startedWork.sync.requested <= (state.createRequest ?? startedWork.sync.requested)) throw new Error(state.create.error);
          } else {
            if ((state.waitingReason === 'uncertain_legacy_create' || getRecordField(record, config.record.syncStatePath)) && !state.create) throw new FigshareRepairRequired('Legacy synchronisation evidence without an article ID requires migration review');
            const ownerId = config.impersonation?.operations.create === 'owner' ? await resolveCreationOwner(rawClient, config, record, accountId) : accountId;
            const binding: FigshareBinding = { namespace: apiNamespace(config), accountId, ownerId };
            const operation = newCreateOperation(binding);
            await checkpoint(s => { s.binding = binding; s.create = operation; s.createGeneration = sourceGeneration; s.createRequest = startedWork.sync.requested; });
            execution.binding = binding;
            try {
              await execution.guard('create');
              const response = await rawClient.createArticle({ title: provisionalTitle(operation.token) });
              if (response.id == null) throw new Error('Create response did not contain an article identity');
              article = await recovery(() => rawClient.getArticle(String(response.id)));
              if (article.title !== provisionalTitle(operation.token)) throw new FigshareRepairRequired('Create response did not verify the operation token');
              const id = String(article.id);
              await checkpoint(s => { s.binding!.articleId = id; s.namespace = binding.namespace; s.articleId = id; s.create!.verifiedId = id; s.create!.outcome = 'confirmed'; });
              execution.binding = state.binding;
            } catch (error) {
              await checkpoint(s => { s.create!.outcome = error instanceof FigshareHttpError && error.statusCode ? 'failed' : 'uncertain'; s.create!.error = error instanceof Error ? error.message : String(error); });
              const recovered = await recovery(() => recoverCreate(rawClient, state.create!));
              if (recovered) {
                const id = String(recovered.id);
                await checkpoint(s => { s.binding!.articleId = id; s.namespace = binding.namespace; s.articleId = id; s.create!.verifiedId = id; });
                article = recovered; await project();
              }
              throw error;
            }
          }
          await project(); // durable identity precedes replacement of the provisional title
        }
        const id = state.binding!.articleId!;
        article = await rawClient.getArticle(id);
        if (state.publish?.outcome === 'rejected') {
          // A definite validation rejection may be retried only after a new eligible
          // source save and a read confirming that the old request did not publish.
          if (sourceGeneration <= state.publish.generation || observedPublished(article) || Number(article.version ?? 0) > state.publish.previousVersion) {
            throw new FigshareWaiting('publication_confirmation');
          }
          await checkpoint(s => { delete s.publish; });
        } else if (state.publish && state.publish.outcome !== 'observed') {
          if (observedPublished(article) && Number(article.version ?? 0) > state.publish.previousVersion) await checkpoint(s => { s.publish!.outcome = 'observed'; });
          else throw new FigshareWaiting('publication_confirmation');
        }
        if (isCurationLocked(config, article)) throw new FigshareWaiting('curation');
        const pendingFiles = (await listArticleFiles(rawClient, id)).filter(f => String(f.status).toLowerCase() === 'created');
        if (pendingFiles.length) {
          if (!pendingFiles.every(file => state.receipts.some(r => r.fileId === String(file.id) && r.resumeApproved))) throw new FigshareWaiting('uploads');
          await mirrorManagedAssets(service.makeClient(config, record, owner, 'resume-upload'), config, record, id, state, checkpoint);
        }
        setRecordField(record, config.record.articleIdPath, id);
        const previousAssets = state.checkpoints.assets;
        await service.syncMetadata(record, { action: 'update', articleId: id, sameJob: true, syncState: { status: 'syncing', correlationId: owner } });
        const client = service.makeClient(config, record, owner, 'worker');
        await mirrorManagedAssets(client, config, record, id, state, checkpoint);
        const assetsChanged = previousAssets !== state.checkpoints.assets;
        await syncEmbargoPhase(client, config, record, id);
        await checkpoint(s => { s.checkpoints.embargo = contentHash(config.embargo.mode === 'none' ? null : record.metadata); });
        await assertCurrent();
        article = await rawClient.getArticle(id);
        const publishHash = contentHash(state.checkpoints);
        const needsPublish = !observedPublished(article) || (metadataChanged && config.article.republishOnMetadataChange) || (assetsChanged && config.article.republishOnAssetChange);
        if (needsPublish && state.publish?.hash !== publishHash && config.article.publishMode !== 'manual') {
          await checkpoint(s => { s.publish = { generation: sourceGeneration, hash: publishHash, previousVersion: Number(article!.version ?? 0), outcome: 'submitted', submittedAt: new Date().toISOString() }; });
          try {
            await client.publishArticle(id);
            await checkpoint(s => { s.publish!.outcome = 'accepted'; });
          } catch (error) {
            const body = error instanceof FigshareHttpError ? error.responseBody as { code?: unknown; message?: unknown } | undefined : undefined;
            const rejected = error instanceof FigshareHttpError && error.statusCode === 400
              && body?.code === 'BadRequest' && typeof body.message === 'string'
              && body.message.startsWith('Missing mandatory value:');
            await checkpoint(s => { s.publish!.outcome = rejected ? 'rejected' : 'uncertain'; });
            throw error;
          }
        }
        await finish('sync');
        await checkpoint(s => {
          s.status = observedPublished(article!) ? 'synced' : 'waiting'; delete s.error;
          s.waitingReason = observedPublished(article!) ? undefined : config.article.publishMode === 'manual' ? 'manual_publication' : 'review';
          s.work.observe.requested++; s.work.observe.dueAt = Date.now() + settings.observationMs;
          if (s.receipts.some(r => r.kind === 'hosted' && r.desired)) {
            s.work.cleanup.requested++; s.work.cleanup.dueAt = s.work.cleanup.dueAt ?? Date.now() + settings.cleanupMs;
          }
        });
        if (!state.auditClosed) {
          completeFigshareAudit(state.audit, { message: 'Figshare content synchronised; publication is observed separately.', responseSummary: { articleId: id, sourceGeneration, requests: startedWork.sync.requested } });
          await checkpoint(s => { s.auditClosed = true; });
        }
        await project();
      }
      if (!state.binding?.articleId) {
        if (due('cleanup')) await finish('cleanup');
        if (due('observe')) await finish('observe');
        return;
      }
      const id = state.binding.articleId;
      article = await rawClient.getArticle(id);
      await checkpoint(s => { s.publication = observedPublished(article!) ? 'published' : s.publish ? 'pending' : 'private'; s.embargoed = article!.is_embargoed === true; s.observedAt = new Date().toISOString(); });
      if (due('cleanup')) {
        kind = 'cleanup';
        if (startedWork.cleanup.policies.length && !await eligible(startedWork.cleanup.policies, record)) throw new FigshareWaiting('cleanup_eligibility');
        for (let attempt = 0; attempt < 3; attempt++) {
          record = await RecordsService.getMeta(oid);
          const entries = await cleanupProjection(rawClient, config, record, article, state);
          await store.assertOwner(oid, owner);
          const fields: Record<string, unknown> = { [config.record.dataLocationsPath]: entries };
          if (config.record.allFilesUploadedPath) fields[config.record.allFilesUploadedPath] = 'yes';
          if ((await RecordsService.setRecordFields(oid, fields, record.recordVersion ?? 0, projectionPaths(config), user)).updated) { await finish('cleanup'); break; }
          if (attempt === 2) throw new FigshareWaiting('record_changed');
        }
      }
      if (due('observe')) {
        kind = 'observe';
        if (!observedPublished(article)) throw new FigshareWaiting(config.article.publishMode === 'manual' ? 'manual_publication' : 'review');
        if (state.publish && state.publish.outcome !== 'observed') {
          if (Number(article.version ?? 0) <= state.publish.previousVersion) throw new FigshareWaiting('publication_confirmation');
          await checkpoint(s => { s.publish!.outcome = 'observed'; });
        }
        const publicationKey = `${id}:${article.version ?? article.published_date}`;
        if (state.publicationAuditKey !== publicationKey) {
          // Persist the marker first: recurring observation must not produce another event.
          await checkpoint(s => { s.publicationAuditKey = publicationKey; });
          const publicationAudit = startFigshareAudit(oid, IntegrationAuditAction.publishAfterUploadFilesJob, createRunContext(record, config, owner, 'observation'), { articleId: id });
          completeFigshareAudit(publicationAudit, { message: 'Figshare publication confirmed.', responseSummary: { articleId: id, version: article.version, publication: 'published' } });
        }
        record = await RecordsService.getMeta(oid);
        if (record.figshareSyncIntent?.pending || state.work.sync.requested > state.work.sync.processed) throw new FigshareWaiting('newer_sync');
        if (state.receipts.some(r => !['available', 'removed'].includes(r.state))) throw new FigshareWaiting('uploads');
        const transition = config.workflow.transitionJob;
        if (transition.enabled && record.workflow.stage !== transition.targetStep && article[transition.figshareTargetFieldKey] === transition.figshareTargetFieldValue) {
          // Current business eligibility is still required even though the source actor is not used again.
          if (!await eligible(state.work.sync.policies, record)) throw new FigshareWaiting('workflow_eligibility');
          const recordType = await RecordTypesService.get(brand, record.metaMetadata.type).toPromise();
          if (!recordType) throw new FigshareRepairRequired("Workflow record type is missing");
          const step = await WorkflowStepsService.get(recordType, transition.targetStep).toPromise();
          await store.assertOwner(oid, owner);
          const result = await RecordsService.updateMeta(brand, oid, record, user, true, true, step, record.metadata, { expectedVersion: record.recordVersion ?? 0, maintenance: true });
          if (!result.isSuccessful()) throw new FigshareRepairRequired('Workflow hooks failed; inspect partial transition before resuming');
        }
        await finish('observe');
        await checkpoint(s => { s.status = 'synced'; delete s.waitingReason; });
        await project();
      }
      if (state.status === 'running') await checkpoint(s => { s.status = s.nextActionAt == null ? 'synced' : 'waiting'; });
    });
  } catch (error) {
    if (error instanceof FigshareLeaseLost || abort.signal.aborted) return;
    if (error instanceof FigshareWaiting || error instanceof RecordWriteConflict) {
      await wait(error instanceof FigshareWaiting ? error.reason : 'record_changed');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      const category = error instanceof FigshareRepairRequired ? 'repair' : error instanceof FigshareHttpError ? `http:${error.statusCode ?? 'transport'}` : 'configuration_or_operation';
      await checkpoint(s => {
        const previous = s.error?.category === category && (!s.error.kind || s.error.kind === kind) ? s.error : undefined;
        const count = (previous?.count ?? 0) + 1;
        const terminal = category === 'repair' || (error instanceof FigshareHttpError && error.statusCode != null && error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode)) || count >= settings.maxAttempts;
        s.error = { kind, category, message, count, firstAt: previous?.firstAt ?? new Date().toISOString(), lastAt: new Date().toISOString(), terminal };
        s.status = terminal ? category === 'repair' ? 'repair_required' : 'failed' : 'retrying';
        if (s.work[kind].requested === startedWork[kind].requested) s.work[kind].dueAt = terminal ? null : Date.now() + settings.retryBaseMs * 2 ** (count - 1);
      });
      if (state.error?.terminal && !state.auditClosed && state.audit) {
        failFigshareAudit(state.audit, new Error(message), { message, responseSummary: { articleId: state.binding?.articleId, attempts: state.error.count, category } });
        await checkpoint(s => { s.auditClosed = true; });
      }
    }
  } finally {
    clearInterval(heartbeat); abort.abort(); await store.release(oid, owner);
  }
}
