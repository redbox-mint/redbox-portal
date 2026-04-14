import axios, { AxiosError } from 'axios';
import { Context, Layer } from 'effect';
import type { ResolvedDoiPublishingConfigData, DoiHttpResult, DoiRunContext } from './types';

export class DoiHttpError extends Error {
  statusCode?: number;
  responseBody?: unknown;

  constructor(message: string, options: { statusCode?: number; responseBody?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'DoiHttpError';
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody;
    if (options.cause != null) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface DoiClient {
  createDoi(payload: Record<string, unknown>): Promise<DoiHttpResult>;
  updateDoi(doi: string, payload: Record<string, unknown>): Promise<DoiHttpResult>;
  deleteDoi(doi: string): Promise<DoiHttpResult>;
  changeDoiState(doi: string, event: string): Promise<DoiHttpResult>;
}

export const DoiClientTag = Context.GenericTag<DoiClient>('redbox/DoiClient');

function getRetryDelay(baseDelayMs: number, maxDelayMs: number, attempt: number): number {
  const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  return delay + Math.floor(Math.random() * Math.min(250, Math.max(1, baseDelayMs)));
}

async function requestWithRetry(
  config: ResolvedDoiPublishingConfigData,
  _runContext: DoiRunContext,
  method: string,
  path: string,
  payload?: Record<string, unknown>
): Promise<DoiHttpResult> {
  const retryConfig = config.connection.retry;
  const methodLower = method.toLowerCase();
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      const response = await axios({
        method,
        url: `${config.connection.baseUrl.replace(/\/+$/, '')}${path}`,
        timeout: config.connection.timeoutMs,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.connection.username}:${config.connection.password}`).toString('base64')}`,
          'Content-Type': 'application/vnd.api+json'
        },
        data: payload
      });
      return { statusCode: response.status, data: response.data as Record<string, unknown> };
    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const retryableMethod = retryConfig.retryOnMethods.map(item => item.toLowerCase()).includes(methodLower);
      const retryableStatus = statusCode == null || retryConfig.retryOnStatusCodes.includes(statusCode);
      if (attempt >= retryConfig.maxAttempts || !retryableMethod || !retryableStatus) {
        throw new DoiHttpError(`DOI HTTP request failed for ${method} ${path}`, {
          statusCode,
          responseBody: axiosError.response?.data,
          cause: error
        });
      }
      await new Promise(resolve => setTimeout(resolve, getRetryDelay(retryConfig.baseDelayMs, retryConfig.maxDelayMs, attempt)));
    }
  }
  throw new DoiHttpError(`DOI HTTP request failed for ${method} ${path}`);
}

export function makeLiveClient(config: ResolvedDoiPublishingConfigData, runContext: DoiRunContext): DoiClient {
  return {
    createDoi(payload) {
      return requestWithRetry(config, runContext, 'post', '/dois', payload);
    },
    updateDoi(doi, payload) {
      return requestWithRetry(config, runContext, 'patch', `/dois/${encodeURIComponent(doi)}`, payload);
    },
    deleteDoi(doi) {
      return requestWithRetry(config, runContext, 'delete', `/dois/${encodeURIComponent(doi)}`);
    },
    changeDoiState(doi, event) {
      return requestWithRetry(config, runContext, 'put', `/dois/${encodeURIComponent(doi)}`, {
        data: {
          type: 'dois',
          attributes: { event }
        }
      });
    }
  };
}

export function makeClientLayer(config: ResolvedDoiPublishingConfigData, runContext: DoiRunContext) {
  return Layer.succeed(DoiClientTag, makeLiveClient(config, runContext));
}
