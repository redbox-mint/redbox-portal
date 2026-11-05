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
    responses: {
      200: responseField(appConfigValueSchema, 'App config saved'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

// Drafts replace this configuration in memory; omitted fields retain legacy defaults.
// Do not trim or lowercase rules: doing so would disagree with the sign-in gate.
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
  description: 'Session CSRF protected. Tests the current route brand configuration, or the optional draft as a complete replacement without saving. Email must be valid and at most 254 characters; each of the four draft lists accepts at most 500 strings of 254 characters. Both providers lowercase incoming addresses, then match stored rules case-sensitively. Domains match exactly (no subdomains). Empty lists for the selected provider allow all. Domain rules take precedence over exact email rules. disabled means restriction off; unrestricted means empty provider lists; denied means no rule matched. This is the account-creation restriction check, not a guarantee of authentication or existing-account access. No tested address or matched rule is logged by the tester.',
  responses: {
    200: responseField(authorizedEmailTestResult, 'Allowed/denied, reason and matching rule when applicable'),
    400: badRequestResponse,
    403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
  },
});

export const appConfigApiRoutes = [testAuthorizedEmailRoute, getAppConfigByIdRoute, saveAppConfigByIdRoute];
