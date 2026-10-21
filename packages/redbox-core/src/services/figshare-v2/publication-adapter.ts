import { attestWithProviderRepair } from '../publication/attestation';
import { publicationOperationEvidence, publicationOperationRequiresRecovery } from '../publication/operations';
import { figsharePublicationRepairs } from './publication-admin';
import { randomUUID } from 'node:crypto';
import { cloneDeep, get } from 'lodash';
import type {
  PublicationObject,
  PublicationOperation,
  PublicationProvider,
  PublicationProviderExecution,
  PublicationProviderOutcome,
} from '../publication/contracts';
import { BUILTIN_PUBLICATION_DEFINITIONS, isPublicationObject } from '../publication/builtins';
import { publicationDigest } from '../publication/canonical';
import { unresolvedPublicationOperation, PublicationStopped } from '../publication/execution';
import { PublicationLeaseLost, PublicationBindingConflict } from '../publication/ownership';
import type { FigshareSyncModel } from '../../model/storage/FigshareSyncModel';
import type { FigshareArticle, FigshareArticlePayload } from './types';
import { getRecordField, setRecordField } from './types';
import {
  figshareExecution,
  workerClient,
  FigshareRepairRequired,
  FigshareWaiting,
  type FigshareExecution,
} from './execution';
import { FigshareHttpError } from './http';
import {
  apiNamespace,
  resolveCreationOwner,
  newCreateOperation,
  provisionalTitle,
  recoverCreate,
  observedPublished,
} from './identity';
import { isCurationLocked, listArticleFiles } from './runtime';
import { mirrorManagedAssets, cleanupProjection } from './managed-assets';
import { syncEmbargoPhase } from './embargo';
import { figshareDestinationConfiguration, figsharePublicationOutputPaths } from './publication-config';
import { writeBackPhase } from './writeback';
import {
  decodeFigshareLegacy,
  decodeFigshareProviderState,
  emptyFigshareEvidence,
  figshareJson,
} from './publication-state';
import {
  prepareFigshareSource,
  describeFigshareSource,
  resolveSealedFigshareCrosswalk,
  figshareSourceRecord,
  type PublicationFigshareService,
} from './publication-source';
import { figsharePublicationContext } from './publication-context';
import { figshareCrosswalkResolver } from './bindings';

type Context = PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>;
type Outcome = PublicationProviderOutcome<PublicationObject>;
const definition = BUILTIN_PUBLICATION_DEFINITIONS.find(provider => provider.id === 'figshare')!;
const valid = <T>(value: T) => ({ valid: true as const, value });
const invalid = (code: string) => ({
  valid: false as const,
  issues: [{ path: '', code, message: 'Invalid Figshare publication input; evidence retained' }],
});
const digest = (value: unknown) => publicationDigest(figshareJson({ value }));
function remoteMetadata(article: FigshareArticle, payload: FigshareArticlePayload): PublicationObject {
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (key === 'custom_fields') {
      const remote = Array.isArray(article.custom_fields)
        ? Object.fromEntries(
            article.custom_fields.map(value => {
              if (!value || typeof value !== 'object') throw new Error('Invalid Figshare custom field');
              return [Reflect.get(value, 'name'), Reflect.get(value, 'value')];
            })
          )
        : article.custom_fields;
      fields[key] = Object.fromEntries(
        Object.keys(payload.custom_fields ?? {}).map(name => [
          name,
          remote && typeof remote === 'object' ? Reflect.get(remote, name) : undefined,
        ])
      );
    } else if (key === 'defined_type' && typeof payload[key] === 'string')
      fields[key] = article.defined_type_name ?? article[key];
    else if (key === 'license' && article[key] && typeof article[key] === 'object') {
      const value = Reflect.get(article[key], 'value') ?? Reflect.get(article[key], 'id');
      fields[key] = String(value) === String(payload[key]) ? payload[key] : value;
    } else if (key === 'categories' && Array.isArray(article[key]))
      fields[key] = article[key].map(value => (value && typeof value === 'object' ? Reflect.get(value, 'id') : value));
    else if (key === 'authors' && Array.isArray(article[key]))
      fields[key] = article[key].map((value, index) => {
        if (!value || typeof value !== 'object') return value;
        const expected = payload.authors?.[index];
        if (expected?.id != null) {
          const id = Reflect.get(value, 'id');
          return { id: String(id) === String(expected.id) ? expected.id : id };
        }
        return { name: Reflect.get(value, 'full_name') ?? Reflect.get(value, 'name') };
      });
    else fields[key] = article[key];
  }
  return figshareJson(fields);
}
function mergeCustomFields(article: FigshareArticle, payload: FigshareArticlePayload): FigshareArticlePayload {
  if (!payload.custom_fields) return payload;
  const remote = Array.isArray(article.custom_fields)
    ? Object.fromEntries(
        article.custom_fields
          .filter(value => value && typeof value === 'object')
          .map(value => [Reflect.get(value, 'name'), Reflect.get(value, 'value')])
      )
    : article.custom_fields;
  return {
    ...payload,
    custom_fields: { ...(remote && typeof remote === 'object' ? remote : {}), ...payload.custom_fields },
  };
}
function matchesEmbargo(article: FigshareArticle, payload: PublicationObject): boolean {
  return (
    article.is_embargoed === true &&
    ['embargo_type', 'embargo_date', 'embargo_reason'].every(
      key => String(article[key] ?? '') === String(payload[key] ?? '')
    )
  );
}

