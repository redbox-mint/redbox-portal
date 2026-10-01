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
export const figshareExecution = new AsyncLocalStorage<FigshareExecution>();
/** Wrap at the client boundary, after customer payload customisation. */
export function workerClient(client: FigshareClient): FigshareClient {
  const execution = figshareExecution.getStore();
  if (!execution) return client;
  return {
    ...client,
    async createArticle(payload) { await execution.guard('create'); return client.createArticle(payload); },
    async updateArticle(id, payload) {
      await execution.guard('metadata');
      return execution.metadata(id, payload, outgoing => client.updateArticle(id, outgoing));
    },
    async createArticleFile(id, payload) { await execution.guard('assets'); return client.createArticleFile(id, payload); },
    async uploadFilePart(url, part, data) { await execution.guard('assets'); return client.uploadFilePart(url, part, data); },
    async completeFileUpload(id, fileId, payload) { await execution.guard('assets'); return client.completeFileUpload(id, fileId, payload); },
    async deleteArticleFile(id, fileId) { await execution.guard('assets'); return client.deleteArticleFile(id, fileId); },
    async setEmbargo(id, payload) { await execution.guard('embargo'); return client.setEmbargo(id, payload); },
    async clearEmbargo(id) { await execution.guard('embargo'); return client.clearEmbargo(id); },
    async publishArticle(id, payload) { await execution.guard('publish'); return client.publishArticle(id, payload); }
  };
}
export class FigshareWaiting extends Error {
  constructor(public reason: string) { super(reason); this.name = 'FigshareWaiting'; }
}
export class FigshareRepairRequired extends Error {
  constructor(message: string) { super(message); this.name = 'FigshareRepairRequired'; }
}
