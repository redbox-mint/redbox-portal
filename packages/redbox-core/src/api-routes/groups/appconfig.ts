import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, appConfigValueSchema, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const getAppConfigByIdRoute = apiRoute(
  'get',
  '/:branding/:portal/api/appconfig/:appConfigId',
  'webservice/AppConfigController',
  'getAppConfig',
  { params: objectField({ appConfigId: stringField() }, ['appConfigId']) },
  {
    tags: ['AppConfig'],
    summary: 'Get app config',
    responses: {
      200: responseField(appConfigValueSchema, 'App config'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const saveAppConfigByIdRoute = apiRoute(
  'post',
  '/:branding/:portal/api/appconfig/:appConfigId',
  'webservice/AppConfigController',
  'saveAppConfig',
  {
    params: objectField({ appConfigId: stringField() }, ['appConfigId']),
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'App config payload', true) } },
    },
  },
  {
    tags: ['AppConfig'],
    summary: 'Save app config',
    description: 'Authorized domain/email rules are trimmed, lowercased and de-duplicated within each list on save; domain rules also ignore a trailing dot. The response retains the submitted payload shape; subsequent reads return normalized rules.',
    responses: {
      200: responseField(appConfigValueSchema, 'App config saved'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

// Drafts replace this configuration in memory; omitted fields retain legacy defaults.
// Keep drafts intact; the shared sign-in matcher normalizes both sides during evaluation.
const rules = z.array(z.string().max(254)).max(500);
export const authorizedEmailTestBody = z.object({
  email: z.email().max(254),
  provider: z.enum(['aaf', 'oidc']),
  draft: z.object({
    enabled: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    domainsAaf: rules.optional(),
    emailsAaf: rules.optional(),
    domainsOidc: rules.optional(),
    emailsOidc: rules.optional(),
  }).strict().optional(),
}).strict();
export const authorizedEmailTestResult = z.object({
  allowed: z.boolean(),
  reason: z.enum(['missing-email', 'invalid-address', 'disabled', 'unsupported-provider',
    'unrestricted', 'allowed-domain', 'allowed-exception', 'denied']),
  matchedRule: z.string().optional(),
});
export const testAuthorizedEmailRoute = defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/admin/appconfig/authorizedDomainsEmails/test',
  controller: 'AppConfigController',
  action: 'testAuthorizedEmail',
  csrf: true,
  request: {
    headers: z.object({ 'x-csrf-token': z.string().optional() }),
    body: { required: true, content: { 'application/json': { schema: authorizedEmailTestBody } } },
  },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['AppConfig'],
  summary: 'Test an address against authorized domains and emails (brand Admin only)',
  description: 'Session CSRF protected. Tests the current route brand configuration, or the optional draft as a complete replacement without saving. Email must be valid and at most 254 characters; each of the four draft lists accepts at most 500 strings of 254 characters. Both providers match addresses and rules ignoring letter case and surrounding whitespace; domains also ignore a trailing dot. Domains match exactly (no subdomains). Empty lists for the selected provider allow all. Domain rules take precedence over exact email rules. disabled means restriction off; unrestricted means empty provider lists; denied means no rule matched. This is the account-creation restriction check, not a guarantee of authentication or existing-account access. No tested address or matched rule is logged by the tester.',
  responses: {
    200: responseField(authorizedEmailTestResult, 'Allowed/denied, reason and matching rule when applicable'),
    400: badRequestResponse,
    403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
  },
});

export const resetAppConfigBody = z.object({}).strict();
export const resetAppConfigRoute = defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/admin/appconfig/:appConfigId/reset',
  controller: 'AppConfigController',
  action: 'resetAppConfig',
  csrf: true,
  request: {
    params: z.object({ appConfigId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).max(100) }),
    headers: z.object({ 'x-csrf-token': z.string().optional() }),
    body: { required: true, content: { 'application/json': { schema: resetAppConfigBody } } },
  },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['AppConfig'],
  summary: 'Reset a registered app config to defaults (brand Admin only)',
  description: 'Session CSRF protected. Deletes all saved overrides for the route brand and key, and immediately refreshes that entry in the runtime configuration cache. Uses brandingConfigurationDefaults over model defaults. Other brands and keys are unchanged. An absent override succeeds with reset false. Retired dashboard keys cannot be reset. External secret objects are retained; only the AppConfig override is deleted.',
  responses: {
    200: responseField(z.object({ reset: z.boolean() }), 'Whether a saved override was removed'),
    400: badRequestResponse,
    403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
    410: responseField(apiErrorResponseSchema, 'Retired configuration key'),
    500: internalServerErrorResponse,
  },
});