/** Figshare sequencing only. Ownership, authority, retries and journals belong to the shared worker. */
export function createFigsharePublicationProvider(
  service: () => PublicationFigshareService
): PublicationProvider<PublicationObject, PublicationObject, PublicationObject> {
  const execute = (context: Context, action: 'synchronise' | 'observe' | 'reconcile') =>
    runFigshareAdapter(context, service(), action);
  return {
    ...definition,
    attestOperation: context => attestWithProviderRepair(context, figsharePublicationRepairs(service)),
    stateVersion: 2,
    sourceMaintenancePaths: figsharePublicationOutputPaths,
    postCompletionReplacement: {
      capability: 'attachment-to-url',
      receiptField: 'figshareReceipt',
      path: destination => {
        const config = figshareDestinationConfiguration(destination);
        return config.assets.enableHostedFiles ? config.record.dataLocationsPath : undefined;
      },
      entries: (state, approvalId, generation) =>
        isPublicationObject(state.cleanupProjection) &&
        state.cleanupProjection.approvalId === approvalId &&
        state.cleanupProjection.generation === generation &&
        Array.isArray(state.cleanupProjection.dataLocations)
          ? state.cleanupProjection.dataLocations
          : undefined,
    },
    decodeState(value, version) {
      try {
        return valid(decodeFigshareProviderState(value, version));
      } catch {
        return invalid('figshare-state');
      }
    },
    upgradeState(value, version) {
      try {
        return valid(decodeFigshareProviderState(value, version));
      } catch {
        return invalid('figshare-state-version');
      }
    },
    summariseStatus(state) {
      const legacy = state.legacy ? decodeFigshareLegacy(state.legacy) : undefined;
      const publication = legacy?.publication;
      return {
        deposit: legacy?.binding?.articleId ? 'confirmed' : 'unverified',
        publication:
          publication === 'published' || publication === 'pending' || publication === 'private'
            ? publication
            : 'unverified',
        ingestion: 'not_required',
        visibility: publication === 'published' ? 'verified' : 'unverified',
        ...(typeof legacy?.embargoed === 'boolean' ? { embargoed: legacy.embargoed } : {}),
        ...(publication === 'published' && typeof legacy?.embargoed === 'boolean'
          ? { accessible: !legacy.embargoed }
          : {}),
      };
    },
    decodePreparedSource(value) {
      return isPublicationObject(value) &&
        isPublicationObject(value.localPayload) &&
        isPublicationObject(value.configuration) &&
        isPublicationObject(value.crosswalks)
        ? valid(value)
        : invalid('figshare-source');
    },
    async prepareSource(input) {
      try {
        return valid(await prepareFigshareSource(input, service()));
      } catch {
        return invalid('figshare-preflight');
      }
    },
    async describeSource(input, prepared) {
      return describeFigshareSource(input, prepared);
    },
    synchronise: context => execute(context, 'synchronise'),
    observe: context => execute(context, 'observe'),
    reconcile: context => execute(context, 'reconcile'),
    repairs: figsharePublicationRepairs(service),
  };
}

