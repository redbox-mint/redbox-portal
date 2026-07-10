import axios, { AxiosError } from 'axios';
import { Configuration, RaidApi, type RaidCreateRequest } from '@researchdatabox/raido-openapi-generated-node';
import { Effect, Layer } from 'effect';
import { RaidAuthenticationError, RaidHttpError } from './errors';
import { RaidConfigTag, RaidHttpClientTag, RaidRunContextTag } from './tags';

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();

function interruptibleRequest<A, E>(run: (signal: AbortSignal) => Promise<A>, mapError: (error: unknown) => E): Effect.Effect<A, E> {
  return Effect.async<A, E>(resume => {
    const controller = new AbortController();
    run(controller.signal).then(
      value => resume(Effect.succeed(value)),
      error => resume(Effect.fail(mapError(error)))
    );
    return Effect.sync(() => controller.abort());
  });
}

function retryableStatus(status: number | undefined, configured: number[]): boolean {
  return status == null || configured.includes(status) || status >= 500;
}

export function makeHttpLayer() {
  return Layer.effect(RaidHttpClientTag, Effect.gen(function* () {
    const config = yield* RaidConfigTag;
    const runContext = yield* RaidRunContextTag;
    const cacheKey = `${runContext.brandId}:${config.connection.baseUrl}:${config.connection.oauth.username}`;

    const fetchToken = (forceRefresh = false): Effect.Effect<string, RaidAuthenticationError> => Effect.gen(function* () {
      if (config.connection.token.trim()) return config.connection.token;
      const cached = tokenCache.get(cacheKey);
      if (!forceRefresh && cached && Date.now() < cached.expiresAt) return cached.token;
      const oauth = config.connection.oauth;
      if (!oauth.url || !oauth.username || !oauth.password) {
        return yield* Effect.fail(new RaidAuthenticationError({ message: 'RAiD OAuth credentials are not configured', retryable: false }));
      }
      return yield* interruptibleRequest(async signal => {
        const response = await axios.post(oauth.url, new URLSearchParams({ grant_type: 'password', client_id: oauth.clientId, username: oauth.username, password: oauth.password }), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: oauth.timeoutMs + 5000, signal
        });
          const token = String(response.data?.access_token ?? '');
          if (!token) throw new Error('OAuth response did not contain access_token');
          tokenCache.set(cacheKey, { token, expiresAt: Date.now() + Math.max(0, Number(response.data?.expires_in ?? 0) * 1000 - oauth.expirySkewMs) });
          return token;
      }, cause => {
          const error = cause as AxiosError;
          const statusCode = error.response?.status;
          return new RaidAuthenticationError({ message: 'Failed to acquire RAiD OAuth token', statusCode, retryable: retryableStatus(statusCode, config.connection.retry.retryOnStatusCodes), cause });
      });
    });

    return {
      getToken: fetchToken,
      mint(request: RaidCreateRequest, token: string, _attempt: number) {
        return interruptibleRequest(async signal => {
          const api = new RaidApi(new Configuration({ basePath: config.connection.baseUrl, accessToken: token }));
          // The generated client forwards axios request options as the second argument.
          const mint = api.mintRaid.bind(api) as unknown as (value: RaidCreateRequest, options: { signal: AbortSignal; timeout: number }) => ReturnType<RaidApi['mintRaid']>;
          const response = await mint(request, { signal, timeout: config.connection.timeoutMs + 5000 });
          const body = response.data as unknown as Record<string, unknown>;
          return { statusCode: response.status, body, identifier: body.identifier as { id?: string } | undefined };
        }, cause => {
          const error = cause as AxiosError;
          const statusCode = error.response?.status ?? (cause as { statusCode?: number }).statusCode;
          const responseBody = error.response?.data ?? (cause as { body?: unknown }).body;
          return new RaidHttpError({
            message: `RAiD mint request failed${statusCode ? ` with status ${statusCode}` : ''}`,
            statusCode,
            responseBody,
            method: 'POST', path: '/raid',
            retryable: retryableStatus(statusCode, config.connection.retry.retryOnStatusCodes),
            cause
          });
        });
      }
    };
  }));
}

export function invalidateToken(configBrandKey: string): void {
  tokenCache.delete(configBrandKey);
}
