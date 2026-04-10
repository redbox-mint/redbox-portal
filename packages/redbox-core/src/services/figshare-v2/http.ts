import axios from 'axios';
import _ from 'lodash';
import { Context, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareRunContext, AnyRecord } from './types';
import { logEvent, redactObject, withSpan } from './observability';

export interface FigshareClient {
  createArticle(payload: AnyRecord): Promise<AnyRecord>;
  updateArticle(articleId: string, payload: AnyRecord): Promise<AnyRecord>;
  getArticle(articleId: string): Promise<AnyRecord>;
  listArticleFiles(articleId: string, page?: number, pageSize?: number): Promise<AnyRecord[]>;
  createArticleFile(articleId: string, payload: AnyRecord): Promise<AnyRecord>;
  getLocation(locationUrl: string): Promise<AnyRecord>;
  uploadFilePart(uploadUrl: string, partNo: number, data: unknown): Promise<AnyRecord>;
  completeFileUpload(articleId: string, fileId: string, payload?: AnyRecord): Promise<AnyRecord>;
  deleteArticleFile(articleId: string, fileId: string): Promise<AnyRecord>;
  setEmbargo(articleId: string, payload: AnyRecord): Promise<AnyRecord>;
  clearEmbargo(articleId: string): Promise<AnyRecord>;
  publishArticle(articleId: string, payload: AnyRecord): Promise<AnyRecord>;
  listLicenses(): Promise<AnyRecord[]>;
  searchInstitutionAccounts(payload: AnyRecord): Promise<AnyRecord[]>;
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

async function requestWithRetry(config: FigsharePublishingConfigData, runContext: FigshareRunContext, options: RequestOptions): Promise<AnyRecord> {
  const retryConfig = config.connection.retry;
  const method = options.method;
  const methodLower = method.toLowerCase();
  const retryOnMethods = (_.isArray(retryConfig.retryOnMethods) && retryConfig.retryOnMethods.length > 0
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
        return response.data as AnyRecord;
      });
    } catch (error) {
      const status = _.get(error, 'response.status');
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
  return {
    async createArticle(payload: AnyRecord) {
      return {
        id: _.get(config.testing.fixtures, 'article.id', 'fixture-article-id'),
        ...(_.get(config.testing.fixtures, 'article', {}) as AnyRecord),
        ...payload
      };
    },
    async updateArticle(articleId: string, payload: AnyRecord) {
      return {
        id: articleId || _.get(config.testing.fixtures, 'article.id', 'fixture-article-id'),
        ...(_.get(config.testing.fixtures, 'article', {}) as AnyRecord),
        ...payload
      };
    },
    async getArticle(articleId: string) {
      return {
        id: articleId || _.get(config.testing.fixtures, 'article.id', 'fixture-article-id'),
        ...(_.get(config.testing.fixtures, 'article', {}) as AnyRecord)
      };
    },
    async listArticleFiles(_articleId: string, _page: number = 1, _pageSize: number = 20) {
      return (_.get(config.testing.fixtures, 'articleFiles', []) as AnyRecord[]) || [];
    },
    async createArticleFile(_articleId: string, payload: AnyRecord) {
      if (_.has(payload, 'link')) {
        return {
          id: _.get(config.testing.fixtures, 'linkFile.id', 'fixture-link-id'),
          location: _.get(payload, 'link', '')
        };
      }
      return {
        location: _.get(config.testing.fixtures, 'upload.location', 'https://upload-location.example/files/fixture-file-id')
      };
    },
    async getLocation(locationUrl: string) {
      if (locationUrl.includes('/upload/')) {
        return {
          parts: _.get(config.testing.fixtures, 'upload.parts', [{ partNo: 1, startOffset: 0, endOffset: 0 }])
        };
      }
      return {
        id: _.get(config.testing.fixtures, 'upload.file.id', 'fixture-file-id'),
        upload_url: _.get(config.testing.fixtures, 'upload.file.upload_url', 'https://upload-location.example/upload/fixture-file-id'),
        download_url: _.get(config.testing.fixtures, 'upload.file.download_url', 'https://download-location.example/files/fixture-file-id'),
        status: 'available'
      };
    },
    async uploadFilePart(_uploadUrl: string, _partNo: number, _data: unknown) {
      return {};
    },
    async completeFileUpload(articleId: string, fileId: string, _payload?: AnyRecord) {
      return {
        id: fileId,
        article_id: articleId,
        status: 'available'
      };
    },
    async deleteArticleFile(_articleId: string, fileId: string) {
      return { id: fileId, deleted: true };
    },
    async setEmbargo(_articleId: string, payload: AnyRecord) {
      return payload;
    },
    async clearEmbargo(articleId: string) {
      return { id: articleId, cleared: true };
    },
    async publishArticle(articleId: string, _payload: AnyRecord) {
      return _.get(config.testing.fixtures, 'publishResult', { id: articleId, status: 'published' }) as AnyRecord;
    },
    async listLicenses() {
      return (_.get(config.testing.fixtures, 'licenses', []) as AnyRecord[]) || [];
    },
    async searchInstitutionAccounts(_payload: AnyRecord) {
      return (_.get(config.testing.fixtures, 'authors', []) as AnyRecord[]) || [];
    }
  };
}

