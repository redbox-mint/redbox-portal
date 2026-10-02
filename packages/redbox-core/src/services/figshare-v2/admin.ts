import { randomUUID } from 'node:crypto';
import type { RecordModel, FigshareArticle } from './types';
import { getRecordField } from './types';
import { getSyncStore } from './worker';
import { resolveFigsharePublishingConfig } from './config';
import { createRunContext } from './context';
import { makeLiveClient, makeFixtureClient } from './http';
import { recoverCreate, apiNamespace, observedPublished } from './identity';
import { figshareExecution, FigshareRepairRequired } from './execution';
import { isCurationLocked } from './runtime';
import type { FigshareSyncModel, FigshareBinding, FigshareCreateOperation } from '../../model/storage/FigshareSyncModel';

export type FigshareAdminAction = 'inspect' | 'reconcile' | 'abandon-create' | 'link' | 'relink' | 'resume' | 'reset-publish' | 'migrate' | 'bind-file' | 'resume-upload';
export interface FigshareAdminOptions { action: FigshareAdminAction; oid?: string; username: string; articleId?: string; ownerId?: string; apply?: boolean; receipt?: string; fileId?: string }

/** Operators use application identities/configuration; no direct DB edits or remote writes. */
export async function figshareAdmin(options: FigshareAdminOptions, internal: { legacyBindingsCounted?: boolean } = {}): Promise<unknown> {
  const actor = await UsersService.getUserWithUsername(options.username).toPromise();
  if (!actor || actor.disabled === true || !RolesService.getAdminFromRoles(actor.roles ?? [])) throw new Error('A current ReDBox administrator is required');
  const store = getSyncStore();
  const storage = RecordsService.getFigshareIntentStorage();
  if (options.action === 'migrate') {
    const scan = storage.scanFigshareRecords?.bind(storage);
    if (!scan) throw new Error('Storage adapter cannot scan records for migration');
    // Two paged passes hold one page at a time: the first counts legacy bindings, the second migrates.
    const pages = async function* (): AsyncGenerator<RecordModel[]> {
      for (let after = ''; ;) {
        const page = await scan(after, 100);
        yield page;
        if (page.length < 100) return;
        after = page[page.length - 1].redboxOid;
      }
    };
    const counts = new Map<string, number>();
    for await (const page of pages()) {
      for (const record of page) {
        const config = resolveFigsharePublishingConfig(record);
        if (!config) continue;
        const id = String(getRecordField(record, config.record.articleIdPath) ?? '');
        if (id) { const key = `${apiNamespace(config)}:${id}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
      }
    }
    const report: Array<Record<string, unknown>> = [];
    for await (const page of pages()) for (const record of page) {
      const config = resolveFigsharePublishingConfig(record);
      if (!config) continue;
      const id = String(getRecordField(record, config.record.articleIdPath) ?? '');
      const legacy = getRecordField(record, config.record.syncStatePath);
      if (!id && !legacy) continue;
      const duplicate = id && (counts.get(`${apiNamespace(config)}:${id}`) ?? 0) > 1;
      if (!id || duplicate) {
        report.push({ oid: record.redboxOid, articleId: id || undefined, status: duplicate ? 'duplicate_binding' : 'uncertain_legacy_create' });
        if (options.apply) {
          await store.ensureIndexes(); await store.initialise(record.redboxOid, record.metaMetadata.brandId);
          const owner = `migration:${randomUUID()}`;
          const lock = await store.collection.updateOne({ oid: record.redboxOid, leaseUntil: { $lte: Date.now() } }, { $set: { leaseOwner: owner, leaseUntil: Date.now() + 120000 }, $inc: { revision: 1 } });
          if (!lock.matchedCount) throw new Error(`Record ${record.redboxOid} has an active worker; pause processing before migration`);
          try {
            await store.change(record.redboxOid, s => {
              s.status = 'repair_required'; s.waitingReason = duplicate ? 'duplicate_binding' : 'uncertain_legacy_create';
              for (const work of Object.values(s.work)) work.dueAt = null;
            }, owner);
          } finally { await store.release(record.redboxOid, owner); }
        }
        continue;
      }
      try {
        report.push({ oid: record.redboxOid, result: await figshareAdmin({ ...options, action: 'link', oid: record.redboxOid, articleId: id }, { legacyBindingsCounted: true }) });
      } catch (e) { report.push({ oid: record.redboxOid, status: 'repair_required', message: e instanceof Error ? e.message : String(e) }); }
    }
    return report;
  }
  const oid = options.oid;
  if (!oid) throw new Error('An OID is required');
  const record = await RecordsService.getMeta(oid);
  if (!record) throw new Error('Record not found');
  const brand = BrandingService.getBrandById(record.metaMetadata.brandId);
  if (!brand || !await RecordsService.hasEditAccess(brand, actor, (actor.roles ?? []).map(r => ({ ...r })), record)) throw new Error('Administrator does not have access to this record');
  let state: FigshareSyncModel | null = await store.get(oid);
  if (options.action === 'inspect') return { oid, sourceIntent: record.figshareSyncIntent, state };
  const config = resolveFigsharePublishingConfig(record);
  if (!config) throw new Error('Figshare configuration is unavailable');
  const client = config.runtime.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, createRunContext(record, config, undefined, 'admin'));
  const account = await client.getAccount!();
  if (state?.binding && (state.binding.namespace !== apiNamespace(config) || state.binding.accountId !== String(account.id))) throw new FigshareRepairRequired('Configured API environment/account differs from the persisted binding');
  const readOnly = <T>(binding: FigshareBinding | undefined, read: () => Promise<T>) => figshareExecution.run({
    binding, signal: new AbortController().signal,
    guard: async () => { throw new Error('Administrative verification is read-only'); },
    metadata: async () => { throw new Error('Administrative verification is read-only'); }
  }, read);
  const reconcileCreate = (create: FigshareCreateOperation) => figshareExecution.run({ binding: create.binding, recovery: true, signal: new AbortController().signal,
    guard: async () => { throw new Error('Reconcile is read-only'); }, metadata: async () => { throw new Error('Reconcile is read-only'); }
  }, () => recoverCreate(client, create));
  if (options.action === 'reconcile') {
    if (!state?.create) return { state, candidates: [] };
    const recovered = await reconcileCreate(state.create);
    return { state, candidates: recovered ? [{ articleId: recovered.id, title: recovered.title }] : [] };
  }
  let abandonedCreate: string | undefined;
  if (options.action === 'abandon-create') {
    if (!state?.create || state.binding?.articleId) throw new Error('No unresolved create operation exists for this record');
    // Only a create absent from the owning account may be abandoned; a visible match must be linked instead.
    if (await reconcileCreate(state.create)) throw new FigshareRepairRequired('An article matches the create token; link it instead of abandoning the create');
    abandonedCreate = state.create.token;
  }
  let unconfirmedPublish: string | undefined;
  if (options.action === 'reset-publish') {
    const publish = state?.publish;
    if (!publish || publish.outcome === 'observed' || !state?.binding?.articleId) throw new Error('No unconfirmed publication request exists for this record');
    const binding = state.binding;
    const article = await readOnly(binding, () => client.getArticle(binding.articleId!));
    if (observedPublished(article) && Number(article.version ?? 0) > publish.previousVersion) throw new Error('The request published the article; resume records the observation instead');
    if (isCurationLocked(config, article)) throw new Error('The article is under curation; wait for the curator before resetting publication');
    unconfirmedPublish = publish.submittedAt;
  }
  const fileAction = options.action === 'bind-file' || options.action === 'resume-upload';
  const receipt = fileAction ? state?.receipts.find(r => r.key === options.receipt) : undefined;
  let verifiedFile: { id: string; available: boolean } | undefined;
  if (fileAction) {
    if (!receipt || !state?.binding?.articleId || !/^\d+$/.test(options.fileId ?? '')) throw new Error('An existing receipt, authoritative article and explicit numeric file ID are required');
    const binding = state.binding;
    const descriptor = await readOnly(binding, () => client.getLocation(`${apiNamespace(config)}/account/articles/${binding.articleId}/files/${options.fileId}`));
    const available = ['available', 'completed'].includes(String(descriptor.status).toLowerCase());
    if (Number(descriptor.size) !== receipt.size || !receipt.md5 || String(available ? descriptor.computed_md5 : descriptor.supplied_md5).toLowerCase() !== receipt.md5) throw new Error('Remote file content evidence does not match the receipt');
    if (options.action === 'bind-file' && !available) throw new Error('Use resume-upload only after stopping the previous uploader');
    if (options.action === 'resume-upload' && !state.work.sync.policies.length) throw new Error('An authorised source sync policy is required to resume uploads');
    if (String(descriptor.id) !== options.fileId) throw new Error('Remote descriptor returned a different file identity');
    verifiedFile = { id: String(descriptor.id), available };
  }
  let remote: FigshareArticle | undefined;
  let verifiedOwnerId: string | undefined;
  if (['link', 'relink'].includes(options.action)) {
    const articleId = String(options.articleId ?? '');
    const existing = state?.binding?.articleId === articleId ? state.binding : undefined;
    if (options.ownerId != null && !/^\d+$/.test(options.ownerId)) throw new Error('An explicit numeric Figshare owner account ID is required');
    if (existing && options.ownerId != null && options.ownerId !== existing.ownerId) throw new FigshareRepairRequired('Supplied owner differs from the verified binding; linking cannot transfer ownership');
    const ownerId = options.ownerId ?? existing?.ownerId;
    const ownerReads = config.impersonation?.enabled && config.impersonation.operations.read === 'owner';
    if (ownerReads && !ownerId) throw new FigshareRepairRequired('Owner-based verification of an unbound or different article requires --owner-id ACCOUNT_ID');
    const binding = ownerId ? { namespace: apiNamespace(config), accountId: String(account.id), ownerId, articleId } : undefined;
    remote = await readOnly(binding, () => client.getArticle(articleId));
    if (String(remote.id) !== articleId) throw new FigshareRepairRequired('Remote article returned a different identity');
    if (ownerId && String(remote.account_id ?? '') !== ownerId) throw new FigshareRepairRequired('Remote article owner does not match the supplied or previously verified owner account');
    verifiedOwnerId = ownerId ?? String(remote.account_id ?? account.id);
  }
  if (remote) {
    const duplicate = await store.collection.findOne({ namespace: apiNamespace(config), articleId: String(remote.id), oid: { $ne: oid } });
    if (duplicate) throw new FigshareRepairRequired(`Article is already bound to record ${duplicate.oid}`);
    // Migration has already counted every legacy binding, so a per-record scan would only repeat it.
    const matches = internal.legacyBindingsCounted ? [] : await storage.findFigshareArticleRecords?.(config.record.articleIdPath, String(remote.id)) ?? [];
    if (matches.some(r => r.redboxOid !== oid && resolveFigsharePublishingConfig(r)?.connection.baseUrl.replace(/\/+$/, '') === apiNamespace(config))) throw new FigshareRepairRequired('Duplicate legacy bindings must be resolved first');
    if (state?.binding?.articleId && state.binding.articleId !== String(remote.id) && options.action !== 'relink') throw new Error('Use explicit relink to change an existing authoritative article ID');
  }
  if (!options.apply) return { dryRun: true, oid, action: options.action, articleId: remote?.id, file: verifiedFile, publication: remote && observedPublished(remote), ownerId: verifiedOwnerId, retainedLocalBytes: true };
  await store.ensureIndexes();
  await store.initialise(oid, record.metaMetadata.brandId);
  const owner = `admin:${randomUUID()}`;
  const lock = await store.collection.updateOne({ oid, leaseUntil: { $lte: Date.now() } }, { $set: { leaseOwner: owner, leaseUntil: Date.now() + 120000 }, $inc: { revision: 1 } });
  if (!lock.matchedCount) throw new Error('Record has an active worker; pause processing and try again');
  try {
    state = await store.change(oid, s => {
      if (verifiedFile && receipt) {
        const current = s.receipts.find(r => r.key === receipt.key);
        if (!current || current.digest !== receipt.digest || current.articleId !== s.binding?.articleId || s.binding?.articleId !== state?.binding?.articleId) throw new Error('Receipt changed during verification; inspect and retry');
        current.fileId = verifiedFile.id; current.state = verifiedFile.available ? 'available' : 'uploading';
        current.resumeApproved = !verifiedFile.available;
        s.status = 'queued'; delete s.error;
        if (s.auditClosed) { delete s.audit; s.auditClosed = false; }
        s.work.sync.requested++; s.work.sync.dueAt = Date.now();
      } else if (remote && verifiedOwnerId) {
        const changed = s.binding?.articleId && s.binding.articleId !== String(remote.id);
        if (changed && options.action !== 'relink') throw new Error('Use explicit relink to change an existing authoritative article ID');
        if (s.binding?.articleId === String(remote.id) && s.binding.ownerId !== verifiedOwnerId) throw new FigshareRepairRequired('Verified owner binding changed during verification; inspect and retry');
        if (changed && s.publish && s.publish.outcome !== 'observed') throw new Error('Reconcile the outstanding publication before relinking');
        if (changed && s.receipts.some(r => r.state !== 'removed')) throw new Error('Relinking with managed receipts requires reconciliation of those files first');
        if (changed) delete s.publish;
        s.binding = { namespace: apiNamespace(config), accountId: String(account.id), ownerId: verifiedOwnerId, articleId: String(remote.id) };
        s.namespace = s.binding.namespace; s.articleId = s.binding.articleId;
        s.publication = observedPublished(remote) ? 'published' : 'private'; s.embargoed = remote.is_embargoed === true;
        s.status = 'synced'; s.observedAt = new Date().toISOString();
        if (s.work.observe.dueAt == null) { s.work.observe.requested++; s.work.observe.dueAt = Date.now(); }
        // No publication or ownership transfer is requested by migration/linking.
      } else if (options.action === 'resume') {
        if (s.work.sync.policies.length === 0) throw new Error('No authorised source sync policy exists; save through an eligible configured source first');
        s.status = 'queued'; delete s.error;
        if (s.auditClosed) { delete s.audit; s.auditClosed = false; }
        s.work.sync.requested++; s.work.sync.dueAt = Date.now();
        // Create/publish/receipt uncertainty is intentionally retained.
      } else if (abandonedCreate) {
        if (s.binding?.articleId || s.create?.token !== abandonedCreate) throw new Error('Create evidence changed during verification; inspect and retry');
        delete s.create; delete s.createGeneration; delete s.createRequest; delete s.binding;
        // A fresh create waits for resume or a new eligible source save.
      } else if (unconfirmedPublish) {
        if (s.publish?.submittedAt !== unconfirmedPublish || s.binding?.articleId !== state?.binding?.articleId) throw new Error('Publication evidence changed during verification; inspect and retry');
        delete s.publish;
        // Publication is requested again by resume or a new eligible source save.
      }
      s.corrections = [...(s.corrections ?? []).slice(-49), { at: new Date().toISOString(), actor: actor.username, action: options.action, articleId: remote ? String(remote.id) : undefined }];
    }, owner);
    return { oid, state, retainedLocalBytes: true };
  } finally { await store.release(oid, owner); }
}
