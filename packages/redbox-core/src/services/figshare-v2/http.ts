import axios, { AxiosError } from 'axios';
import { Context, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import {
  FigshareRunContext,
  FigshareArticle,
  FigshareFile,
  FigshareUploadInit,
  FigshareUploadDescriptor,
  FigshareLicense,
  FigshareInstitutionAccount,
  FigsharePublishResult,
  FigshareArticlePayload,
  FigshareCreateFilePayload,
  FigshareEmbargoPayload,
} from './types';
import { logEvent, redactObject, withSpan } from './observability';

export interface FigshareClient {
  createArticle(payload: FigshareArticlePayload): Promise<FigshareArticle>;
  updateArticle(articleId: string, payload: FigshareArticlePayload): Promise<FigshareArticle>;
  getArticle(articleId: string): Promise<FigshareArticle>;
  listArticleFiles(articleId: string, page?: number, pageSize?: number): Promise<FigshareFile[]>;
  createArticleFile(articleId: string, payload: FigshareCreateFilePayload): Promise<FigshareUploadInit>;
  getLocation(locationUrl: string): Promise<FigshareUploadDescriptor>;
  uploadFilePart(uploadUrl: string, partNo: number, data: unknown): Promise<Record<string, unknown>>;
  completeFileUpload(articleId: string, fileId: string, payload?: Record<string, unknown>): Promise<FigshareFile>;
  deleteArticleFile(articleId: string, fileId: string): Promise<Record<string, unknown>>;
  setEmbargo(articleId: string, payload: FigshareEmbargoPayload): Promise<Record<string, unknown>>;
  clearEmbargo(articleId: string): Promise<Record<string, unknown>>;
  publishArticle(articleId: string, payload?: Record<string, unknown>): Promise<FigsharePublishResult>;
  listLicenses(): Promise<FigshareLicense[]>;
  searchInstitutionAccounts(payload: Record<string, unknown>): Promise<FigshareInstitutionAccount[]>;
}

export const FigshareClientTag = Context.GenericTag<FigshareClient>('redbox/FigshareClient');

function getRetryDelay(baseDelayMs: number, maxDelayMs: number, attempt: number): number {
  const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  return delay + Math.floor(Math.random() * Math.min(250, Math.max(1, baseDelayMs)));
}

type RequestOptions = {
  method: string;
  path?: string;
  url?: string;
  payload?: unknown;
  headers?: Record<string, unknown>;
  timeoutMs?: number;
  params?: Record<string, unknown>;
  maxContentLength?: number;
  maxBodyLength?: number;
};

async function requestWithRetry<T = Record<string, unknown>>(config: FigsharePublishingConfigData, runContext: FigshareRunContext, options: RequestOptions): Promise<T> {
  const retryConfig = config.connection.retry;
  const method = options.method;
  const methodLower = method.toLowerCase();
  const retryOnMethods = (Array.isArray(retryConfig.retryOnMethods) && retryConfig.retryOnMethods.length > 0
    ? retryConfig.retryOnMethods
    : ['get', 'put', 'delete']).map((entry: string) => entry.toLowerCase());
  const path = options.path ?? '';
  const url = options.url ?? `${config.connection.baseUrl.replace(/\/+$/, '')}${path}`;
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await withSpan(`figshare.http.${method.toLowerCase()}`, runContext, {
        'http.method': method,
        'http.url': url
      }, async () => {
        logEvent('debug', `Figshare V2 request ${method} ${path}`, runContext, { attempt, payload: options.payload });
        const response = await axios({
          method,
          url,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${config.connection.token}`,
            ...(options.headers || {})
          },
          timeout: options.timeoutMs ?? config.connection.timeoutMs,
          data: options.payload,
          params: options.params,
          maxContentLength: options.maxContentLength,
          maxBodyLength: options.maxBodyLength
        });
        return response.data as T;
      });
    } catch (error) {
      const axiosErr = error as AxiosError;
      const status = axiosErr?.response?.status;
      const retryableStatus = status == null || retryConfig.retryOnStatusCodes.includes(Number(status));
      const retryableMethod = retryOnMethods.includes(methodLower);
      const retryable = retryableStatus && retryableMethod;
      logEvent(retryable && attempt < retryConfig.maxAttempts ? 'warn' : 'error', `Figshare V2 request failed ${method} ${path}`, runContext, {
        attempt,
        status,
        error: redactObject(error)
      });
      if (!retryable || attempt === retryConfig.maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, getRetryDelay(retryConfig.baseDelayMs, retryConfig.maxDelayMs, attempt)));
    }
  }
  throw new Error(`Figshare request failed for ${method} ${path}`);
}

export function makeFixtureClient(config: FigsharePublishingConfigData): FigshareClient {
  const fixtures = config.testing.fixtures;
  return {
    async createArticle(payload: FigshareArticlePayload): Promise<FigshareArticle> {
      return {
        id: fixtures?.article?.id ?? 'fixture-article-id',
        ...(fixtures?.article ?? {}),
        ...payload
      } as FigshareArticle;
    },
    async updateArticle(articleId: string, payload: FigshareArticlePayload): Promise<FigshareArticle> {
      return {
        id: articleId || fixtures?.article?.id || 'fixture-article-id',
        ...(fixtures?.article ?? {}),
        ...payload
      } as FigshareArticle;
    },
    async getArticle(articleId: string): Promise<FigshareArticle> {
      return {
        id: articleId || fixtures?.article?.id || 'fixture-article-id',
        ...(fixtures?.article ?? {})
      } as FigshareArticle;
    },
    async listArticleFiles(_articleId: string, _page: number = 1, _pageSize: number = 20): Promise<FigshareFile[]> {
      return (fixtures?.articleFiles ?? []) as FigshareFile[];
    },
    async createArticleFile(_articleId: string, payload: FigshareCreateFilePayload): Promise<FigshareUploadInit> {
      if (payload.link != null) {
        return {
          id: (fixtures as Record<string, unknown>)?.linkFile != null
            ? ((fixtures as Record<string, unknown>).linkFile as Record<string, unknown>).id ?? 'fixture-link-id'
            : 'fixture-link-id',
          location: String(payload.link ?? '')
        } as FigshareUploadInit;
      }
      const upload = (fixtures as Record<string, unknown>)?.upload as Record<string, unknown> | undefined;
      return {
        location: upload?.location ?? 'https://upload-location.example/files/fixture-file-id'
      } as FigshareUploadInit;
    },
    async getLocation(locationUrl: string): Promise<FigshareUploadDescriptor> {
      const upload = (fixtures as Record<string, unknown>)?.upload as Record<string, unknown> | undefined;
      if (locationUrl.includes('/upload/')) {
        return {
          parts: (upload?.parts ?? [{ partNo: 1, startOffset: 0, endOffset: 0 }])
        } as FigshareUploadDescriptor;
      }
      const file = upload?.file as Record<string, unknown> | undefined;
      return {
        id: file?.id ?? 'fixture-file-id',
        upload_url: file?.upload_url ?? 'https://upload-location.example/upload/fixture-file-id',
        download_url: file?.download_url ?? 'https://download-location.example/files/fixture-file-id',
        status: 'available'
      } as FigshareUploadDescriptor;
    },
    async uploadFilePart(_uploadUrl: string, _partNo: number, _data: unknown) {
      return {};
    },
    async completeFileUpload(articleId: string, fileId: string, _payload?: Record<string, unknown>): Promise<FigshareFile> {
      return {
        id: fileId,
        name: '',
        article_id: articleId,
        status: 'available'
      } as FigshareFile;
    },
    async deleteArticleFile(_articleId: string, fileId: string) {
      return { id: fileId, deleted: true };
    },
    async setEmbargo(_articleId: string, payload: FigshareEmbargoPayload) {
      return { ...payload };
    },
    async clearEmbargo(articleId: string) {
      return { id: articleId, cleared: true };
    },
    async publishArticle(articleId: string, _payload?: Record<string, unknown>): Promise<FigsharePublishResult> {
      return (fixtures?.publishResult ?? { id: articleId, status: 'published' }) as FigsharePublishResult;
    },
    async listLicenses(): Promise<FigshareLicense[]> {
      return (fixtures?.licenses ?? []) as FigshareLicense[];
    },
    async searchInstitutionAccounts(_payload: Record<string, unknown>): Promise<FigshareInstitutionAccount[]> {
      return (fixtures?.authors ?? []) as FigshareInstitutionAccount[];
    }
  };
}

export function makeLiveClient(config: FigsharePublishingConfigData, runContext: FigshareRunContext): FigshareClient {
  return {
    createArticle(payload: FigshareArticlePayload) {
      return requestWithRetry<FigshareArticle>(config, runContext, { method: 'post', path: '/account/articles', payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    updateArticle(articleId: string, payload: FigshareArticlePayload) {
      return requestWithRetry<FigshareArticle>(config, runContext, { method: 'put', path: `/account/articles/${articleId}`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    getArticle(articleId: string) {
      return requestWithRetry<FigshareArticle>(config, runContext, { method: 'get', path: `/account/articles/${articleId}`, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    listArticleFiles(articleId: string, page: number = 1, pageSize: number = 20) {
      return requestWithRetry<FigshareFile[]>(config, runContext, { method: 'get', path: `/account/articles/${articleId}/files?page_size=${pageSize}&page=${page}`, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    createArticleFile(articleId: string, payload: FigshareCreateFilePayload) {
      return requestWithRetry<FigshareUploadInit>(config, runContext, { method: 'post', path: `/account/articles/${articleId}/files`, payload, timeoutMs: config.connection.operationTimeouts.uploadInitMs });
    },
    getLocation(locationUrl: string) {
      return requestWithRetry<FigshareUploadDescriptor>(config, runContext, { method: 'get', url: locationUrl, timeoutMs: config.connection.operationTimeouts.uploadInitMs });
    },
    uploadFilePart(uploadUrl: string, partNo: number, data: unknown) {
      return requestWithRetry(config, runContext, {
        method: 'put',
        url: `${uploadUrl}/${partNo}`,
        payload: data,
        headers: { 'Content-Type': 'application/octet-stream' },
        timeoutMs: config.connection.operationTimeouts.uploadPartMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
    },
    completeFileUpload(articleId: string, fileId: string, payload: Record<string, unknown> = {}) {
      return requestWithRetry<FigshareFile>(config, runContext, {
        method: 'post',
        path: `/account/articles/${articleId}/files/${fileId}`,
        payload,
        timeoutMs: config.connection.operationTimeouts.uploadInitMs
      });
    },
    deleteArticleFile(articleId: string, fileId: string) {
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${articleId}/files/${fileId}`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    setEmbargo(articleId: string, payload: FigshareEmbargoPayload) {
      return requestWithRetry(config, runContext, { method: 'put', path: `/account/articles/${articleId}/embargo`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    clearEmbargo(articleId: string) {
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${articleId}/embargo`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    publishArticle(articleId: string, payload: Record<string, unknown> = {}) {
      return requestWithRetry<FigsharePublishResult>(config, runContext, { method: 'post', path: `/account/articles/${articleId}/publish`, payload, timeoutMs: config.connection.operationTimeouts.publishMs });
    },
    listLicenses() {
      return requestWithRetry<FigshareLicense[]>(config, runContext, { method: 'get', path: '/account/licenses', timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    searchInstitutionAccounts(payload: Record<string, unknown>) {
      return requestWithRetry<FigshareInstitutionAccount[]>(config, runContext, {
        method: 'post',
        path: '/account/institution/accounts/search',
        payload,
        timeoutMs: config.connection.operationTimeouts.metadataMs
      });
    }
  };
}

export function makeClientLayer(config: FigsharePublishingConfigData, runContext: FigshareRunContext) {
  const client = config.testing.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, runContext);
  return Layer.succeed(FigshareClientTag, client);
}