export const integrationKeySchema = z.enum(['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing']);
export type IntegrationKey = z.infer<typeof integrationKeySchema>;

// Only JSON drafts, bounded before recursive validation. Never accept external secret references.
const connectionDraftSchema = z.preprocess((draft, ctx) => {
  let nodes = 0;
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > 15000 || depth > 30) return false;
    if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(item => visit(item, depth + 1));
    if (typeof value !== 'object') return false;
    return Object.entries(value).every(([key, child]) => !['__proto__', 'constructor', 'prototype', '$appConfigSecret'].includes(key) && visit(child, depth + 1));
  };
  if (!visit(draft, 0) || Buffer.byteLength(JSON.stringify(draft), 'utf8') > 256 * 1024) {
    ctx.addIssue({ code: 'custom', message: 'Invalid or oversized connection draft' });
    return z.NEVER;
  }
  return draft;
}, z.record(z.string(), z.unknown()));
export const integrationConnectionBody = z.object({ draft: connectionDraftSchema.optional() }).strict();
export const integrationConnectionResult = z.object({
  ok: z.boolean(),
  status: z.enum(['ok', 'auth_failed', 'unreachable', 'timeout', 'tls_error', 'misconfigured', 'unexpected_response']),
  httpStatus: z.number().int().min(100).max(599).optional(),
  latencyMs: z.number().int().nonnegative(),
  message: z.string(),
});
export type IntegrationConnectionResult = z.infer<typeof integrationConnectionResult>;
export const testIntegrationConnectionRoute = defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/admin/appconfig/:integration/test-connection',
  controller: 'AppConfigController',
  action: 'testConnection',
  csrf: true,
  request: {
    params: z.object({ integration: integrationKeySchema }),
    headers: z.object({ 'x-csrf-token': z.string().optional() }),
    body: { required: true, content: { 'application/json': { schema: integrationConnectionBody } } },
  },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['AppConfig'],
  summary: 'Test integration connectivity and authentication (brand Admin only)',
  description: 'Session CSRF protected. Merges an optional unsaved JSON form draft over the route brand runtime config without persistence. Blank or masked secret fields retain stored values; the explicit clear marker tests without that secret. Drafts are limited to 256 KiB, 30 nesting levels and 15000 nodes. Only configured HTTP(S) base URLs and the configured RAiD OAuth URL are called; URL credentials, queries and fragments are rejected, and no redirects are followed. Shares publishing HTTP auth, TLS trust and timeouts, capped by a ten-second total deadline. Figshare GET /account, DataCite GET /clients/{username}, RAiD password-grant token acquisition when no static token then GET /service-point/, Oni default enabled site GET /admin/index/structural when ingestion enabled, otherwise public URL reachability only (not authentication or storage). No publishing, minting, indexing, config writes, token caching or upstream response/error logging. 200 includes safe diagnostic statuses; HTTP status refers to the upstream response when available. Per-process limit: one attempt per authenticated user and brand every five seconds, shared across integrations. 429 includes Retry-After. Credentials and upstream bodies are never returned.',
  responses: {
    200: responseField(integrationConnectionResult, 'Safe connection result'),
    400: badRequestResponse,
    403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
    429: { ...responseField(integrationConnectionResult, 'Rate limited; retry after five seconds'), headers: { 'Retry-After': z.string() } },
  },
});

export const appConfigApiRoutes = [testIntegrationConnectionRoute, resetAppConfigRoute, testAuthorizedEmailRoute, getAppConfigByIdRoute, saveAppConfigByIdRoute];
