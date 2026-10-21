import { AsyncLocalStorage } from 'node:async_hooks';
import type { FigshareBinding } from '../../model/storage/FigshareSyncModel';
import type { FigshareOperation } from '../../configmodels/FigsharePublishing';
import type { FigshareArticle, FigshareArticlePayload } from './types';
import type { FigshareClient } from './http';
import { figsharePublicationContext } from './publication-context';

/** Direct compatibility phases and clients must obey cutover even when legacy processing is off. */
export async function assertFigshareMutationAuthority(brandId: string, oid: string): Promise<void> {
  const publication = figsharePublicationContext.getStore();
  if (publication) {
    if (publication.preflight || !figshareExecution.getStore())
      throw new Error('Figshare mutations require shared worker authority');
    return;
  }
  if (
    typeof PublicationService !== 'undefined' &&
    typeof PublicationService.assertLegacyPublicationAllowed === 'function'
  )
    await PublicationService.assertLegacyPublicationAllowed(brandId, oid);
}

export interface FigshareExecution {
  binding?: FigshareBinding;
  recovery?: boolean;
  signal: AbortSignal;
  guard: (operation: FigshareOperation) => Promise<void>;
  metadata: (
    id: string,
    payload: FigshareArticlePayload,
    send: (payload: FigshareArticlePayload) => Promise<FigshareArticle>
  ) => Promise<FigshareArticle>;
  mutate?<Result>(kind: string, input: Record<string, unknown>, send: () => Promise<Result>): Promise<Result>;
  attachment?(oid: string, id: string): Promise<{ readstream: import('node:stream').Readable; size: number }>;
  attachmentFingerprint?(oid: string, id: string): Promise<string>;
}
/** Live transport checks immediately before HTTP; fixture/custom clients use the boundary guard. */
export const transportGuardedMethods = new WeakSet<(...args: never[]) => unknown>();
export const figshareExecution = new AsyncLocalStorage<FigshareExecution>();
const wrappedClients = new WeakMap<FigshareClient, FigshareExecution>();
const wrappedMethods = new WeakMap<(...args: never[]) => unknown, FigshareExecution>();
/** Wrap at the client boundary, after customer payload customisation. */
export function workerClient(client: FigshareClient): FigshareClient {
  const execution = figshareExecution.getStore();
  if (!execution) return client;
  if (wrappedClients.get(client) === execution) return client;
  const guard = async (operation: FigshareOperation, send: (...args: never[]) => unknown) => {
    if (!transportGuardedMethods.has(send)) await execution.guard(operation);
  };
  const mutate = async <Result>(
    kind: string,
    input: Record<string, unknown>,
    send: () => Promise<Result>
  ): Promise<Result> => {
    return execution.mutate ? execution.mutate(kind, input, send) : send();
  };
  // Hook clients commonly spread super.makeClient() to override reads. Retain guards on those methods
  // without nesting journals around an already wrapped mutation.
  const wrap = <Method extends (...args: never[]) => unknown>(original: Method, replacement: Method): Method => {
    if (wrappedMethods.get(original) === execution) return original;
    wrappedMethods.set(replacement, execution);
    return replacement;
  };
  const wrapped: FigshareClient = {
    ...client,
    createArticle: wrap(client.createArticle, async payload =>
      mutate('create', { payload }, async () => {
        await guard('create', client.createArticle);
        return client.createArticle(payload);
      })
    ),
    updateArticle: wrap(client.updateArticle, async (id, payload) => {
      return execution.metadata(id, payload, async outgoing => {
        return mutate('metadata', { articleId: id, payload: outgoing }, async () => {
          await guard('metadata', client.updateArticle);
          return client.updateArticle(id, outgoing);
        });
      });
    }),
    createArticleFile: wrap(client.createArticleFile, async (id, payload) =>
      mutate('file_init', { articleId: id, payload }, async () => {
        await guard('assets', client.createArticleFile);
        return client.createArticleFile(id, payload);
      })
    ),
    uploadFilePart: wrap(client.uploadFilePart, async (url, part, data) =>
      mutate('upload_part', { part }, async () => {
        await guard('assets', client.uploadFilePart);
        return client.uploadFilePart(url, part, data);
      })
    ),
    completeFileUpload: wrap(client.completeFileUpload, async (id, fileId, payload) =>
      mutate('file_complete', { articleId: id, fileId }, async () => {
        await guard('assets', client.completeFileUpload);
        return client.completeFileUpload(id, fileId, payload);
      })
    ),
    deleteArticleFile: wrap(client.deleteArticleFile, async (id, fileId) =>
      mutate('file_delete', { articleId: id, fileId }, async () => {
        await guard('assets', client.deleteArticleFile);
        return client.deleteArticleFile(id, fileId);
      })
    ),
    setEmbargo: wrap(client.setEmbargo, async (id, payload) =>
      mutate('embargo', { articleId: id, payload }, async () => {
        await guard('embargo', client.setEmbargo);
        return client.setEmbargo(id, payload);
      })
    ),
    clearEmbargo: wrap(client.clearEmbargo, async id =>
      mutate('embargo_clear', { articleId: id }, async () => {
        await guard('embargo', client.clearEmbargo);
        return client.clearEmbargo(id);
      })
    ),
    publishArticle: wrap(client.publishArticle, async (id, payload) =>
      mutate('publish', { articleId: id }, async () => {
        await guard('publish', client.publishArticle);
        return client.publishArticle(id, payload);
      })
    ),
  };
  wrappedClients.set(wrapped, execution);
  return wrapped;
}
export class FigshareWaiting extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'FigshareWaiting';
  }
}
export class FigshareRepairRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigshareRepairRequired';
  }
}