export function makeLiveClient(config: FigsharePublishingConfigData, runContext: FigshareRunContext): FigshareClient {
  return {
    createArticle(payload: AnyRecord) {
      return requestWithRetry(config, runContext, { method: 'post', path: '/account/articles', payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    updateArticle(articleId: string, payload: AnyRecord) {
      return requestWithRetry(config, runContext, { method: 'put', path: `/account/articles/${articleId}`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    getArticle(articleId: string) {
      return requestWithRetry(config, runContext, { method: 'get', path: `/account/articles/${articleId}`, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    listArticleFiles(articleId: string, page: number = 1, pageSize: number = 20) {
      return requestWithRetry(config, runContext, { method: 'get', path: `/account/articles/${articleId}/files?page_size=${pageSize}&page=${page}`, timeoutMs: config.connection.operationTimeouts.metadataMs }) as unknown as Promise<AnyRecord[]>;
    },
    createArticleFile(articleId: string, payload: AnyRecord) {
      return requestWithRetry(config, runContext, { method: 'post', path: `/account/articles/${articleId}/files`, payload, timeoutMs: config.connection.operationTimeouts.uploadInitMs });
    },
    getLocation(locationUrl: string) {
      return requestWithRetry(config, runContext, { method: 'get', url: locationUrl, timeoutMs: config.connection.operationTimeouts.uploadInitMs });
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
    completeFileUpload(articleId: string, fileId: string, payload: AnyRecord = {}) {
      return requestWithRetry(config, runContext, {
        method: 'post',
        path: `/account/articles/${articleId}/files/${fileId}`,
        payload,
        timeoutMs: config.connection.operationTimeouts.uploadInitMs
      });
    },
    deleteArticleFile(articleId: string, fileId: string) {
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${articleId}/files/${fileId}`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    setEmbargo(articleId: string, payload: AnyRecord) {
      return requestWithRetry(config, runContext, { method: 'put', path: `/account/articles/${articleId}/embargo`, payload, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    clearEmbargo(articleId: string) {
      return requestWithRetry(config, runContext, { method: 'delete', path: `/account/articles/${articleId}/embargo`, payload: {}, timeoutMs: config.connection.operationTimeouts.metadataMs });
    },
    publishArticle(articleId: string, payload: AnyRecord) {
      return requestWithRetry(config, runContext, { method: 'post', path: `/account/articles/${articleId}/publish`, payload, timeoutMs: config.connection.operationTimeouts.publishMs });
    },
    listLicenses() {
      return requestWithRetry(config, runContext, { method: 'get', path: '/account/licenses', timeoutMs: config.connection.operationTimeouts.metadataMs }) as unknown as Promise<AnyRecord[]>;
    },
    searchInstitutionAccounts(payload: AnyRecord) {
      return requestWithRetry(config, runContext, {
        method: 'post',
        path: '/account/institution/accounts/search',
        payload,
        timeoutMs: config.connection.operationTimeouts.metadataMs
      }) as unknown as Promise<AnyRecord[]>;
    }
  };
}

export function makeClientLayer(config: FigsharePublishingConfigData, runContext: FigshareRunContext) {
  const client = config.testing.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, runContext);
  return Layer.succeed(FigshareClientTag, client);
}
