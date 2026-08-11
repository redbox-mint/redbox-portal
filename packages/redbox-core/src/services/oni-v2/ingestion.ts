import axios from 'axios';
import type { OniIngestionConfig } from '../../configmodels/OniPublishing';

export type OniIndexType = 'structural' | 'search';

export interface OniIndexState {
  state?: string;
  count?: number;
  isIndexed?: boolean;
  isIndexing?: boolean;
  isDeleting?: boolean;
}

export interface OniIngestionResult {
  structuralObjects: number;
  searchItems: number;
}

export interface OniIngestionHttpClient {
  post<T = unknown>(
    url: string,
    data?: unknown,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<{ data: T; status: number }>;
  get<T = unknown>(
    url: string,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<{ data: T; status: number }>;
}

type OniIngestionDependencies = {
  httpClient?: OniIngestionHttpClient;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

function normalizeApiUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function validateConfig(config: OniIngestionConfig): void {
  if (String(config.apiUrl ?? '').trim() === '') {
    throw new Error('Oni ingestion apiUrl is required');
  }
  if (String(config.adminToken ?? '').trim() === '') {
    throw new Error('Oni ingestion adminToken is required');
  }
  if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 1) {
    throw new Error('Oni ingestion pollIntervalMs must be greater than zero');
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < config.pollIntervalMs) {
    throw new Error('Oni ingestion timeoutMs must be at least pollIntervalMs');
  }
}

function timeoutError(type: OniIndexType, timeoutMs: number): Error {
  return new Error(`Timed out waiting for Oni ${type} index to complete after ${timeoutMs}ms`);
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForIndex(
  type: OniIndexType,
  config: OniIngestionConfig,
  client: OniIngestionHttpClient,
  headers: Record<string, string>,
  delay: (milliseconds: number) => Promise<void>,
  now: () => number,
  deadline: number
): Promise<OniIndexState> {
  const statusUrl = `${normalizeApiUrl(config.apiUrl)}/admin/index/${type}`;

  while (now() < deadline) {
    await delay(Math.min(config.pollIntervalMs, deadline - now()));
    if (now() >= deadline) {
      break;
    }
    try {
      const response = await client.get<OniIndexState>(statusUrl, {
        headers,
        timeout: Math.min(deadline - now(), 15_000),
      });
      const state = response.data ?? {};
      if (state.isDeleting || state.isIndexing) {
        continue;
      }
      if (state.isIndexed && Number(state.count ?? 0) > 0) {
        return state;
      }
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) {
        throw error;
      }
    }
  }

  throw timeoutError(type, config.timeoutMs);
}

async function rebuildIndex(
  type: OniIndexType,
  config: OniIngestionConfig,
  client: OniIngestionHttpClient,
  headers: Record<string, string>,
  dependencies: Required<Pick<OniIngestionDependencies, 'delay' | 'now'>>,
  deadline: number
): Promise<OniIndexState> {
  const remainingMs = deadline - dependencies.now();
  if (remainingMs <= 0) {
    throw timeoutError(type, config.timeoutMs);
  }
  const forceQuery = config.forceReindex ? '?force=true' : '';
  const url = `${normalizeApiUrl(config.apiUrl)}/admin/index/${type}${forceQuery}`;
  await client.post(url, undefined, {
    headers,
    timeout: Math.min(remainingMs, 15_000),
  });
  return waitForIndex(type, config, client, headers, dependencies.delay, dependencies.now, deadline);
}

export async function ingestOniRepository(
  config: OniIngestionConfig,
  dependencies: OniIngestionDependencies = {}
): Promise<OniIngestionResult> {
  validateConfig(config);
  const client = dependencies.httpClient ?? (axios as unknown as OniIngestionHttpClient);
  const headers = {
    Authorization: `Bearer ${config.adminToken}`,
    Accept: 'application/json',
  };
  const runtimeDependencies = {
    delay: dependencies.delay ?? defaultDelay,
    now: dependencies.now ?? Date.now,
  };
  const deadline = runtimeDependencies.now() + config.timeoutMs;

  const structural = await rebuildIndex('structural', config, client, headers, runtimeDependencies, deadline);
  const search = await rebuildIndex('search', config, client, headers, runtimeDependencies, deadline);

  return {
    structuralObjects: Number(structural.count ?? 0),
    searchItems: Number(search.count ?? 0),
  };
}
