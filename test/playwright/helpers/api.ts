import type { APIResponse, Response } from '@playwright/test';

/** Portal UI routes and versioned API routes use different response envelopes. */
export async function apiData<T>(response: APIResponse | Response): Promise<T> {
  const body = await response.json() as T | { data: T };
  return body && typeof body === 'object' && 'data' in body ? body.data : body as T;
}
