import axios, { type AxiosRequestConfig } from 'axios';
import type { IntegrationConnectionResult, IntegrationKey } from '../api-routes/groups/appconfig';
import { resolveFigshareConnectionToken, type FigsharePublishingConfigData } from '../configmodels/FigsharePublishing';
import type { DoiPublishingConfigData } from '../configmodels/DoiPublishing';
import type { RaidPublishingConfigData } from '../configmodels/RaidPublishing';
import type { OniPublishingConfigData } from '../configmodels/OniPublishing';
import { figshareConnectionOptions } from './figshare-v2/connection';
import { doiConnectionOptions, doiConnectionPassword } from './doi-v2/connection';
import { raidConnectionOptions, raidOAuthRequest } from './raid-v2/connection';
import { oniIngestionHeaders, oniIndexStatusUrl } from './oni-v2/connection';

const messages: Record<IntegrationConnectionResult['status'], string> = {
  ok: 'Connection OK',
  auth_failed: 'Authentication failed. Check the credentials and service account permissions.',
  unreachable: 'Service could not be reached. Check the base URL, DNS and network access.',
  timeout: 'Connection timed out. Check network access and the service availability.',
  tls_error: 'TLS verification failed. Check the service certificate and the server trust configuration.',
  misconfigured: 'Connection settings are incomplete or invalid. Check the base URL and required credentials.',
  unexpected_response: 'The service returned an unexpected response. Check the API base URL and service availability. Redirects are not followed.',
};

/** Only configured HTTP(S) origins, no URL credentials, fragments, queries or redirects. */
function configuredUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) throw new Error('configuration');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('configuration');
  return url;
}
function credential(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 16384 && !/[\r\n]/.test(value)
    && !['__CLEAR_SECRET__', '__REDACTED__'].includes(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requestTimeout(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, 10000) : 10000;
}

/** No publication clients, retries, token caches, audits, raw error logging or response forwarding. */
export async function testIntegrationConnection(key: IntegrationKey, config: unknown): Promise<IntegrationConnectionResult> {
  const started = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let httpStatus: number | undefined;
  let configured = false;
  let reachabilityOnly = false;
  const result = (status: IntegrationConnectionResult['status']): IntegrationConnectionResult => ({
    ok: status === 'ok', status, ...(httpStatus === undefined ? {} : { httpStatus }),
    latencyMs: Math.max(0, Date.now() - started),
    message: status === 'ok' && reachabilityOnly
      ? 'Site reachable. Authentication and storage access were not tested because ingestion is not enabled.' : messages[status],
  });
  const send = async (base: string, path: string, options: AxiosRequestConfig = {}) => {
    const origin = configuredUrl(base);
    const target = new URL(`${base.replace(/\/+$/, '')}${path}`);
    if (target.origin !== origin.origin) throw new Error('configuration');
    httpStatus = undefined;
    const response = await axios.request({
      ...options, url: target.href, method: options.method ?? 'get',
      timeout: requestTimeout(options.timeout), signal: controller.signal,
      maxRedirects: 0, maxContentLength: 256 * 1024, maxBodyLength: 32 * 1024,
      // Keep service responses local. Never attach an Axios error to the public result.
      validateStatus: () => true,
    });
    httpStatus = response.status;
    if (httpStatus === 401 || httpStatus === 403) throw new Error('auth');
    if (httpStatus < 200 || httpStatus >= 300) throw new Error('response');
    return response.data as unknown;
  };
  const run = async () => {
    if (!object(config)) throw new Error('configuration');
    if (key === 'oniPublishing') {
      const oni = config as unknown as OniPublishingConfigData;
      const site = oni.sites?.[oni.defaultSite];
      if (!site || site.enabled !== true) throw new Error('configuration');
      const ingestion = site.ingestion;
      if (ingestion?.enabled === true) {
        configuredUrl(ingestion.apiUrl);
        if (!credential(ingestion.adminToken)) throw new Error('configuration');
        configured = true;
        const path = oniIndexStatusUrl(ingestion, 'structural').slice(ingestion.apiUrl.replace(/\/+$/, '').length);
        const body = await send(ingestion.apiUrl, path, { headers: oniIngestionHeaders(ingestion), timeout: ingestion.timeoutMs });
        if (!object(body) || !['state', 'count', 'isIndexed', 'isIndexing', 'isDeleting'].some(field => field in body)) throw new Error('response');
      } else {
        configuredUrl(site.publicUrl);
        configured = true;
        reachabilityOnly = true;
        await send(site.publicUrl, '');
      }
      return;
    }
    const rawConnection = config.connection;
    if (!object(rawConnection)) throw new Error('configuration');
    const connection = { ...rawConnection };
    const base = configuredUrl(connection.baseUrl).href.replace(/\/+$/, '');
    if (key === 'figsharePublishing') {
      connection.token = resolveFigshareConnectionToken(connection.token as string);
      if (!credential(connection.token)) throw new Error('configuration');
      configured = true;
      const body = await send(base, '/account', figshareConnectionOptions(connection as unknown as FigsharePublishingConfigData['connection']));
      if (!object(body) || !(typeof body.id === 'number' || typeof body.id === 'string')) throw new Error('response');
    } else if (key === 'doiPublishing') {
      connection.password = doiConnectionPassword(connection.password as string);
      if (!credential(connection.username) || !credential(connection.password)) throw new Error('configuration');
      configured = true;
      const body = await send(base, `/clients/${encodeURIComponent(connection.username)}`, doiConnectionOptions(connection as unknown as DoiPublishingConfigData['connection']));
      if (!object(body) || !object(body.data) || body.data.type !== 'clients' || typeof body.data.id !== 'string') throw new Error('response');
    } else {
      const raid = connection as unknown as RaidPublishingConfigData['connection'];
      let token = raid.token;
      if (!credential(token)) {
        const oauth = raid.oauth;
        if (!oauth || !credential(oauth.username) || !credential(oauth.password) || !credential(oauth.clientId)) throw new Error('configuration');
        // OAuth is a separately configured endpoint; neither endpoint may redirect.
        configuredUrl(oauth.url);
        configured = true;
        const request = raidOAuthRequest(oauth);
        const body = await send(request.url, '', { ...request, method: 'post' });
        if (!object(body) || !credential(body.access_token)) throw new Error('response');
        token = body.access_token;
      }
      configured = true;
      const body = await send(base, '/service-point/', raidConnectionOptions(raid, token));
      if (!Array.isArray(body)) throw new Error('response');
    }
  };
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, 10000);
    });
    await Promise.race([run(), deadline]);
    return result('ok');
  } catch (error) {
    const failure = error as { code?: string; message?: string; cause?: { code?: string } };
    const code = failure.code ?? failure.cause?.code ?? '';
    if (failure.message === 'auth') return result('auth_failed');
    if (failure.message === 'deadline' || ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(code)) return result('timeout');
    if (!configured || failure.message === 'configuration') return result('misconfigured');
    if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(code)) return result('tls_error');
    if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'].includes(code)) return result('unreachable');
    return result('unexpected_response');
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
