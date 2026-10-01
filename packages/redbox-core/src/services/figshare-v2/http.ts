import { figshareExecution, workerClient } from './execution';
import type { FigshareOperation } from '../../configmodels/FigsharePublishing';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { Context, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { ResolvedFigsharePublishingConfigData } from './config';
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
  FigshareCategory,
} from './types';
import { logEvent, withSpan } from './observability';
import { redactObject } from '../../utilities/RedactionUtils';

export class FigshareHttpError extends Error {
  statusCode?: number;
  responseBody?: unknown;

  constructor(message: string, options: { statusCode?: number; responseBody?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'FigshareHttpError';
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody;
    if (options.cause != null) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Keep Axios request/config internals out of logs while retaining validation errors. */
export function describeFigshareHttpFailure(error: AxiosError, token: string): Record<string, string | undefined> {
  const body = error.response?.data;
  const details = body != null && typeof body === 'object' ? body as Record<string, unknown> : {};
  const safeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const withoutToken = token ? value.replaceAll(token, '[REDACTED]') : value;
    return withoutToken.slice(0, 500);
  };
  return {
    errorName: safeText(error.name),
    errorCode: safeText(error.code),
    responseCode: safeText(details.code),
    responseMessage: safeText(details.message)
  };
}

function isReadablePayload(payload: unknown): payload is { pipe: (...args: unknown[]) => unknown } {
  return payload != null && typeof payload === 'object' && typeof (payload as { pipe?: unknown }).pipe === 'function';
}

function getContentType(headers?: Record<string, unknown>): string {
  const contentTypeHeader = headers == null
    ? undefined
    : headers['Content-Type'] ?? headers['content-type'];
  return typeof contentTypeHeader === 'string' ? contentTypeHeader.toLowerCase() : '';
}

function sanitizePayloadForLogging(payload: unknown, headers?: Record<string, unknown>): unknown {
  const contentType = getContentType(headers);
  if (Buffer.isBuffer(payload)) {
    return {
      type: 'buffer',
      byteLength: payload.length,
      contentType: contentType || undefined
    };
  }
  if (isReadablePayload(payload) || contentType.includes('application/octet-stream')) {
    return {
      type: isReadablePayload(payload) ? 'stream' : 'binary',
      contentType: contentType || undefined,
      payloadClass: payload != null && typeof payload === 'object' ? payload.constructor?.name : undefined
    };
  }
  return redactObject(payload);
}

function assertNumericPathId(label: string, value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid Figshare ${label}: '${value}'`);
  }
  return normalized;
}

export interface FigshareClient {
  getAccount?(): Promise<FigshareInstitutionAccount>;
  listArticles?(page?: number, pageSize?: number): Promise<FigshareArticle[]>;
  getPublicArticle?(articleId: string): Promise<FigshareArticle>;
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
  listPublicCategories(): Promise<FigshareCategory[]>;
  listAccountCategories(): Promise<FigshareCategory[]>;
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
  responseMapper?: <T>(response: AxiosResponse) => T;
  /** Public Figshare endpoints reject nothing but must not receive the account token. */
  anonymous?: boolean;
  operation?: FigshareOperation;
};

type FigshareResponseHeaders = Record<string, unknown> | AxiosResponse['headers'];
type FigshareResponseLike = {
  data?: unknown;
  headers?: FigshareResponseHeaders;
};

async function requestWithRetry<T = Record<string, unknown>>(config: FigsharePublishingConfigData, runContext: FigshareRunContext, options: RequestOptions): Promise<T> {
  const execution = figshareExecution.getStore();
  const retryConfig = config.connection.retry;
  const method = options.method;
  const methodLower = method.toLowerCase();
  const retryOnMethods = (Array.isArray(retryConfig.retryOnMethods) && retryConfig.retryOnMethods.length > 0
    ? retryConfig.retryOnMethods
    : ['get', 'put', 'delete']).map((entry: string) => entry.toLowerCase());
  const path = options.path ?? '';
  const url = options.url ?? `${config.connection.baseUrl.replace(/\/+$/, '')}${path}`;
  const accountApi = (url === `${config.connection.baseUrl.replace(/\/+$/, '')}/account` || url.startsWith(`${config.connection.baseUrl.replace(/\/+$/, '')}/account/`));
  const operation = options.operation ?? (/\/files(?:[/?]|$)/.test(url) ? 'assets' : /\/embargo$/.test(url) ? 'embargo' : /\/publish$/.test(url) ? 'publish' : methodLower === 'get' ? 'read' : 'metadata');
  const discovery = options.path === '/account' || options.path?.startsWith('/account/institution/') || options.path === '/account/licenses' || options.path === '/account/categories';
  const actor = discovery ? 'token' : execution?.recovery ? 'owner' : config.impersonation?.operations[operation];
  const owner = accountApi && options.anonymous !== true && (execution?.recovery || config.impersonation?.enabled) && actor === 'owner' && execution?.binding?.ownerId !== execution?.binding?.accountId ? execution?.binding?.ownerId : undefined;
  if (accountApi && config.impersonation?.enabled && actor === 'owner' && !execution?.binding?.ownerId) throw new Error('Figshare operation requires a resolved owner');
  if (config.processing?.enabled && !execution && methodLower !== 'get' && !discovery) throw new Error('Figshare mutations require the queued worker context');
  let payload = options.payload;
  let params = options.params;
  if (owner) {
    if (['get', 'delete'].includes(methodLower)) params = { ...params, impersonate: owner };
    else payload = { ...(payload as Record<string, unknown> ?? {}), impersonate: owner };
  }
  // Queue retries reconcile mutations first; transport must never replay a POST.
  const attempts = execution && methodLower !== 'get' ? 1 : retryConfig.maxAttempts;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (execution?.signal.aborted) throw new Error('Figshare request cancelled after lease loss');
    if (execution && methodLower !== 'get' && !url.includes('/institution/accounts/search')) await execution.guard(operation);
    try {
      return await withSpan(`figshare.http.${method.toLowerCase()}`, runContext, {
        'http.method': method,
        'http.url': url
      }, async () => {
        const sanitizedPayload = sanitizePayloadForLogging(options.payload, options.headers);
        logEvent('debug', `Figshare V2 request ${method} ${path}`, runContext, { attempt, payload: sanitizedPayload });
        const response = await axios({
          method,
          url,
          headers: {
            'Content-Type': 'application/json',
            ...(options.anonymous === true || !accountApi ? {} : { 'Authorization': `token ${config.connection.token}` }),
            ...(options.headers || {})
          },
          timeout: options.timeoutMs ?? config.connection.timeoutMs,
          data: payload,
          params,
          signal: execution?.signal,
          maxContentLength: options.maxContentLength,
          maxBodyLength: options.maxBodyLength
        });
        return options.responseMapper != null ? options.responseMapper<T>(response) : response.data as T;
      });
    } catch (error) {
      const axiosErr = error as AxiosError;
      const status = axiosErr?.response?.status;
      const retryableStatus = status == null || retryConfig.retryOnStatusCodes.includes(Number(status));
      const retryableMethod = retryOnMethods.includes(methodLower);
      const retryable = retryableStatus && retryableMethod;
      logEvent(retryable && attempt < attempts ? 'warn' : 'error', `Figshare V2 request failed ${method} ${path}`, runContext, {
        attempt,
        status,
        ...describeFigshareHttpFailure(axiosErr, config.connection.token)
      });
      if (!retryable || attempt === attempts) {
        // Wrap instead of rethrowing the raw AxiosError: axios errors carry the full
        // request config (including the Authorization header) and must not propagate.
        throw new FigshareHttpError(`Figshare HTTP request failed for ${method} ${path || url}`, {
          statusCode: status == null ? undefined : Number(status),
          responseBody: axiosErr?.response?.data,
          cause: error
        });
      }
      await new Promise((resolve) => setTimeout(resolve, getRetryDelay(retryConfig.baseDelayMs, retryConfig.maxDelayMs, attempt)));
    }
  }
  throw new FigshareHttpError(`Figshare HTTP request failed for ${method} ${path}`);
}

function getResponseHeader(response: FigshareResponseLike, name: string): string | undefined {
  const value = response.headers?.[name] ?? response.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] == null ? undefined : String(value[0]);
  }
  return value == null ? undefined : String(value);
}

function getFigshareIdFromLocation(location: string): string | undefined {
  const path = location.split('?')[0] ?? '';
  const match = /\/articles\/(\d+)(?:\/|$)/.exec(path) ?? /\/account\/articles\/(\d+)(?:\/|$)/.exec(path);
  return match?.[1];
}

export function mapCreateArticleResponse<T>(response: FigshareResponseLike): T {
  const article = response.data != null && typeof response.data === 'object'
    ? response.data as FigshareArticle
    : {} as FigshareArticle;
  if (article.id != null && String(article.id).trim() !== '') {
    return article as T;
  }
  const location = typeof article.location === 'string' ? article.location : getResponseHeader(response, 'Location');
  const articleId = article.entity_id != null ? String(article.entity_id) : location == null ? undefined : getFigshareIdFromLocation(location);
  return {
    ...article,
    ...(articleId != null ? { id: articleId } : {}),
    ...(location != null ? { location } : {})
  } as T;
}

export function makeFixtureClient(config: ResolvedFigsharePublishingConfigData): FigshareClient {
  const fixtures = config.runtime.fixtures;
  return {
    async getAccount() { return { id: 101, user_id: 201 }; },
    async listArticles(page = 1) { return page === 1 && fixtures?.article ? [fixtures.article as FigshareArticle] : []; },
    async getPublicArticle(articleId) { return { ...fixtures?.article, id: articleId } as FigshareArticle; },
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
    },
    async listPublicCategories(): Promise<FigshareCategory[]> {
      return (fixtures?.categories ?? []) as unknown as FigshareCategory[];
    },
    async listAccountCategories(): Promise<FigshareCategory[]> {
      return (fixtures?.categories ?? []) as unknown as FigshareCategory[];
    }
  };
}

export function makeLiveClient(config: FigsharePublishingConfigData, runContext: FigshareRunContext): FigshareClient {
  return {
    getAccount() { return requestWithRetry<FigshareInstitutionAccount>(config, runContext, { method: 'get', path: '/account', operation: 'metadata' }); },
    listArticles(page = 1, pageSize = 100) { return requestWithRetry<FigshareArticle[]>(config, runContext, { method: 'get', path: '/account/articles', params: { page, page_size: pageSize }, operation: 'recovery' }); },
    getPublicArticle(articleId) { return requestWithRetry<FigshareArticle>(config, runContext, { method: 'get', path: `/articles/${assertNumericPathId('articleId', articleId)}`, anonymous: true }); },
    createArticle(payload: FigshareArticlePayload) {
      return requestWithRetry<FigshareArticle>(config, runContext, {
        method: 'post',
        path: '/account/articles',
        operation: 'create',
        payload,
        timeoutMs: config.connection.operationTimeouts.metadataMs,
        responseMapper: mapCreateArticleResponse
      });
    },
    updateArticle(articleId: string, payload: FigshareArticlePayload) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry<FigshareArticle>(config, runContext, { method: 'put', path: `/account/articles/${normalizedArticleId}`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    getArticle(articleId: string) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry<FigshareArticle>(config, runContext, { method: 'get', path: `/account/articles/${normalizedArticleId}`, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    listArticleFiles(articleId: string, page: number = 1, pageSize: number = 20) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry<FigshareFile[]>(config, runContext, { method: 'get', path: `/account/articles/${normalizedArticleId}/files?page_size=${pageSize}&page=${page}`, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    createArticleFile(articleId: string, payload: FigshareCreateFilePayload) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry<FigshareUploadInit>(config, runContext, { method: 'post', path: `/account/articles/${normalizedArticleId}/files`, payload, timeoutMs: config.connection.operationTimeouts.uploadInitMs });
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
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      const normalizedFileId = assertNumericPathId('fileId', fileId);
      return requestWithRetry<FigshareFile>(config, runContext, {
        method: 'post',
        path: `/account/articles/${normalizedArticleId}/files/${normalizedFileId}`,
        payload,
        timeoutMs: config.connection.operationTimeouts.uploadInitMs
      });
    },
    deleteArticleFile(articleId: string, fileId: string) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      const normalizedFileId = assertNumericPathId('fileId', fileId);
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${normalizedArticleId}/files/${normalizedFileId}`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    setEmbargo(articleId: string, payload: FigshareEmbargoPayload) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry(config, runContext, { method: 'put', path: `/account/articles/${normalizedArticleId}/embargo`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    clearEmbargo(articleId: string) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${normalizedArticleId}/embargo`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    publishArticle(articleId: string, payload: Record<string, unknown> = {}) {
      const normalizedArticleId = assertNumericPathId('articleId', articleId);
      return requestWithRetry<FigsharePublishResult>(config, runContext, { method: 'post', path: `/account/articles/${normalizedArticleId}/publish`, payload, timeoutMs: config.connection.operationTimeouts.publishMs });
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
    },
    listPublicCategories() {
      return requestWithRetry<FigshareCategory[]>(config, runContext, {
        method: 'get',
        path: '/categories',
        timeoutMs: config.connection.operationTimeouts.metadataMs,
        anonymous: true
      });
    },
    listAccountCategories() {
      return requestWithRetry<FigshareCategory[]>(config, runContext, {
        method: 'get',
        path: '/account/categories',
        timeoutMs: config.connection.operationTimeouts.metadataMs
      });
    }
  };
}

export function makeClientLayer(config: ResolvedFigsharePublishingConfigData, runContext: FigshareRunContext) {
  const client = config.runtime.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, runContext);
  return Layer.succeed(FigshareClientTag, workerClient(client));
}