async function runFigshareAdapter(
  context: Context,
  service: PublicationFigshareService,
  action: 'synchronise' | 'observe' | 'reconcile'
): Promise<Outcome> {
  let state = cloneDeep(context.state);
  const evidence: FigshareSyncModel = state.legacy
    ? decodeFigshareLegacy(state.legacy)
    : emptyFigshareEvidence(context.oid, context.brandId);
  if (evidence.oid !== context.oid || evidence.brandId !== context.brandId)
    throw new FigshareRepairRequired('Figshare state belongs to another record');
  const base = figshareDestinationConfiguration(context.configuration, context.credentials);
  const record = figshareSourceRecord(context.source.metadata, context.oid, context.brandId);
  const config = figsharePublicationContext.run(
    { oid: context.oid, brandId: context.brandId, configuration: base, preflight: false },
    () => service.getConfig(record)
  );
  if (!config) throw new FigshareRepairRequired('Figshare override disabled the approved destination');
  const confirmedIds = new Set<string>();
  const checkpoint = async (change: (value: FigshareSyncModel) => void) => {
    change(evidence);
    state = { ...state, legacy: figshareJson(evidence) };
    await context.checkpoint(state, [...confirmedIds]);
    return evidence;
  };
  const save = () => checkpoint(() => {});
  const waiting = (reason: string): Outcome => ({ kind: 'waiting', state, reason });
  const operations = cloneDeep([...context.operations]);
  const proof = (operation: PublicationOperation) =>
    publicationOperationEvidence(
      {
        ...context,
        providerId: 'figshare',
        targetFingerprint: context.approval.targetFingerprints[context.destinationId],
      },
      operation,
      operation.identity?.remote ??
        (operation.outcome === 'confirmed' ? operation.confirmation?.remote : undefined) ??
        (evidence.binding?.articleId
          ? { namespace: evidence.binding.namespace, objectId: evidence.binding.articleId }
          : undefined)
    );
  const journal = async (
    operation: PublicationOperation,
    outcome: PublicationOperation['outcome'],
    result: PublicationObject = {}
  ) => {
    const next = {
      ...operation,
      outcome,
      ...(['confirmed', 'not_applied', 'rejected'].includes(outcome) ? { confirmation: proof(operation) } : {}),
      evidence: { ...operation.evidence, ...result },
    };
    await context.journal(next);
    if (outcome === 'confirmed') confirmedIds.add(operation.id);
    const index = operations.findIndex(item => item.id === next.id);
    if (index >= 0) operations[index] = next;
    // Create identity was verified and checkpointed before confirming its journal.
    if (outcome === 'confirmed' && operation.kind === 'figshare:create') await save();
  };
  const raw = figsharePublicationContext.run(
    { oid: context.oid, brandId: context.brandId, configuration: config, preflight: false },
    () => service.makeClient(config, record, context.approval.id, 'publication-worker')
  );
  const readBoundArticle = async (id: string) => {
    const binding = evidence.binding;
    if (!binding?.articleId || binding.articleId !== id)
      throw new FigshareRepairRequired('Article differs from the retained Figshare binding');
    const article = await raw.getArticle(id);
    if (String(article.id) !== id || String(article.account_id) !== binding.ownerId)
      throw new FigshareRepairRequired('Article identity or owner differs from retained Figshare evidence');
    return article;
  };
  let metadataChanged = state.changedPayloadApproval === context.approval.id;
  const execution: FigshareExecution = {
    signal: context.signal,
    binding: evidence.binding,
    recovery: context.recovery,
    guard: async () => {
      if (context.recovery || action !== 'synchronise')
        throw new FigshareRepairRequired('Read-only Figshare processing cannot mutate');
      await context.assertAuthority();
      if (evidence.binding?.articleId && isCurationLocked(config, await readBoundArticle(evidence.binding.articleId)))
        throw new FigshareWaiting('curation');
    },
    attachment: async (oid, id) => {
      const attachment = context.source.attachments.find(value => value.id === id);
      if (oid !== context.oid || !attachment)
        throw new FigshareRepairRequired('Attachment is outside Figshare approval');
      return { readstream: await context.openAttachment(id, attachment.logicalPath), size: attachment.size };
    },
    attachmentFingerprint: async (oid, id) => {
      const attachment = context.source.attachments.find(value => value.id === id);
      if (oid !== context.oid || !attachment)
        throw new FigshareRepairRequired('Attachment is outside Figshare approval');
      const { staged: _staged, ...identity } = attachment;
      return digest(identity);
    },
    metadata: async (id, candidate, send) => {
      const payload =
        state.payloadApproval === context.approval.id && isPublicationObject(state.payload)
          ? state.payload
          : figshareJson(candidate);
      state = { ...state, payload, payloadApproval: context.approval.id };
      await save(); // Pin actual overridden payload, including lookup IDs, before mutation.
      const current = await readBoundArticle(id);
      const hash = digest(payload);
      if (digest(remoteMetadata(current, payload)) === hash) {
        await checkpoint(value => {
          value.checkpoints.metadata = hash;
        });
        return current;
      }
      metadataChanged = true;
      state = { ...state, changedPayloadApproval: context.approval.id };
      await save();
      const result = await send(mergeCustomFields(current, payload));
      await checkpoint(value => {
        value.checkpoints.metadata = hash;
      });
      return { ...result, id };
    },
    mutate: async (kind, input, send) => {
      const receipt = evidence.receipts.find(value =>
        kind === 'file_init'
          ? value.state === 'initialising'
          : input.fileId !== undefined
            ? value.fileId === input.fileId
            : value.state === 'uploading' || value.state === 'completing'
      );
      const operation: PublicationOperation = {
        id: randomUUID(),
        kind: `figshare:${kind}`,
        approvalId: context.approval.id,
        approvalEpoch: context.approval.epoch,
        sourceGeneration: context.sourceGeneration,
        intendedDigest: digest(input),
        submittedAt: new Date().toISOString(),
        outcome: 'submitted',
        evidence: figshareJson({
          articleId: evidence.binding?.articleId,
          receiptKey: receipt?.key,
          fileId: input.fileId ?? receipt?.fileId,
          part: input.part,
          token: kind === 'create' ? evidence.create?.token : undefined,
          metadataHash: kind === 'metadata' ? digest(state.payload) : undefined,
          embargo: kind === 'embargo' ? input.payload : undefined,
        }),
      };
      operations.push(operation);
      const result = await context.mutate(operation, send);
      if (kind === 'create') return result; // Token read-back and binding must precede confirmation.
      if (kind === 'metadata') {
        const current = await readBoundArticle(String(input.articleId));
        if (
          !isPublicationObject(state.payload) ||
          digest(remoteMetadata(current, state.payload)) !== digest(state.payload)
        )
          throw new FigshareRepairRequired('Metadata response was not verified by read-back');
      }
      if (kind === 'embargo' || kind === 'embargo_clear') {
        const current = await readBoundArticle(String(input.articleId));
        if (
          kind === 'embargo'
            ? !isPublicationObject(input.payload) || !matchesEmbargo(current, input.payload)
            : current.is_embargoed !== false
        )
          throw new FigshareRepairRequired('Embargo response was not verified by read-back');
      }
      const response = result && typeof result === 'object' ? result : {};
      const fileId =
        kind === 'file_init'
          ? String(
              Reflect.get(response, 'entity_id') ??
                Reflect.get(response, 'id') ??
                /\/files\/(\d+)(?:$|\?)/.exec(String(Reflect.get(response, 'location') ?? ''))?.[1] ??
                ''
            )
          : undefined;
      if (kind === 'file_init' && !fileId)
        throw new FigshareRepairRequired('Uncertain file initialisation requires repair');
      await journal(operation, 'confirmed', figshareJson({ acknowledged: true, fileId }));
      // Multipart parts have no separate provider-state phase between sends. Their owning
      // receipt/file identity is already durable; checkpoint that identity with the part acknowledgement.
      if (kind === 'upload_part') await save();
      return result;
    },
  };
  const recovery = <T>(run: () => Promise<T>) =>
    figshareExecution.run({ ...execution, binding: evidence.create?.binding ?? evidence.binding, recovery: true }, run);
  const bind = async () => {
    const binding = evidence.binding;
    if (!binding?.articleId) return;
    if (
      context.binding &&
      (context.binding.namespace !== binding.namespace || context.binding.objectId !== binding.articleId)
    )
      throw new FigshareRepairRequired('Shared and Figshare bindings disagree');
    if (!context.recovery)
      await context.bind({
        namespace: binding.namespace,
        objectId: binding.articleId,
        targetFingerprint: definition.targetFingerprint(context.configuration),
        evidence: figshareJson({ accountId: binding.accountId, ownerId: binding.ownerId }),
      });
    execution.binding = binding;
  };
  const run = async (): Promise<Outcome> => {
    if (!config.connection.token) throw new FigshareRepairRequired('Configure a Figshare API token');
    if (!raw.getAccount) throw new FigshareRepairRequired('Figshare client cannot verify token account');
    const account = await raw.getAccount();
    const accountId = String(account.id);
    const connection = context.configuration.connection;
    if (!/^\d+$/.test(accountId) || !isPublicationObject(connection) || accountId !== connection.accountId)
      throw new FigshareRepairRequired('Figshare token account differs from the approved target');
    if (
      evidence.binding &&
      (evidence.binding.namespace !== apiNamespace(config) || evidence.binding.accountId !== accountId)
    )
      throw new FigshareRepairRequired('Figshare API namespace or token account changed');
    if (context.binding && !evidence.binding)
      throw new FigshareRepairRequired('Shared binding has no verified Figshare owner evidence');

    if (action === 'reconcile') {
      for (const operation of operations.filter(publicationOperationRequiresRecovery)) {
        const kind = operation.kind.replace(/^figshare:/, '');
        // A completed synchronization watermark incorporates earlier confirmed mutations even
        // after later approved work replaces their observable metadata, embargo or owned files.
        // It never resolves a submitted/uncertain operation or supplies current completion.
        if (
          operation.outcome === 'confirmed' &&
          operation.approvalId !== '' &&
          operation.approvalEpoch > 0 &&
          [
            'create',
            'metadata',
            'embargo',
            'embargo_clear',
            'file_init',
            'upload_part',
            'file_complete',
            'file_delete',
            'publish',
          ].includes(kind)
        ) {
          const retained = [state, ...(Array.isArray(state.retiredBindings) ? state.retiredBindings : [])];
          for (const value of retained) {
            if (!isPublicationObject(value)) continue;
            const candidate = decodeFigshareProviderState(value, 2);
            if (
              typeof candidate.syncedGeneration !== 'number' ||
              typeof candidate.syncedApproval !== 'string' ||
              candidate.syncedGeneration < operation.sourceGeneration ||
              (candidate.syncedGeneration === operation.sourceGeneration &&
                candidate.syncedApproval !== operation.approvalId)
            )
              continue;
            const syncedGeneration = candidate.syncedGeneration;
            const incorporated = decodeFigshareLegacy(candidate.legacy);
            const binding = incorporated.binding;
            const fileOperation = kind.startsWith('file_') || kind === 'upload_part';
            const ownedFile =
              !fileOperation ||
              (typeof operation.evidence.fileId === 'string' &&
                (incorporated.receipts.some(
                  receipt =>
                    receipt.articleId === binding?.articleId &&
                    receipt.fileId === operation.evidence.fileId &&
                    ['available', 'removed'].includes(receipt.state)
                ) ||
                  operations.some(
                    entry =>
                      entry.kind === 'figshare:file_delete' &&
                      entry.outcome === 'confirmed' &&
                      entry.evidence.articleId === binding?.articleId &&
                      entry.evidence.fileId === operation.evidence.fileId &&
                      entry.sourceGeneration <= syncedGeneration
                  )));
            if (
              incorporated.oid !== context.oid ||
              incorporated.brandId !== context.brandId ||
              !ownedFile ||
              !binding?.articleId ||
              binding.namespace !== apiNamespace(config) ||
              binding.accountId !== accountId ||
              (kind === 'create'
                ? incorporated.create?.token !== operation.evidence.token ||
                  incorporated.create?.verifiedId !== binding.articleId ||
                  incorporated.create?.binding.namespace !== binding.namespace ||
                  incorporated.create?.binding.accountId !== binding.accountId ||
                  incorporated.create?.binding.ownerId !== binding.ownerId
                : operation.evidence.articleId !== binding.articleId) ||
              (operation.evidence.articleId && operation.evidence.articleId !== binding.articleId) ||
              (kind === 'publish' &&
                (incorporated.publication !== 'published' ||
                  !incorporated.publish ||
                  (incorporated.publish.outcome !== 'observed' &&
                    !(
                      incorporated.publish.generation > operation.sourceGeneration &&
                      incorporated.publish.previousVersion > 0
                    ))))
            )
              continue;
            if (
              context.binding &&
              (context.binding.namespace !== evidence.binding?.namespace ||
                context.binding.objectId !== evidence.binding?.articleId)
            )
              throw new FigshareRepairRequired('Shared and Figshare bindings disagree');
            const article = await figshareExecution.run(
              { ...execution, binding: incorporated.create?.binding ?? binding, recovery: true },
              () => raw.getArticle(binding.articleId!)
            );
            if (String(article.id) !== binding.articleId || String(article.account_id) !== binding.ownerId)
              throw new FigshareRepairRequired('Incorporated article identity or owner differs from retained evidence');
            await journal(operation, 'confirmed', {
              synchronizationVerified: true,
            });
            break;
          }
          if (confirmedIds.has(operation.id)) continue;
        }
        if (kind === 'create') {
          if (!evidence.create || operation.evidence.token !== evidence.create.token)
            throw new FigshareRepairRequired('Create journal and token evidence disagree');
          const create = evidence.create;
          if (create.binding.namespace !== apiNamespace(config) || create.binding.accountId !== accountId)
            throw new FigshareRepairRequired('Create target differs from the approved account or namespace');
          const article = await recovery(() =>
            create.verifiedId ? raw.getArticle(create.verifiedId) : recoverCreate(raw, create)
          );
          if (!article)
            throw new FigshareRepairRequired(
              'Uncertain create has no unique visible token match; never create again blindly'
            );
          if (
            String(article.account_id) !== create.binding.ownerId ||
            (create.verifiedId && String(article.id) !== create.verifiedId) ||
            (operation.evidence.articleId && String(article.id) !== operation.evidence.articleId) ||
            (evidence.binding?.articleId &&
              (evidence.binding.articleId !== String(article.id) ||
                evidence.binding.ownerId !== create.binding.ownerId)) ||
            (context.binding &&
              (context.binding.namespace !== create.binding.namespace ||
                context.binding.objectId !== String(article.id)))
          )
            throw new FigshareRepairRequired(
              'Create article, owner or managing binding does not match retained identity'
            );
          await checkpoint(value => {
            value.binding = { ...value.create!.binding, articleId: String(article.id) };
            value.create!.verifiedId = String(article.id);
            if (value.create!.outcome !== 'failed') value.create!.outcome = 'confirmed';
            value.articleId = String(article.id);
            value.namespace = value.binding.namespace;
          });
          execution.binding = evidence.binding;
          await journal(operation, 'confirmed', { articleId: String(article.id), tokenVerified: true });
        } else {
          if (!evidence.binding?.articleId)
            throw new FigshareRepairRequired('Unresolved Figshare operation has no article binding');
          const id = evidence.binding.articleId;
          const article = await recovery(() => readBoundArticle(id));
          if (kind === 'publish') {
            if (!evidence.publish) throw new FigshareRepairRequired('Missing publication evidence');
            if (observedPublished(article) && Number(article.version ?? 0) > evidence.publish.previousVersion) {
              await checkpoint(value => {
                value.publish!.outcome = 'observed';
              });
              await journal(operation, 'confirmed', {
                articleId: id,
                version: Number(article.version),
                published: true,
              });
            } else if (isCurationLocked(config, article)) return waiting('curation');
            else throw new FigshareRepairRequired('Publication outcome is uncertain; verify before reset-publish');
          } else if (kind === 'embargo' || kind === 'embargo_clear') {
            if (
              kind === 'embargo'
                ? !isPublicationObject(operation.evidence.embargo) ||
                  !matchesEmbargo(article, operation.evidence.embargo)
                : article.is_embargoed !== false
            )
              throw new FigshareRepairRequired('Uncertain embargo requires verified read-back');
            await journal(operation, 'confirmed', { readBack: true });
          } else if (kind === 'metadata') {
            if (
              !isPublicationObject(state.payload) ||
              digest(state.payload) !== operation.evidence.metadataHash ||
              digest(remoteMetadata(article, state.payload)) !== operation.evidence.metadataHash
            )
              throw new FigshareRepairRequired(
                'Uncertain metadata requires verification against the actual outgoing payload'
              );
            await journal(operation, 'confirmed', { readBack: true });
            await checkpoint(value => {
              value.checkpoints.metadata = String(operation.evidence.metadataHash);
            });
          } else if (kind.startsWith('file_') || kind === 'upload_part') {
            const receipt = evidence.receipts.find(
              value => value.key === operation.evidence.receiptKey || value.fileId === operation.evidence.fileId
            );
            const files = await recovery(() => listArticleFiles(raw, id));
            const file = files.find(value => String(value.id) === (receipt?.fileId ?? operation.evidence.fileId));
            if (
              kind === 'upload_part' &&
              receipt?.resumeApproved &&
              file &&
              file.status === 'created' &&
              Number(file.size) === receipt.size &&
              (file.supplied_md5 ?? file.md5) === receipt.md5
            ) {
              const descriptor = await recovery(() =>
                raw.getLocation(`${apiNamespace(config)}/account/articles/${id}/files/${file.id}`)
              );
              const upload = await recovery(() => raw.getLocation(descriptor.upload_url));
              const part = upload.parts?.find(value => value.partNo === operation.evidence.part);
              if (!part || !['COMPLETE', 'COMPLETED', 'PENDING'].includes(String(part.status).toUpperCase()))
                throw new FigshareRepairRequired('Multipart outcome is not verifiable');
              await journal(operation, String(part.status).toUpperCase() === 'PENDING' ? 'not_applied' : 'confirmed', {
                partVerified: true,
                fileId: String(file.id),
              });
              continue;
            }
            if (kind === 'file_delete' && !files.some(value => String(value.id) === operation.evidence.fileId))
              await journal(operation, 'confirmed', { absent: true });
            else if (
              kind !== 'file_delete' &&
              receipt &&
              file &&
              ['available', 'completed'].includes(String(file.status).toLowerCase()) &&
              (receipt.kind === 'link'
                ? file.is_link_only === true && typeof receipt.link === 'string' && file.download_url === receipt.link
                : Number(file.size) === receipt.size &&
                  typeof file.computed_md5 === 'string' &&
                  file.computed_md5 === receipt.md5)
            ) {
              await checkpoint(value => {
                Object.assign(value.receipts.find(item => item.key === receipt.key)!, {
                  state: 'available',
                  fileId: String(file.id),
                  downloadUrl: file.download_url,
                });
              });
              await journal(operation, 'confirmed', {
                fileId: String(file.id),
                ...(receipt.kind === 'link' ? { linkVerified: true } : { checksumVerified: true }),
              });
            } else
              throw new FigshareRepairRequired(
                'Interrupted upload requires verified bind-file or resume-upload; foreign files remain unmanaged'
              );
          } else throw new FigshareRepairRequired('Uncertain Figshare operation requires read-only reconciliation');
        }
      }
      await save();
      return waiting('reconciled');
    }

    await bind();
    if (
      action === 'synchronise' &&
      !(state.syncedApproval === context.approval.id && state.syncedGeneration === context.sourceGeneration)
    ) {
      await context.assertAuthority();
      if (evidence.create?.error && context.sourceGeneration <= (evidence.createGeneration ?? context.sourceGeneration))
        throw new FigshareRepairRequired('Create failed after remote application; correct source before resuming');
      if (state.assetsBaselineApproval !== context.approval.id) {
        state = {
          ...state,
          assetsBaselineApproval: context.approval.id,
          assetsBaseline: evidence.checkpoints.assets ?? null,
        };
        await save();
      }
      if (!evidence.binding?.articleId) {
        if (evidence.create) {
          const article = await recovery(() => recoverCreate(raw, evidence.create!));
          if (!article) throw new FigshareRepairRequired('Uncertain create has no unique visible token match');
          await checkpoint(value => {
            value.binding = { ...value.create!.binding, articleId: String(article.id) };
            value.create!.verifiedId = String(article.id);
            value.articleId = String(article.id);
            value.namespace = value.binding.namespace;
          });
          if (
            evidence.create.error &&
            context.sourceGeneration <= (evidence.createGeneration ?? context.sourceGeneration)
          )
            throw new FigshareRepairRequired('Create failed after remote application; correct source before resuming');
        } else {
          // Historical record links are observation evidence, never automatic managing bindings.
          if (
            getRecordField(record, config.record.articleIdPath) ||
            getRecordField(record, config.record.syncStatePath)
          )
            throw new FigshareRepairRequired('Legacy identity requires verified migration before managing an article');
          const ownerId =
            config.impersonation?.operations.create === 'owner'
              ? await resolveCreationOwner(raw, config, record, accountId)
              : accountId;
          const binding = { namespace: apiNamespace(config), accountId, ownerId };
          const create = newCreateOperation(binding);
          await checkpoint(value => {
            value.binding = binding;
            value.create = create;
            value.createGeneration = context.sourceGeneration;
          });
          execution.binding = binding;
          try {
            const response = await workerClient(raw).createArticle({ title: provisionalTitle(create.token) });
            if (response.id == null) throw new FigshareRepairRequired('Create response has no article ID');
            const article = await recovery(() => raw.getArticle(String(response.id)));
            if (article.title !== provisionalTitle(create.token) || String(article.account_id) !== ownerId)
              throw new FigshareRepairRequired('Create token/owner could not be verified');
            await checkpoint(value => {
              value.binding!.articleId = String(article.id);
              value.create!.verifiedId = String(article.id);
              value.create!.outcome = 'confirmed';
              value.articleId = String(article.id);
              value.namespace = binding.namespace;
            });
            await bind();
            const operation = operations.find(
              value => value.kind === 'figshare:create' && unresolvedPublicationOperation(value)
            );
            if (operation)
              await journal(operation, 'confirmed', { articleId: String(article.id), tokenVerified: true });
          } catch (error) {
            if (error instanceof PublicationLeaseLost || error instanceof PublicationStopped) throw error;
            await checkpoint(value => {
              value.create!.outcome = error instanceof FigshareHttpError && error.statusCode ? 'failed' : 'uncertain';
              value.create!.error = 'Create outcome requires reconciliation';
            });
            throw error;
          }
        }
        await bind();
      }
      const id = evidence.binding!.articleId!;
      let article = await readBoundArticle(id);
      if (evidence.publish && evidence.publish.outcome !== 'observed') {
        // Legacy and shared source generations are separate counters. An exact
        // migrated rejection is settled even when its old generation is larger.
        const historicalRejection = operations.some(
          operation =>
            operation.kind === 'figshare:publish' &&
            operation.approvalId === '' &&
            operation.approvalEpoch === 0 &&
            operation.sourceGeneration === evidence.publish!.generation &&
            operation.outcome === 'rejected' &&
            operation.evidence.historical === true &&
            operation.evidence.hash === evidence.publish!.hash
        );
        if (observedPublished(article) && Number(article.version ?? 0) > evidence.publish.previousVersion)
          await checkpoint(value => {
            value.publish!.outcome = 'observed';
          });
        else if (isCurationLocked(config, article)) return waiting('curation');
        // A private read cannot prove that an accepted or uncertain asynchronous
        // publication has stopped. Only a verified rejection permits a fresh
        // generation without explicit administrative settlement.
        else if (
          evidence.publish.outcome === 'rejected' &&
          (context.sourceGeneration > evidence.publish.generation || historicalRejection)
        )
          await checkpoint(value => {
            delete value.publish;
          });
        else if (['submitted', 'uncertain'].includes(evidence.publish.outcome))
          throw new FigshareRepairRequired('Publication outcome is uncertain');
        else return waiting('publication_confirmation');
      }
      if (isCurationLocked(config, article)) return waiting('curation');
      const pendingFiles = (await listArticleFiles(raw, id)).filter(
        file => String(file.status).toLowerCase() === 'created'
      );
      if (
        pendingFiles.length &&
        !pendingFiles.every(file =>
          evidence.receipts.some(receipt => receipt.fileId === String(file.id) && receipt.resumeApproved)
        )
      ) {
        if (
          evidence.receipts.some(
            receipt => ['initialising', 'uploading'].includes(receipt.state) && !receipt.resumeApproved
          )
        )
          throw new FigshareRepairRequired('Interrupted upload requires bind-file or resume-upload');
        return waiting('uploads');
      }
      const client = workerClient(raw);
      if (pendingFiles.length) await mirrorManagedAssets(client, config, record, id, evidence, checkpoint);
      setRecordField(record, config.record.articleIdPath, id);
      await service.syncMetadata(record, {
        action: 'update',
        articleId: id,
        sameJob: true,
        syncState: { status: 'syncing', correlationId: context.approval.id },
      });
      await mirrorManagedAssets(client, config, record, id, evidence, checkpoint);
      await syncEmbargoPhase(client, config, record, id);
      await checkpoint(value => {
        value.checkpoints.embargo = digest(config.embargo.mode === 'none' ? null : record.metadata);
      });
      await context.assertAuthority();
      article = await readBoundArticle(id);
      const publishHash = digest(evidence.checkpoints);
      const needsPublish =
        !observedPublished(article) ||
        (metadataChanged && config.article.republishOnMetadataChange) ||
        (state.assetsBaseline !== evidence.checkpoints.assets && config.article.republishOnAssetChange);
      if (needsPublish && evidence.publish?.hash !== publishHash && config.article.publishMode !== 'manual') {
        await checkpoint(value => {
          value.publish = {
            generation: context.sourceGeneration,
            hash: publishHash,
            previousVersion: Number(article.version ?? 0),
            outcome: 'submitted',
            submittedAt: new Date().toISOString(),
          };
        });
        try {
          await client.publishArticle(id);
          await checkpoint(value => {
            value.publish!.outcome = 'accepted';
          });
        } catch (error) {
          if (error instanceof PublicationLeaseLost || error instanceof PublicationStopped) throw error;
          const body = error instanceof FigshareHttpError ? error.responseBody : undefined;
          const rejected =
            error instanceof FigshareHttpError &&
            error.statusCode === 400 &&
            isPublicationObject(body) &&
            body.code === 'BadRequest' &&
            typeof body.message === 'string' &&
            body.message.startsWith('Missing mandatory value:');
          await checkpoint(value => {
            value.publish!.outcome = rejected ? 'rejected' : 'uncertain';
          });
          if (rejected) {
            const operation = operations.findLast(value => value.kind === 'figshare:publish');
            if (operation) await journal(operation, 'rejected', { validationRejected: true });
          }
          throw error;
        }
      }
      state = { ...state, syncedApproval: context.approval.id, syncedGeneration: context.sourceGeneration };
      await save();
    }
    if (!evidence.binding?.articleId) throw new FigshareRepairRequired('No verified Figshare article binding');
    const article = await readBoundArticle(evidence.binding.articleId);
    await checkpoint(value => {
      value.publication = observedPublished(article) ? 'published' : value.publish ? 'pending' : 'private';
      value.embargoed = article.is_embargoed === true;
      value.observedAt = new Date().toISOString();
    });
    const projected = writeBackPhase(
      config,
      figshareSourceRecord(context.source.metadata, context.oid, context.brandId),
      article,
      observedPublished(article) ? { id: article.id } : undefined
    );
    if (config.record.allFilesUploadedPath)
      setRecordField(
        projected,
        config.record.allFilesUploadedPath,
        evidence.receipts.every(receipt => !receipt.desired || receipt.state === 'available') ? 'yes' : 'no'
      );
    await context.project(
      figshareJson(
        Object.fromEntries(
          figsharePublicationOutputPaths(context.configuration).map(path => [path, get(projected, path) ?? null])
        )
      )
    );
    if (!observedPublished(article))
      return waiting(
        config.article.publishMode === 'manual'
          ? 'manual_publication'
          : isCurationLocked(config, article)
            ? 'curation'
            : 'review'
      );
    if (evidence.publish && evidence.publish.outcome !== 'observed') {
      if (Number(article.version ?? 0) <= evidence.publish.previousVersion) return waiting('publication_confirmation');
      await checkpoint(value => {
        value.publish!.outcome = 'observed';
      });
    }
    if (state.syncedApproval !== context.approval.id || state.syncedGeneration !== context.sourceGeneration)
      return waiting('content_sync_required');
    if (evidence.receipts.some(receipt => !['available', 'removed'].includes(receipt.state))) return waiting('uploads');
    if (
      config.assets.enableHostedFiles &&
      (!isPublicationObject(state.cleanupProjection) ||
        state.cleanupProjection.approvalId !== context.approval.id ||
        state.cleanupProjection.generation !== context.sourceGeneration)
    ) {
      // Staging is read-only. The host applies this separately after checkpointing current completion.
      // Embargo/public access waits do not cause another remote synchronisation or publication.
      try {
        const dataLocations = evidence.receipts.some(receipt => receipt.kind === 'hosted' && receipt.desired)
          ? await cleanupProjection(raw, config, record, article, evidence, id => {
              const attachment = context.source.attachments.find(item => item.id === id);
              if (!attachment) throw new FigshareRepairRequired('Cleanup attachment is outside the sealed source');
              return context.openAttachment(id, attachment.logicalPath);
            })
          : (getRecordField(record, config.record.dataLocationsPath) ?? []);
        state = {
          ...state,
          cleanupProjection: figshareJson({
            dataLocations,
            approvalId: context.approval.id,
            generation: context.sourceGeneration,
          }),
        };
        await save();
      } catch (error) {
        if (!(error instanceof FigshareWaiting)) throw error;
        // Completion and public download accessibility are independent. Local settlement schedules observation.
      }
    }
    const remote = { namespace: evidence.binding.namespace, objectId: evidence.binding.articleId };
    return {
      kind: 'completed',
      state,
      evidence: {
        approvalId: context.approval.id,
        approvalEpoch: context.approval.epoch,
        sourceGeneration: context.sourceGeneration,
        sourceDigest: publicationDigest({
          ...context.source,
          attachments: context.source.attachments.map(({ staged: _staged, ...attachment }) => attachment),
        }),
        confirmedAt: new Date().toISOString(),
        operations: operations.filter(op => op.outcome === 'confirmed').map(proof),
        remote,
        deposit: figshareJson({
          articleId: article.id,
          version: article.version,
          publishedDate: article.published_date,
          publication: 'published',
        }),
        ingestion: { state: 'not_required', evidence: {} },
        visibility: 'verified',
        accessible: article.is_embargoed !== true,
        embargoed: article.is_embargoed === true,
      },
      links: {
        article: String(
          article.url_public_html ??
            article.url_private_html ??
            `${config.connection.frontEndUrl}/articles/${article.id}`
        ),
      },
    };
  };
  try {
    return await figsharePublicationContext.run(
      {
        oid: context.oid,
        brandId: context.brandId,
        configuration: config,
        preflight: false,
        payload:
          state.payloadApproval === context.approval.id && isPublicationObject(state.payload)
            ? state.payload
            : undefined,
      },
      () =>
        figshareCrosswalkResolver.run(
          request => resolveSealedFigshareCrosswalk(context.prepared, request),
          () => figshareExecution.run(execution, run)
        )
    );
  } catch (error) {
    if (error instanceof PublicationStopped || error instanceof PublicationLeaseLost || context.signal.aborted)
      throw error;
    if (error instanceof FigshareWaiting) return waiting(error.reason);
    if (error instanceof FigshareRepairRequired || error instanceof PublicationBindingConflict)
      return { kind: 'repair_required', state, reason: error.message, evidence: {} };
    return {
      kind: 'retryable_failure',
      state,
      category: error instanceof FigshareHttpError ? `http:${error.statusCode ?? 'transport'}` : 'figshare_operation',
      message: 'Figshare processing failed; inspect destination evidence',
    };
  }
}
