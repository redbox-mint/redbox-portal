import { publicationDigest } from '../publication/canonical';
import { cloneDeep } from 'lodash';
import { publicationOperationEvidence, publicationOperationRequiresRecovery } from '../publication/operations';
import type { PublicationRepair, PublicationRepairContext, PublicationRepairResult } from '../publication/contracts';
import { decodeFigshareLegacy, emptyFigshareEvidence, figshareJson } from './publication-state';
import { figshareDestinationConfiguration } from './publication-config';
import { figsharePublicationContext } from './publication-context';
import { figshareExecution, workerClient } from './execution';
import { apiNamespace, observedPublished, recoverCreate } from './identity';
import { isCurationLocked, listArticleFiles } from './runtime';
import type { PublicationFigshareService } from './publication-source';
import { figshareSourceRecord } from './publication-source';
import { isPublicationObject } from '../publication/builtins';
import { unresolvedPublicationOperation } from '../publication/execution';
import { recordOperation } from '../publication/store';

function settled(context: PublicationRepairContext): string {
  const reference = context.parameters.evidenceReference;
  if (context.parameters.priorOperationSettled !== true || typeof reference !== 'string' || !reference.trim())
    throw new Error(
      'Positive prior-operation settlement evidence and its reference are required; expiry or absence alone is insufficient'
    );
  return reference;
}
export function figsharePublicationRepairs(service: () => PublicationFigshareService): PublicationRepair[] {
  const descriptions: Record<string, string> = {
    'reconcile-evidence': 'Persist adapter-verified historical outcomes without remote mutation or completion.',
    link: 'Verify an article/account/owner before adopting its binding; never infer publication authority.',
    relink: 'Verify a replacement binding after resolving all prior operations and managed receipts.',
    'abandon-create': 'Verify exact-token absence and settled prior request; retain the retired create and journal.',
    'reset-publish': 'Verify non-publication, no curation lock and settled prior request; retain publication evidence.',
    'bind-file': 'Verify an existing receipt, remote size and checksum before binding a completed file.',
    'resume-upload': 'Verify an existing receipt and settled former uploader before permitting multipart resumption.',
    'settle-unapplied-update':
      'Record an exact externally verified non-application receipt for a settled metadata or embargo request.',
    'settle-file-operation':
      'Verify exact file non-application and settled prior request; retain its operation and receipt.',
  };
  return Object.entries(descriptions).map(([id, description]) => ({
    id,
    description,
    run: context => repairFigshare(id, context, service()),
  }));
}
async function repairFigshare(
  action: string,
  context: PublicationRepairContext,
  service: PublicationFigshareService
): Promise<PublicationRepairResult> {
  if (action === 'reconcile-evidence' && context.source) {
    const result = await context.reconcile();
    if (isPublicationObject(result.state.legacy)) {
      const evidence = decodeFigshareLegacy(result.state.legacy);
      if (evidence.binding?.articleId)
        result.binding = {
          namespace: evidence.binding.namespace,
          objectId: evidence.binding.articleId,
          targetFingerprint: context.targetFingerprint,
          evidence: { accountId: evidence.binding.accountId, ownerId: evidence.binding.ownerId, reconciled: true },
        };
    }
    return result;
  }
  const config = figshareDestinationConfiguration(context.configuration);
  const saved = await RecordsService.getMeta(context.oid);
  const record = figshareSourceRecord(figshareJson(saved), context.oid, context.brandId);
  let state = cloneDeep(context.state);
  const evidence = state.legacy
    ? decodeFigshareLegacy(state.legacy)
    : emptyFigshareEvidence(context.oid, context.brandId);
  if (evidence.oid !== context.oid || evidence.brandId !== context.brandId)
    throw new Error('Figshare evidence belongs to another record');
  const deny = async (): Promise<never> => {
    throw new Error('Administrative verification is read-only');
  };
  return figsharePublicationContext.run(
    { oid: context.oid, brandId: context.brandId, configuration: config, preflight: false },
    () =>
      figshareExecution.run(
        {
          binding: evidence.binding ?? evidence.create?.binding,
          recovery: true,
          signal: new AbortController().signal,
          guard: deny,
          metadata: deny,
          mutate: deny,
        },
        async () => {
          const client = workerClient(service.makeClient(config, record, undefined, 'publication-admin'));
          if (!client.getAccount) throw new Error('Figshare account verification is unavailable');
          const account = String((await client.getAccount()).id);
          if (
            !isPublicationObject(context.configuration.connection) ||
            context.configuration.connection.accountId !== account
          )
            throw new Error('Configured Figshare account identity does not match the verified token account');
          if (
            evidence.binding &&
            (evidence.binding.namespace !== apiNamespace(config) || evidence.binding.accountId !== account)
          )
            throw new Error('Configured Figshare account or namespace changed');
          // Link-only migration can reserve the shared article without provider owner evidence.
          // Explicit verification may fill that gap, but cannot replace the retained object.
          if (
            context.binding &&
            (evidence.binding
              ? context.binding.objectId !== evidence.binding.articleId ||
                context.binding.namespace !== evidence.binding.namespace
              : !['link', 'relink'].includes(action) ||
                context.binding.namespace !== apiNamespace(config) ||
                context.binding.objectId !== context.parameters.articleId)
          )
            throw new Error('Shared and provider binding evidence disagree');
          const verifyBoundArticle = async () => {
            const binding = evidence.binding;
            if (!binding?.articleId) throw new Error('A verified Figshare binding is required');
            const article = await client.getArticle(binding.articleId);
            if (String(article.id) !== binding.articleId || String(article.account_id) !== binding.ownerId)
              throw new Error('Article identity or owner differs from retained Figshare evidence');
            return article;
          };
          const operations = cloneDeep([...context.operations]);
          const checkpointedOperationIds = new Set<string>();
          const journal = (operation: import('../publication/contracts').PublicationOperation) => {
            operation = {
              ...operation,
              confirmation: publicationOperationEvidence(
                { ...context, providerId: 'figshare' },
                operation,
                operation.identity?.remote ??
                  operation.confirmation?.remote ??
                  context.binding ??
                  (evidence.binding?.articleId
                    ? { namespace: evidence.binding.namespace, objectId: evidence.binding.articleId }
                    : undefined)
              ),
            };
            recordOperation(operations, operation);
            if (operation.outcome === 'confirmed') checkpointedOperationIds.add(operation.id);
          };
          let binding = cloneDeep(context.binding);
          if (action === 'reconcile-evidence') {
            // Migration retains remote uncertainty without inventing a sealed approval.
            // Only identity/publication facts can be verified without approved content.
            if (
              evidence.create &&
              (!evidence.create.verifiedId ||
                operations.some(
                  op =>
                    op.kind === 'figshare:create' &&
                    op.evidence.token === evidence.create!.token &&
                    publicationOperationRequiresRecovery(op)
                ))
            ) {
              if (
                evidence.create.binding.namespace !== apiNamespace(config) ||
                evidence.create.binding.accountId !== account
              )
                throw new Error('Historical create target differs from the configured account or namespace');
              const article = evidence.create.verifiedId
                ? await client.getArticle(evidence.create.verifiedId)
                : await recoverCreate(client, evidence.create);
              if (!article || !article.account_id || String(article.account_id) !== evidence.create.binding.ownerId)
                throw new Error('Historical create requires one exact token and verified owner; evidence retained');
              if (evidence.create.verifiedId && String(article.id) !== evidence.create.verifiedId)
                throw new Error('Historical article or owner identity does not match');
              if (context.binding && context.binding.objectId !== String(article.id))
                throw new Error('Historical create and shared binding disagree');
              const matching = operations.filter(
                op => op.kind === 'figshare:create' && op.evidence.token === evidence.create!.token
              );
              if (matching.length > 1 || (!matching.length && evidence.create.outcome !== 'submitted'))
                throw new Error('Historical create journal is missing or ambiguous');
              for (const op of matching) {
                journal({
                  ...op,
                  outcome: 'confirmed',
                  evidence: { ...op.evidence, articleId: String(article.id), tokenVerified: true },
                });
              }
              evidence.binding = { ...evidence.create.binding, articleId: String(article.id) };
              evidence.create.verifiedId = String(article.id);
              if (evidence.create.outcome !== 'failed') evidence.create.outcome = 'confirmed';
              evidence.articleId = String(article.id);
              evidence.namespace = evidence.binding.namespace;
            }
            if (evidence.binding?.articleId) {
              const article = await client.getArticle(evidence.binding.articleId);
              if (
                String(article.id) !== evidence.binding.articleId ||
                String(article.account_id) !== evidence.binding.ownerId
              )
                throw new Error('Historical article or owner identity does not match');
              if (
                evidence.publish &&
                (evidence.publish.outcome !== 'observed' ||
                  operations.some(
                    op =>
                      op.kind === 'figshare:publish' &&
                      op.sourceGeneration === evidence.publish!.generation &&
                      publicationOperationRequiresRecovery(op)
                  ))
              ) {
                if (!observedPublished(article) || Number(article.version) <= evidence.publish.previousVersion)
                  throw new Error('Historical publication remains uncertain; reconcile or settle before reset');
                const matching = operations.filter(
                  op => op.kind === 'figshare:publish' && op.sourceGeneration === evidence.publish!.generation
                );
                if (matching.length !== 1) throw new Error('Historical publication journal is missing or ambiguous');
                for (const op of matching) {
                  journal({
                    ...op,
                    outcome: 'confirmed',
                    evidence: {
                      ...op.evidence,
                      articleId: evidence.binding.articleId,
                      version: Number(article.version),
                      published: true,
                    },
                  });
                }
                evidence.publish.outcome = 'observed';
              }
              binding = {
                namespace: evidence.binding.namespace,
                objectId: evidence.binding.articleId,
                targetFingerprint: context.targetFingerprint,
                evidence: { accountId: account, ownerId: evidence.binding.ownerId, reconciled: true },
              };
            }
            if (operations.some(op => publicationOperationRequiresRecovery(op) && !checkpointedOperationIds.has(op.id)))
              throw new Error(
                'Historical operation requires approved content or a supported provider repair; evidence retained'
              );
          } else if (action === 'link' || action === 'relink') {
            const articleId = context.parameters.articleId;
            const ownerId = context.parameters.ownerId ?? evidence.binding?.ownerId;
            if (
              typeof articleId !== 'string' ||
              !/^\d+$/.test(articleId) ||
              (ownerId !== undefined && (typeof ownerId !== 'string' || !/^\d+$/.test(ownerId)))
            )
              throw new Error('Explicit numeric article and owner identities are required');
            const changed = evidence.binding?.articleId && evidence.binding.articleId !== articleId;
            if (changed && action !== 'relink') throw new Error('Use relink to replace an existing binding');
            if ((changed || !evidence.binding) && operations.some(publicationOperationRequiresRecovery))
              throw new Error(
                operations.some(unresolvedPublicationOperation)
                  ? 'Reconcile uncertain operations before linking'
                  : 'Reconcile pending operations before linking'
              );
            if (
              changed &&
              (evidence.receipts.some(receipt => receipt.state !== 'removed') ||
                (evidence.publish && evidence.publish.outcome !== 'observed') ||
                evidence.create?.outcome === 'uncertain')
            )
              throw new Error('Resolve previous operations and managed receipts before relinking');
            if (config.impersonation?.enabled && config.impersonation.operations.read === 'owner' && !ownerId)
              throw new Error('Owner-based verification requires an explicit owner ID');
            const identity = {
              namespace: apiNamespace(config),
              accountId: account,
              ownerId: String(ownerId ?? account),
              articleId,
            };
            const article = await figshareExecution.run({ ...figshareExecution.getStore()!, binding: identity }, () =>
              client.getArticle(articleId)
            );
            if (
              String(article.id) !== articleId ||
              !article.account_id ||
              (ownerId && String(article.account_id) !== ownerId)
            )
              throw new Error('Remote article or owner identity does not match');
            const retainedOwner = evidence.binding?.ownerId ?? context.binding?.evidence.ownerId;
            if (
              (evidence.binding?.articleId === articleId || context.binding?.objectId === articleId) &&
              retainedOwner !== undefined &&
              String(retainedOwner) !== String(article.account_id)
            )
              throw new Error('Linking cannot transfer article ownership');
            const settledPriorCreate =
              changed &&
              evidence.create?.outcome === 'confirmed' &&
              evidence.create.verifiedId === evidence.binding?.articleId &&
              evidence.create.binding.namespace === evidence.binding?.namespace &&
              evidence.create.binding.accountId === evidence.binding?.accountId &&
              evidence.create.binding.ownerId === evidence.binding?.ownerId;
            if (
              evidence.create &&
              evidence.create.outcome !== 'failed' &&
              evidence.create.verifiedId !== articleId &&
              !settledPriorCreate
            )
              throw new Error('Resolve the previous create identity before linking');
            if (changed) {
              state = {
                retiredBindings: [
                  ...(Array.isArray(state.retiredBindings) ? state.retiredBindings : []),
                  figshareJson({ ...state, retiredBindings: undefined }),
                ],
              };
              evidence.checkpoints = {};
              delete evidence.publish;
              delete evidence.create;
            }
            evidence.binding = { ...identity, ownerId: String(article.account_id) };
            evidence.namespace = identity.namespace;
            evidence.articleId = articleId;
            binding = {
              namespace: identity.namespace,
              objectId: articleId,
              targetFingerprint: context.targetFingerprint,
              evidence: {
                accountId: account,
                ownerId: String(article.account_id),
                verifiedAt: new Date().toISOString(),
              },
            };
          } else if (action === 'abandon-create') {
            const reference = settled(context);
            if (!evidence.create || evidence.binding?.articleId) throw new Error('No unbound uncertain create exists');
            if (await recoverCreate(client, evidence.create))
              throw new Error('An exact create token match exists; reconcile it instead');
            const matching = operations.filter(
              op =>
                op.kind === 'figshare:create' &&
                op.evidence.token === evidence.create!.token &&
                !op.evidence.administratorSettlementReference
            );
            // Provider intent precedes the host journal. A submitted intent may
            // therefore have no journal; uncertain transport still requires one.
            // Confirmed creation must be reconciled to its identity, never abandoned.
            if (
              matching.length > 1 ||
              (!matching.length && evidence.create.outcome !== 'submitted') ||
              matching.some(op => op.outcome === 'confirmed')
            )
              throw new Error('Create journal and token evidence disagree');
            for (const op of matching) {
              if (unresolvedPublicationOperation(op)) op.outcome = 'not_applied';
              op.evidence = { ...op.evidence, administratorSettlementReference: reference, exactTokenAbsent: true };
            }
            state.retiredCreates = [
              ...(Array.isArray(state.retiredCreates) ? state.retiredCreates : []),
              figshareJson(evidence.create),
            ];
            delete evidence.create;
            delete evidence.createGeneration;
            delete evidence.createRequest;
          } else if (action === 'reset-publish') {
            const reference = settled(context);
            if (!evidence.publish || evidence.publish.outcome === 'observed' || !evidence.binding?.articleId)
              throw new Error('No unconfirmed publication request exists');
            const article = await verifyBoundArticle();
            if (
              article.is_public !== false ||
              Number(article.version) !== evidence.publish.previousVersion ||
              observedPublished(article) ||
              isCurationLocked(config, article)
            )
              throw new Error('Article is published or under curation; reconcile or wait');
            const matching = operations.filter(
              op =>
                op.kind === 'figshare:publish' &&
                op.sourceGeneration === evidence.publish!.generation &&
                !op.evidence.administratorSettlementReference
            );
            // A stopped worker can have checkpointed its provider intent before the
            // host journal was written. Only that submitted state permits absence;
            // accepted/uncertain transport evidence must still have its exact journal.
            if (matching.length > 1 || (!matching.length && evidence.publish.outcome !== 'submitted'))
              throw new Error('Publication journal evidence is missing or ambiguous');
            for (const op of matching) {
              // Acknowledgement is still a confirmed transport fact. Settlement proves
              // that it is safe to retire the pending provider request, not to erase that fact.
              if (unresolvedPublicationOperation(op)) op.outcome = 'not_applied';
              op.evidence = { ...op.evidence, administratorSettlementReference: reference, verifiedPrivate: true };
              if (op.outcome === 'confirmed') checkpointedOperationIds.add(op.id);
            }
            state.retiredPublications = [
              ...(Array.isArray(state.retiredPublications) ? state.retiredPublications : []),
              figshareJson(evidence.publish),
            ];
            delete evidence.publish;
            // The same approval may resume after settlement. Its metadata/assets
            // checkpoints remain valid, but synchronisation must reach publish again.
            delete state.syncedApproval;
            delete state.syncedGeneration;
          } else if (action === 'settle-unapplied-update') {
            const reference = settled(context);
            const operation = operations.find(op => op.id === context.parameters.operationId);
            if (
              !operation ||
              !['figshare:metadata', 'figshare:embargo', 'figshare:embargo_clear'].includes(operation.kind) ||
              context.parameters.nonApplicationVerified !== true ||
              context.parameters.intendedDigest !== operation.intendedDigest ||
              !evidence.binding?.articleId ||
              operation.evidence.articleId !== evidence.binding.articleId
            )
              throw new Error(
                'Exact request identity/digest and externally verified non-application evidence are required'
              );
            // Settlement alone does not show that a mutable update never applied: another
            // actor may have replaced it. Require an explicit external non-application
            // receipt, scoped to this exact request, rather than inferring from a mismatch.
            const replay =
              operation.outcome === 'not_applied' &&
              operation.evidence.administratorSettlementReference === reference &&
              operation.evidence.externalNonApplicationVerified === true;
            if (!replay && !unresolvedPublicationOperation(operation))
              throw new Error('A confirmed operation cannot be reclassified by external non-application repair');
            const article = await client.getArticle(evidence.binding.articleId);
            if (
              String(article.id) !== evidence.binding.articleId ||
              String(article.account_id) !== evidence.binding.ownerId
            )
              throw new Error('Update settlement article or owner differs from retained evidence');
            if (!replay)
              journal({
                ...operation,
                outcome: 'not_applied',
                evidence: {
                  ...operation.evidence,
                  administratorSettlementReference: reference,
                  externalNonApplicationVerified: true,
                },
              });
          } else if (action === 'settle-file-operation') {
            const reference = settled(context);
            const operation = operations.find(op => op.id === context.parameters.operationId);
            const receipt = evidence.receipts.find(value => value.key === context.parameters.receipt);
            const beforeJournal = context.parameters.operationId === undefined;
            const retired = Array.isArray(state.retiredFileInitializations) ? state.retiredFileInitializations : [];
            if (
              !evidence.binding?.articleId ||
              (!beforeJournal &&
                (!operation ||
                  !['figshare:file_init', 'figshare:file_complete', 'figshare:file_delete'].includes(operation.kind) ||
                  operation.evidence.articleId !== evidence.binding.articleId))
            )
              throw new Error('An exact retained file operation and matching article are required');
            const article = await client.getArticle(evidence.binding.articleId);
            if (
              String(article.id) !== evidence.binding.articleId ||
              String(article.account_id) !== evidence.binding.ownerId
            )
              throw new Error('File settlement article or owner differs from retained evidence');
            const replay = beforeJournal
              ? retired.some(
                  value =>
                    isPublicationObject(value) &&
                    value.operationId === undefined &&
                    value.evidenceReference === reference &&
                    isPublicationObject(value.receipt) &&
                    value.receipt.key === context.parameters.receipt
                )
              : operation?.outcome === 'not_applied' &&
                operation.evidence.administratorSettlementReference === reference &&
                operation.evidence.settledReceiptKey === context.parameters.receipt;
            if (!replay) {
              const initialization = !operation || operation.kind === 'figshare:file_init';
              if (
                !receipt ||
                receipt.articleId !== evidence.binding.articleId ||
                (operation && !unresolvedPublicationOperation(operation)) ||
                (beforeJournal &&
                  operations.some(
                    op =>
                      op.kind === 'figshare:file_init' &&
                      op.evidence.receiptKey === receipt.key &&
                      publicationOperationRequiresRecovery(op)
                  )) ||
                (initialization
                  ? (operation &&
                      (operation.evidence.receiptKey !== receipt.key || operation.evidence.fileId !== undefined)) ||
                    receipt.fileId !== undefined ||
                    receipt.state !== 'initialising'
                  : !operation || operation.evidence.fileId !== receipt.fileId || !receipt.fileId)
              )
                throw new Error('Only an exact unresolved file operation with consistent owned receipt can be settled');
              const files = await listArticleFiles(client, evidence.binding.articleId);
              if (initialization) {
                // Absence is useful only after positively settling the former request. Any
                // plausible match is ambiguous and must instead use verified bind/resume.
                if (
                  files.some(file =>
                    receipt.kind === 'link'
                      ? file.download_url === receipt.link
                      : file.name === receipt.name ||
                        (Number(file.size) === receipt.size &&
                          [file.supplied_md5, file.computed_md5, file.md5].includes(receipt.md5))
                  )
                )
                  throw new Error('A possible initialized file exists; verify it with bind-file or resume-upload');
                state.retiredFileInitializations = [
                  ...retired,
                  figshareJson({ receipt, operationId: operation?.id, evidenceReference: reference }),
                ];
                evidence.receipts = evidence.receipts.filter(value => value.key !== receipt.key);
              } else {
                if (!operation) throw new Error('An exact retained file operation is required');
                const file = files.find(value => String(value.id) === receipt.fileId);
                const available = file && ['available', 'completed'].includes(String(file.status).toLowerCase());
                if (
                  !file ||
                  (operation.kind === 'figshare:file_complete' ? file.status !== 'created' : !available) ||
                  (receipt.kind === 'link'
                    ? file.is_link_only !== true || file.download_url !== receipt.link
                    : Number(file.size) !== receipt.size ||
                      !receipt.md5 ||
                      (available ? file.computed_md5 : file.supplied_md5) !== receipt.md5)
                )
                  throw new Error('Authoritative file state does not prove non-application of this operation');
                receipt.state = operation.kind === 'figshare:file_complete' ? 'uploading' : 'available';
                receipt.resumeApproved = operation.kind === 'figshare:file_complete';
              }
              if (operation)
                journal({
                  ...operation,
                  outcome: 'not_applied',
                  evidence: {
                    ...operation.evidence,
                    administratorSettlementReference: reference,
                    settledReceiptKey: receipt.key,
                    nonApplicationVerified: true,
                  },
                });
            }
          } else {
            const receipt = evidence.receipts.find(receipt => receipt.key === context.parameters.receipt);
            const fileId = context.parameters.fileId;
            if (
              !receipt ||
              !evidence.binding?.articleId ||
              receipt.articleId !== evidence.binding.articleId ||
              typeof fileId !== 'string' ||
              !/^\d+$/.test(fileId)
            )
              throw new Error('An existing owned receipt, authoritative article and explicit file ID are required');
            await verifyBoundArticle();
            const descriptor = await client.getLocation(
              `${apiNamespace(config)}/account/articles/${evidence.binding.articleId}/files/${fileId}`
            );
            const available = ['available', 'completed'].includes(String(descriptor.status).toLowerCase());
            if (
              String(descriptor.id) !== fileId ||
              (receipt.kind === 'link'
                ? !available ||
                  descriptor.is_link_only !== true ||
                  typeof receipt.link !== 'string' ||
                  descriptor.download_url !== receipt.link
                : Number(descriptor.size) !== receipt.size ||
                  !receipt.md5 ||
                  String(available ? descriptor.computed_md5 : descriptor.supplied_md5).toLowerCase() !==
                    receipt.md5.toLowerCase())
            )
              throw new Error('Remote file size/checksum/identity does not match the existing receipt');
            if (!available && action === 'bind-file') throw new Error('bind-file requires a completed remote file');
            const settlementReference = action === 'resume-upload' ? settled(context) : undefined;
            if (receipt.fileId && receipt.fileId !== fileId)
              throw new Error('Receipt already owns another remote file; reconcile it first');
            const initializations = operations.filter(
              op =>
                op.kind === 'figshare:file_init' &&
                op.evidence.receiptKey === receipt.key &&
                op.evidence.articleId === receipt.articleId &&
                publicationOperationRequiresRecovery(op)
            );
            if (initializations.some(op => op.evidence.fileId !== undefined && op.evidence.fileId !== fileId))
              throw new Error('Selected file conflicts with the retained initialization journal');
            receipt.fileId = fileId;
            receipt.state = available ? 'available' : 'uploading';
            receipt.resumeApproved = !available;
            // Initialisation can be confirmed before its file ID reaches the receipt.
            // Incorporate that exact verified identity now; an unfinished upload cannot
            // satisfy the worker's completed-file reconciliation gate on its own.
            for (const op of initializations) {
              if (!available && !settlementReference)
                throw new Error('An incomplete initialization requires stopped-uploader settlement');
              journal({
                ...op,
                outcome: 'confirmed',
                evidence: {
                  ...op.evidence,
                  fileId,
                  ...(receipt.kind === 'link' ? { linkVerified: true } : { checksumVerified: true }),
                  ...(settlementReference ? { administratorSettlementReference: settlementReference } : {}),
                },
              });
            }
          }
          for (const operation of operations) {
            if (
              ['confirmed', 'not_applied', 'rejected'].includes(operation.outcome) &&
              !operation.confirmation &&
              (checkpointedOperationIds.has(operation.id) ||
                publicationDigest(operation) !==
                  publicationDigest(context.operations.find(op => op.id === operation.id)))
            )
              operation.confirmation = publicationOperationEvidence(
                { ...context, providerId: 'figshare' },
                operation,
                operation.identity?.remote ??
                  context.binding ??
                  (evidence.binding?.articleId
                    ? { namespace: evidence.binding.namespace, objectId: evidence.binding.articleId }
                    : undefined)
              );
          }
          state.legacy = figshareJson(evidence);
          return {
            state,
            ...(binding ? { binding } : {}),
            operations,
            checkpointedOperationIds: [...checkpointedOperationIds],
          };
        }
      )
  );
}
