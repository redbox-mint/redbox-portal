import { AsyncLocalStorage } from 'node:async_hooks';
import type { FigshareBinding } from '../../model/storage/FigshareSyncModel';
import type { FigshareOperation } from '../../configmodels/FigsharePublishing';
import type { FigshareArticle, FigshareArticlePayload } from './types';
import type { FigshareClient } from './http';

export interface FigshareExecution {
  binding?: FigshareBinding;
  recovery?: boolean;
  signal: AbortSignal;
  guard: (operation: FigshareOperation) => Promise<void>;
  metadata: (id: string, payload: FigshareArticlePayload, send: (payload: FigshareArticlePayload) => Promise<FigshareArticle>) => Promise<FigshareArticle>;
}
/** Live transport checks immediately before HTTP; fixture/custom clients use the boundary guard. */
export const transportGuardedMethods = new WeakSet<(...args: never[]) => unknown>();
export const figshareExecution = new AsyncLocalStorage<FigshareExecution>();
/** Wrap at the client boundary, after customer payload customisation. */
export function workerClient(client: FigshareClient): FigshareClient {
  const execution = figshareExecution.getStore();
  if (!execution) return client;
  const guard = async (operation: FigshareOperation, send: (...args: never[]) => unknown) => {
    if (!transportGuardedMethods.has(send)) await execution.guard(operation);
  };
  return {
    ...client,
    async createArticle(payload) { await guard('create', client.createArticle); return client.createArticle(payload); },
    async updateArticle(id, payload) {
      return execution.metadata(id, payload, async outgoing => {
        await guard('metadata', client.updateArticle);
        return client.updateArticle(id, outgoing);
      });
    },
    async createArticleFile(id, payload) { await guard('assets', client.createArticleFile); return client.createArticleFile(id, payload); },
    async uploadFilePart(url, part, data) { await guard('assets', client.uploadFilePart); return client.uploadFilePart(url, part, data); },
    async completeFileUpload(id, fileId, payload) { await guard('assets', client.completeFileUpload); return client.completeFileUpload(id, fileId, payload); },
    async deleteArticleFile(id, fileId) { await guard('assets', client.deleteArticleFile); return client.deleteArticleFile(id, fileId); },
    async setEmbargo(id, payload) { await guard('embargo', client.setEmbargo); return client.setEmbargo(id, payload); },
    async clearEmbargo(id) { await guard('embargo', client.clearEmbargo); return client.clearEmbargo(id); },
    async publishArticle(id, payload) { await guard('publish', client.publishArticle); return client.publishArticle(id, payload); }
  };
}
export class FigshareWaiting extends Error {
  constructor(public reason: string) { super(reason); this.name = 'FigshareWaiting'; }
}
export class FigshareRepairRequired extends Error {
  constructor(message: string) { super(message); this.name = 'FigshareRepairRequired'; }
}
