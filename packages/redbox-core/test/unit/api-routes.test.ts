import SwaggerParser from '@apidevtools/swagger-parser';
import {
  ApiRouteDefinition,
  buildApiBlueprint,
  buildCoreApiRouteConfig,
  buildCoreApiOpenApiDocument,
  buildMergedApiRouteConfig,
  buildMergedApiBlueprint,
  buildMergedApiOpenApiDocument,
  buildOpenApiDocument,
  buildSailsRouteConfig,
  extractApiRequest,
  getMergedApiRoutes,
  searchRecordsRoute,
  toRouteMap,
  validateApiRequest,
  validateApiRouteRequest,
} from '../../src/api-routes';
import { apiRoute } from '../../src/api-routes/route-factory';
import {
  anyField,
  apiActionResponseSchema,
  apiErrorResponseSchema,
  apiHarvestResponseSchema,
  apiObjectActionResponseSchema,
  buildResponseTypeSchema,
  createUserApiResponseSchema,
  dataResponseV2Schema,
  errorResponseItemV2Schema,
  errorResponseV2Schema,
  listApiResponseSchema,
  storageServiceResponseSchema,
  userApiTokenApiResponseSchema,
} from '../../src/api-routes/schemas/common';
import { getFormRoute, listFormsRoute } from '../../src/api-routes/groups/forms';
import { sendNotificationRoute } from '../../src/api-routes/groups/notifications';
import { executeNamedQueryRoute } from '../../src/api-routes/groups/reports';
import { downloadRecsRoute } from '../../src/api-routes/groups/export';
import { getRecordTypeRoute, listRecordTypesRoute } from '../../src/api-routes/groups/recordtypes';
import {
  getAppConfigByKeyRoute,
  listAppConfigsRoute,
  refreshCachedResourcesRoute,
  setAppConfigRoute,
} from '../../src/api-routes/groups/admin';
import { getAppConfigByIdRoute, saveAppConfigByIdRoute } from '../../src/api-routes/groups/appconfig';
import { brandingApiRoutes } from '../../src/api-routes/groups/branding';
import { listRecordsRoute, updateMetaRoute } from '../../src/api-routes/groups/records';
import { objectField, stringField } from '../../src/api-routes/schemas/common';

let expect: Chai.ExpectStatic;
import('chai').then((mod) => expect = mod.expect);

type OpenApiSchema = {
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  headers?: Record<string, unknown>;
  content?: Record<string, { schema?: OpenApiSchema }>;
  required?: string[];
  type?: string;
  format?: string;
  style?: string;
  explode?: boolean;
  description?: string;
  [key: string]: unknown;
};

type OpenApiOperation = {
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: OpenApiSchema }>; headers?: Record<string, unknown> }>;
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  parameters?: Array<OpenApiParameter>;
  summary?: string;
  description?: string;
};

type OpenApiParameter = {
  name?: string;
  style?: string;
  explode?: boolean;
  schema?: OpenApiSchema;
  description?: string;
};

const asOpenApiSchema = (value: unknown): OpenApiSchema => value as OpenApiSchema;
const asOpenApiOperation = (value: unknown): OpenApiOperation => value as OpenApiOperation;

function collectEmptyRequiredArrayPaths(value: unknown, path = '#', results: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEmptyRequiredArrayPaths(entry, `${path}/${index}`, results));
    return results;
  }

  if (value === null || typeof value !== 'object') {
    return results;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.required) && record.required.length === 0) {
    results.push(`${path}/required`);
  }

  for (const [key, entry] of Object.entries(record)) {
    collectEmptyRequiredArrayPaths(entry, `${path}/${key}`, results);
  }

  return results;
}

function responseStatuses(route: { responses?: Record<number, unknown> }): number[] {
  return Object.keys(route.responses ?? {})
    .map(status => Number(status))
    .sort((left, right) => left - right);
}

describe('API routes contract layer', async () => {
  it('should specialize the OpenAPI paths for the requested branding and portal', async function () {
    const document = buildCoreApiOpenApiDocument({ branding: 'default', portal: 'rdmp' });

    expect(document.paths).to.have.property('/default/rdmp/api/users');
    expect(document.paths).to.not.have.property('/{branding}/{portal}/api/users');

    const listUsersRoute = document.paths['/default/rdmp/api/users']?.get as globalThis.Record<string, unknown>;
    const pathParameters = (listUsersRoute.parameters as Array<globalThis.Record<string, unknown>>) ?? [];

    expect(pathParameters.some((parameter) => parameter.name === 'branding')).to.equal(false);
    expect(pathParameters.some((parameter) => parameter.name === 'portal')).to.equal(false);
  });

  it('should include x-redbox-roles from the default auth rules in OpenAPI', function () {
    const document = buildCoreApiOpenApiDocument();
    const operation = document.paths['/{branding}/{portal}/api/users']?.get as Record<string, unknown>;

    expect(operation['x-redbox-roles']).to.deep.equal(['Admin']);
  });

  it('should derive x-redbox-roles from runtime auth rules', function () {
    const globalWithSails = globalThis as typeof globalThis & {
      sails?: { config?: Record<string, unknown> };
    };
    const previousSails = globalWithSails.sails;
    globalWithSails.sails = {
      config: {
        auth: {
          rules: [
            { path: '/:branding/:portal/api/custom', role: 'Readers', can_read: true },
            { path: '/:branding/:portal/api/custom', role: 'Editors', can_update: true },
          ],
        },
      },
    };

    try {
      const customRoute = apiRoute('get', '/:branding/:portal/api/custom', 'webservice/CustomController', 'show');

      expect(customRoute.extensions?.['x-redbox-roles']).to.deep.equal(['Readers', 'Editors']);

      const document = buildOpenApiDocument([customRoute], { title: 'Custom API', version: '1.0.0' });
      const operation = document.paths['/{branding}/{portal}/api/custom']?.get as Record<string, unknown>;

      expect(operation['x-redbox-roles']).to.deep.equal(['Readers', 'Editors']);
    } finally {
      if (previousSails === undefined) {
        delete globalWithSails.sails;
      } else {
        globalWithSails.sails = previousSails;
      }
    }
  });

  it('should document bearer auth only in OpenAPI', function () {
    const document = buildCoreApiOpenApiDocument();

    expect(document.components.securitySchemes).to.have.property('bearerAuth');
    expect(document.components.securitySchemes).to.not.have.property('cookieAuth');

    const operation = document.paths['/{branding}/{portal}/api/users']?.get as Record<string, unknown>;
    expect(operation.security).to.deep.equal([{ bearerAuth: [] }]);
  });

  it('should include hook-contributed routes in merged docs', function () {
    const hookRoute: ApiRouteDefinition = {
      method: 'get',
      path: '/:branding/:portal/api/hooks/example',
      controller: 'hook/ExampleController',
      action: 'show',
      summary: 'Hook example route',
    };

    const globalWithSails = globalThis as typeof globalThis & {
      sails?: { config?: Record<string, unknown> };
    };
    const previousSails = globalWithSails.sails;
    const sailsConfig: Record<string, unknown> = {
      apiRoutesHooks: [() => [hookRoute]],
    };
    globalWithSails.sails = {
      config: sailsConfig,
    };

    try {
      const mergedRouteConfig = buildMergedApiRouteConfig();
      sailsConfig.routes = mergedRouteConfig;

      const mergedDocument = buildMergedApiOpenApiDocument({ branding: 'default', portal: 'rdmp' });
      expect(mergedDocument.paths).to.have.property('/default/rdmp/api/hooks/example');
      expect((mergedDocument.paths['/default/rdmp/api/hooks/example']?.get as Record<string, unknown>)?.summary).to.equal('Hook example route');

      const coreDocument = buildCoreApiOpenApiDocument({ branding: 'default', portal: 'rdmp' });
      expect(coreDocument.paths).to.not.have.property('/default/rdmp/api/hooks/example');

      const blueprint = buildMergedApiBlueprint({ branding: 'default', portal: 'rdmp' });
      expect(blueprint).to.include('GET /default/rdmp/api/hooks/example');
      expect(blueprint).to.include('+ Summary: Hook example route');
    } finally {
      if (previousSails === undefined) {
        delete globalWithSails.sails;
      } else {
        globalWithSails.sails = previousSails;
      }
    }
  });

  it('should fail when the merged runtime route table includes an uncontracted legacy API route', function () {
    const globalWithSails = globalThis as typeof globalThis & {
      sails?: { config?: Record<string, unknown> };
    };
    const previousSails = globalWithSails.sails;
    const runtimeRoutes: Record<string, unknown> = {
      ...buildCoreApiRouteConfig(),
      '/:branding/:portal/api/hooks/legacy': {
        controller: 'hook/LegacyController',
        action: 'show',
      },
    };

    globalWithSails.sails = {
      config: {
        apiRoutesHooks: [],
        routes: runtimeRoutes,
      },
    };

    try {
      expect(() => getMergedApiRoutes()).to.throw('Legacy API route in merged runtime route table must declare an HTTP method');
      expect(() => buildMergedApiRouteConfig()).to.throw('Legacy API route in merged runtime route table must declare an HTTP method');
    } finally {
      if (previousSails === undefined) {
        delete globalWithSails.sails;
      } else {
        globalWithSails.sails = previousSails;
      }
    }
  });

  it('should fail fast when duplicate method/path routes are built', function () {
    const duplicateRoutes: ApiRouteDefinition[] = [
      {
        method: 'get',
        path: '/api/duplicates',
        controller: 'duplicates/FirstController',
        action: 'show',
      },
      {
        method: 'get',
        path: '/api/duplicates',
        controller: 'duplicates/SecondController',
        action: 'show',
      },
    ];

    expect(() => toRouteMap(duplicateRoutes)).to.throw('Duplicate API route detected');
    expect(() => buildSailsRouteConfig(duplicateRoutes)).to.throw('Duplicate API route detected');
    expect(() => buildOpenApiDocument(duplicateRoutes, { title: 'Duplicate routes', version: '1.0.0' })).to.throw('Duplicate API route detected');
    expect(() => buildApiBlueprint(duplicateRoutes)).to.throw('Duplicate API route detected');
  });

  it('should order Sails routes by specificity', function () {
    const routeConfig = buildSailsRouteConfig([
      {
        method: 'get',
        path: '/api/widgets/:id*',
        controller: 'widgets/WildcardController',
        action: 'show',
      },
      {
        method: 'get',
        path: '/api/widgets/:id',
        controller: 'widgets/ParamController',
        action: 'show',
      },
      {
        method: 'get',
        path: '/api/widgets/static',
        controller: 'widgets/StaticController',
        action: 'show',
      },
    ]);

    expect(Object.keys(routeConfig)).to.deep.equal([
      'get /api/widgets/static',
      'get /api/widgets/:id',
      'get /api/widgets/:id*',
    ]);
  });

  it('should fail fast when a hook duplicates a core route', function () {
    const hookRoute: ApiRouteDefinition = {
      method: 'put',
      path: '/:branding/:portal/api/users',
      controller: 'hooks/DuplicateUsersController',
      action: 'create',
    };

    const globalWithSails = globalThis as typeof globalThis & {
      sails?: { config?: Record<string, unknown> };
    };
    const previousSails = globalWithSails.sails;
    globalWithSails.sails = {
      config: {
        apiRoutesHooks: [() => [hookRoute]],
      },
    };

    try {
      expect(() => getMergedApiRoutes()).to.throw('Duplicate API route detected');
      expect(() => buildMergedApiRouteConfig()).to.throw('Duplicate API route detected');
      expect(() => buildMergedApiOpenApiDocument({ branding: 'default', portal: 'rdmp' })).to.throw('Duplicate API route detected');
      expect(() => buildMergedApiBlueprint({ branding: 'default', portal: 'rdmp' })).to.throw('Duplicate API route detected');
    } finally {
      if (previousSails === undefined) {
        delete globalWithSails.sails;
      } else {
        globalWithSails.sails = previousSails;
      }
    }
  });

  it('should keep OpenAPI output standards-safe and exclude app-only translation routes', async function () {
    const document = buildCoreApiOpenApiDocument();
    const json = JSON.stringify(document);

    expect(json).to.not.include('"type":"any"');
    expect(document.paths).to.not.have.property('/{branding}/{portal}/app/i18n/bundles/{locale}/{namespace}/enabled');
  });

  it('should validate generated OpenAPI documents with swagger-parser', async function () {
    const document = buildMergedApiOpenApiDocument({ branding: 'default', portal: 'rdmp' });

    await SwaggerParser.validate(document as unknown as Parameters<typeof SwaggerParser.validate>[0]);
  });

  it('should not emit empty required arrays in OpenAPI schemas', function () {
    const document = buildCoreApiOpenApiDocument();
    const emptyRequiredArrayPaths = collectEmptyRequiredArrayPaths(document);

    expect(emptyRequiredArrayPaths).to.deep.equal([]);
  });

  it('should document wildcard translation keys as reserved path tails', function () {
    const document = buildCoreApiOpenApiDocument();
    const operation = document.paths['/{branding}/{portal}/api/i18n/entries/{locale}/{namespace}/{key}']?.get as globalThis.Record<string, unknown>;
    const parameters = (operation.parameters as Array<globalThis.Record<string, unknown>>) ?? [];
    const keyParameter = parameters.find(parameter => parameter.name === 'key');

    expect(operation.description).to.contain('slash-delimited segments');
    expect(keyParameter?.description).to.contain('slash-delimited segments');
    expect(keyParameter).to.not.have.property('allowReserved');
  });

  it('should document record creation as a 201 response with a Location header', async function () {
    const document = buildCoreApiOpenApiDocument();
    const route = document.paths['/{branding}/{portal}/api/records/metadata/{recordType}']?.post as globalThis.Record<string, unknown>;
    const responses = route.responses as globalThis.Record<string, globalThis.Record<string, unknown>>;
    const created = responses['201'];
    const createdSchema = (created.content as globalThis.Record<string, globalThis.Record<string, unknown>>)['application/json'].schema as globalThis.Record<string, unknown>;

    expect(created).to.exist;
    expect(createdSchema.properties).to.have.property('success');
    expect(createdSchema.properties).to.have.property('oid');
    expect(createdSchema.properties).to.have.property('message');
    expect(createdSchema.properties).to.have.property('metadata');
    expect(createdSchema.properties).to.have.property('totalItems');
    expect(createdSchema.properties).to.have.property('items');
    expect(created.headers).to.have.property('Location');
  });

  it('should model the legacy response envelopes', function () {
    expect(apiErrorResponseSchema.safeParse({ message: 'Boom', details: 'Something failed' }).success).to.equal(true);
    expect(apiActionResponseSchema.safeParse({ message: 'Done', details: '' }).success).to.equal(true);
    expect(apiObjectActionResponseSchema.safeParse({ oid: 'record-1', message: 'Queued', details: '' }).success).to.equal(true);
    expect(apiHarvestResponseSchema.safeParse({ harvestId: 'harvest-1', oid: 'record-1', message: 'Created', details: '', status: true }).success).to.equal(true);
    expect(storageServiceResponseSchema.safeParse({
      success: true,
      oid: 'record-1',
      message: 'Created',
      metadata: {},
      details: '',
      totalItems: 0,
      items: [],
    }).success).to.equal(true);
    expect(createUserApiResponseSchema.safeParse({ id: '1', username: 'user', name: 'User', email: 'user@example.org', type: 'local', lastLogin: null }).success).to.equal(true);
    expect(userApiTokenApiResponseSchema.safeParse({ id: '1', username: 'user', token: 'secret' }).success).to.equal(true);
    expect(listApiResponseSchema(anyField()).safeParse({ summary: { numFound: 1, page: 1, start: 0 }, records: [{ id: 1 }] }).success).to.equal(true);
    expect(errorResponseItemV2Schema.safeParse({ title: 'Validation failed', detail: 'Missing field' }).success).to.equal(true);
    expect(errorResponseV2Schema.safeParse({ errors: [{ title: 'Validation failed' }], meta: {} }).success).to.equal(true);
    expect(dataResponseV2Schema.safeParse({ data: { ok: true }, meta: {} }).success).to.equal(true);
    expect(buildResponseTypeSchema.safeParse({
      data: { ok: true },
      status: 200,
      headers: { 'X-Test': '1' },
      displayErrors: [{ title: 'Display issue' }],
      errors: [new Error('boom')],
      meta: {},
      v1: { ok: true },
    }).success).to.equal(true);
  });

  it('should document the shared response schemas in OpenAPI', function () {
    const document = buildCoreApiOpenApiDocument();

    const brandingDraftRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/branding/draft']?.post);
    const brandingDraftSchema = asOpenApiSchema(brandingDraftRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(brandingDraftSchema.properties).to.have.property('branding');

    const brandingPreviewRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/branding/preview']?.post);
    const brandingPreviewSchema = asOpenApiSchema(brandingPreviewRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(brandingPreviewSchema.properties).to.have.property('token');
    expect(brandingPreviewSchema.properties).to.have.property('previewToken');
    expect(brandingPreviewSchema.properties).to.have.property('branding');

    const createUserRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/users']?.put);
    const createUserSchema = asOpenApiSchema(createUserRoute.responses?.['201']?.content?.['application/json']?.schema);
    expect(createUserSchema.properties).to.have.property('username');
    expect(createUserSchema.properties).to.have.property('lastLogin');

    const listUsersRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/users']?.get);
    const listUsersSchema = asOpenApiSchema(listUsersRoute.responses?.['200']?.content?.['application/json']?.schema);
    const listUsersRecordsSchema = asOpenApiSchema(listUsersSchema.properties?.records);
    const listUsersItemSchema = asOpenApiSchema(listUsersRecordsSchema.items);
    expect(listUsersItemSchema.properties).to.have.property('username');
    expect(listUsersItemSchema.properties).to.have.property('roles');

    const searchIndexRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/search/index']?.get);
    const searchIndexSchema = asOpenApiSchema(searchIndexRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(searchIndexSchema.properties).to.have.property('oid');

    const searchRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/search']?.get);
    const searchSchema = asOpenApiSchema(searchRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(searchSchema.properties).to.have.property('records');
    expect(searchSchema.properties).to.have.property('totalItems');
    expect(asOpenApiSchema(searchSchema.properties?.records).items?.properties).to.have.property('hasEditAccess');

    const recordsListRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/records/list']?.get);
    const recordsListSchema = asOpenApiSchema(recordsListRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(recordsListSchema.properties).to.have.property('summary');
    expect(recordsListSchema.properties).to.have.property('records');
    expect(asOpenApiSchema(recordsListSchema.properties?.records).items?.properties).to.have.property('oid');
    expect(asOpenApiSchema(recordsListSchema.properties?.records).items?.properties).to.have.property('hasEditAccess');

    const brandingHistoryRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/branding/history']?.get);
    const brandingHistorySchema = asOpenApiSchema(brandingHistoryRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(asOpenApiSchema(brandingHistorySchema.items).properties).to.have.property('version');
    expect(asOpenApiSchema(brandingHistorySchema.items).properties).to.have.property('hash');

    const vocabularyGetRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/vocabulary/{id}']?.get);
    const vocabularyGetSchema = asOpenApiSchema(vocabularyGetRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(vocabularyGetSchema.properties).to.have.property('vocabulary');
    expect(vocabularyGetSchema.properties).to.have.property('entries');
    expect(asOpenApiSchema(vocabularyGetSchema.properties?.vocabulary).properties).to.have.property('name');
    expect(asOpenApiSchema(vocabularyGetSchema.properties?.entries).items?.properties).to.have.property('label');

    const translationListRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/i18n/entries']?.get);
    const translationListSchema = asOpenApiSchema(translationListRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(asOpenApiSchema(translationListSchema.items).properties).to.have.property('key');
    expect(asOpenApiSchema(translationListSchema.items).properties).to.have.property('value');

    const recordTypesListRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/recordtypes']?.get);
    const recordTypesListSchema = asOpenApiSchema(recordTypesListRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(asOpenApiSchema(recordTypesListSchema.properties?.records).items?.properties).to.have.property('name');
    expect(asOpenApiSchema(recordTypesListSchema.properties?.records).items?.properties).to.have.property('searchFilters');

    const reportRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/report/namedQuery']?.get);
    const reportSchema = asOpenApiSchema(reportRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(asOpenApiSchema(reportSchema.properties?.records).items?.properties).to.have.property('metadata');

    const harvestRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/records/harvest/{recordType}']?.post);
    const harvestSchema = asOpenApiSchema(harvestRoute.responses?.['200']?.content?.['application/json']?.schema);
    expect(harvestSchema.items?.properties).to.have.property('harvestId');
  });

  it('should include shared 400 and 500 error envelopes in OpenAPI', function () {
    const document = buildCoreApiOpenApiDocument();
    const operation = asOpenApiOperation(document.paths['/{branding}/{portal}/api/users']?.get);

    const badRequest = operation.responses?.['400'];
    const serverError = operation.responses?.['500'];
    const badRequestSchema = asOpenApiSchema(badRequest?.content?.['application/json']?.schema);
    const serverErrorSchema = asOpenApiSchema(serverError?.content?.['application/json']?.schema);

    expect(badRequest?.description).to.equal('Bad request');
    expect(serverError?.description).to.equal('Internal server error');
    expect(badRequestSchema.properties).to.have.property('message');
    expect(badRequestSchema.properties).to.have.property('details');
    expect(serverErrorSchema.properties).to.have.property('message');
    expect(serverErrorSchema.properties).to.have.property('details');
  });

  it('should document multipart file constraints in OpenAPI', function () {
    const document = buildCoreApiOpenApiDocument();
    const operation = asOpenApiOperation(document.paths['/{branding}/{portal}/api/branding/logo']?.post);
    const multipartSchema = asOpenApiSchema(operation.requestBody?.content?.['multipart/form-data']?.schema);
    const logoSchema = asOpenApiSchema(multipartSchema.properties?.logo);

    expect(multipartSchema.required).to.include('logo');
    expect(logoSchema.type).to.equal('string');
    expect(logoSchema.format).to.equal('binary');
    expect(logoSchema['x-maxBytes']).to.equal(512 * 1024);
    expect(logoSchema['x-mimeTypes']).to.deep.equal(['image/png', 'image/jpeg', 'image/svg+xml']);
  });

  it('should emit binary multipart file fields with constraints for upload routes', function () {
    const uploadRoute: ApiRouteDefinition = {
      method: 'post',
      path: '/:branding/:portal/api/uploads/logo',
      controller: 'webservice/UploadController',
      action: 'store',
      request: {
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: objectField(
                {
                  caption: stringField('Caption'),
                },
                ['caption']
              ),
            },
          },
        },
        files: {
          logo: {
            required: true,
            maxBytes: 2048,
            mimeTypes: ['image/png', 'image/jpeg'],
          },
        },
      },
      responses: {
        200: {
          description: 'Upload complete',
        },
      },
    };

    const document = buildOpenApiDocument([uploadRoute], { title: 'Upload API', version: '1.0.0' });
    const operation = asOpenApiOperation(document.paths['/{branding}/{portal}/api/uploads/logo']?.post);
    const multipartSchema = asOpenApiSchema(operation.requestBody?.content?.['multipart/form-data']?.schema);
    const logoSchema = asOpenApiSchema(multipartSchema.properties?.logo);

    expect(multipartSchema.required).to.include('caption');
    expect(multipartSchema.required).to.include('logo');
    expect(logoSchema.type).to.equal('string');
    expect(logoSchema.format).to.equal('binary');
    expect(logoSchema['x-maxBytes']).to.equal(2048);
    expect(logoSchema['x-mimeTypes']).to.deep.equal(['image/png', 'image/jpeg']);
  });

  it('should document explicit responses for the routes flagged by finding 4', function () {
    const document = buildCoreApiOpenApiDocument();
    const routeSpecs: Array<{ path: string; method: 'get' | 'post' | 'put' | 'delete' }> = [
      { path: '/{branding}/{portal}/api/records/datastreams/{oid}', method: 'post' },
      { path: '/{branding}/{portal}/api/records/datastreams/{oid}/{datastreamId}', method: 'get' },
      { path: '/{branding}/{portal}/api/search', method: 'get' },
      { path: '/{branding}/{portal}/api/forms/get', method: 'get' },
      { path: '/{branding}/{portal}/api/forms', method: 'get' },
      { path: '/{branding}/{portal}/api/vocabulary', method: 'post' },
      { path: '/{branding}/{portal}/api/vocabulary/import', method: 'post' },
      { path: '/{branding}/{portal}/api/vocabulary/{id}', method: 'get' },
      { path: '/{branding}/{portal}/api/vocabulary/{id}', method: 'put' },
      { path: '/{branding}/{portal}/api/vocabulary/{id}', method: 'delete' },
      { path: '/{branding}/{portal}/api/vocabulary/{id}/reorder', method: 'put' },
      { path: '/{branding}/{portal}/api/vocabulary/{id}/sync', method: 'post' },
      { path: '/{branding}/{portal}/api/recordtypes/get', method: 'get' },
      { path: '/{branding}/{portal}/api/admin/config/{configKey}', method: 'get' },
      { path: '/{branding}/{portal}/api/admin/config', method: 'get' },
      { path: '/{branding}/{portal}/api/appconfig/{appConfigId}', method: 'get' },
      { path: '/{branding}/{portal}/api/appconfig/{appConfigId}', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/draft', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/preview', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/publish', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/rollback/{versionId}', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/logo', method: 'post' },
      { path: '/{branding}/{portal}/api/branding/history', method: 'get' },
      { path: '/{branding}/{portal}/api/i18n/entries', method: 'get' },
      { path: '/{branding}/{portal}/api/i18n/entries/{locale}/{namespace}/{key}', method: 'get' },
      { path: '/{branding}/{portal}/api/i18n/entries/{locale}/{namespace}/{key}', method: 'post' },
      { path: '/{branding}/{portal}/api/i18n/bundles/{locale}/{namespace}', method: 'get' },
      { path: '/{branding}/{portal}/api/i18n/bundles/{locale}/{namespace}', method: 'post' },
      { path: '/{branding}/{portal}/api/report/namedQuery', method: 'get' },
      { path: '/{branding}/{portal}/api/export/record/download/{format}', method: 'get' },
      { path: '/{branding}/{portal}/api/sendNotification', method: 'post' },
    ];

    for (const { path, method } of routeSpecs) {
      const operation = document.paths[path]?.[method] as globalThis.Record<string, unknown> | undefined;
      const responses = operation?.responses as globalThis.Record<string, globalThis.Record<string, unknown>> | undefined;

      expect(responses, `${method.toUpperCase()} ${path}`).to.exist;
      expect(responses, `${method.toUpperCase()} ${path}`).to.not.deep.equal({ 200: { description: 'Success' } });

      const statusKeys = Object.keys(responses ?? {});
      const hasErrorResponse = statusKeys.some((status) => /^[45]\d\d$/.test(status));
      expect(hasErrorResponse, `${method.toUpperCase()} ${path} missing 4xx/5xx response`).to.equal(true);
    }
  });

  it('should declare explicit shared error responses on the leaf route groups', function () {
    expect(responseStatuses(getFormRoute)).to.deep.equal([200, 400, 404, 500]);
    expect(responseStatuses(listFormsRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(sendNotificationRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(executeNamedQueryRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(downloadRecsRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(getRecordTypeRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(listRecordTypesRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(refreshCachedResourcesRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(setAppConfigRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(getAppConfigByKeyRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(listAppConfigsRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(getAppConfigByIdRoute)).to.deep.equal([200, 400, 500]);
    expect(responseStatuses(saveAppConfigByIdRoute)).to.deep.equal([200, 400, 500]);

    const sendNotificationSchema = sendNotificationRoute.responses?.[200]?.content?.['application/json']?.schema;
    expect(sendNotificationSchema?.safeParse({ message: 'Sent', details: '' }).success).to.equal(true);

    const formNotFoundSchema = getFormRoute.responses?.[404]?.content?.['application/json']?.schema;
    expect(formNotFoundSchema?.safeParse({ message: 'Form not found', details: '' }).success).to.equal(true);
  });

  it('should document vocabulary creation as a 201 response', function () {
    const document = buildCoreApiOpenApiDocument();
    const operation = document.paths['/{branding}/{portal}/api/vocabulary']?.post as globalThis.Record<string, unknown>;
    const responses = operation.responses as globalThis.Record<string, globalThis.Record<string, unknown>>;

    expect(responses).to.have.property('201');
    expect(responses).to.not.have.property('200');
  });

  it('should document file-download response media types for export and datastream routes', function () {
    const document = buildCoreApiOpenApiDocument();

    const datastreamRoute = document.paths['/{branding}/{portal}/api/records/datastreams/{oid}/{datastreamId}']?.get as globalThis.Record<string, unknown>;
    const datastreamResponse = (datastreamRoute.responses as globalThis.Record<string, globalThis.Record<string, unknown>>)['200'];
    const datastreamContent = datastreamResponse.content as globalThis.Record<string, globalThis.Record<string, unknown>>;

    expect(datastreamContent).to.have.property('application/octet-stream');
    expect((datastreamContent['application/octet-stream'].schema as globalThis.Record<string, unknown>).format).to.equal('binary');
    expect(datastreamResponse.headers).to.have.property('Content-Disposition');

    const exportRoute = document.paths['/{branding}/{portal}/api/export/record/download/{format}']?.get as globalThis.Record<string, unknown>;
    const exportResponse = (exportRoute.responses as globalThis.Record<string, globalThis.Record<string, unknown>>)['200'];
    const exportContent = exportResponse.content as globalThis.Record<string, globalThis.Record<string, unknown>>;

    expect(exportContent).to.have.property('text/csv');
    expect(exportContent).to.have.property('text/json');
    expect((exportContent['text/csv'].schema as globalThis.Record<string, unknown>).format).to.equal('binary');
    expect(exportResponse.headers).to.have.property('Content-Disposition');
  });

  it('should document bracket-style search query maps as deepObject parameters', function () {
    const document = buildCoreApiOpenApiDocument();
    const searchRoute = asOpenApiOperation(document.paths['/{branding}/{portal}/api/search']?.get);
    const parameters = searchRoute.parameters ?? [];
    const exactNames = parameters.find((parameter) => parameter.name === 'exactNames');
    const facetNames = parameters.find((parameter) => parameter.name === 'facetNames');

    expect(exactNames?.style).to.equal('deepObject');
    expect(exactNames?.explode).to.equal(true);
    expect(asOpenApiSchema(exactNames?.schema).type).to.equal('object');
    expect(facetNames?.style).to.equal('deepObject');
    expect(facetNames?.explode).to.equal(true);
    expect(asOpenApiSchema(facetNames?.schema).type).to.equal('object');
  });

  it('should document update metadata and user audit response bodies', function () {
    const document = buildCoreApiOpenApiDocument();

    const updateMetaRoute = document.paths['/{branding}/{portal}/api/records/metadata/{oid}']?.put as globalThis.Record<string, unknown>;
    const updateMetaSchema = ((updateMetaRoute.responses as globalThis.Record<string, globalThis.Record<string, unknown>>)['200']
      .content as globalThis.Record<string, globalThis.Record<string, unknown>>)['application/json'].schema as globalThis.Record<string, unknown>;
    expect(updateMetaSchema.properties).to.have.property('success');
    expect(updateMetaSchema.properties).to.have.property('metadata');

    const userAuditRoute = document.paths['/{branding}/{portal}/api/users/{id}/audit']?.get as globalThis.Record<string, unknown>;
    const userAuditSchema = ((userAuditRoute.responses as globalThis.Record<string, globalThis.Record<string, unknown>>)['200']
      .content as globalThis.Record<string, globalThis.Record<string, unknown>>)['application/json'].schema as globalThis.Record<string, unknown>;
    expect(userAuditSchema.properties).to.have.property('user');
    expect(userAuditSchema.properties).to.have.property('records');
    expect(userAuditSchema.properties).to.have.property('summary');
  });

  it('should validate each request source independently', async function () {
    const request = {
      params: {},
      query: { id: 'query-id' },
      headers: {},
      body: { id: 'body-id' }
    } as unknown as Sails.Req;

    const extracted = extractApiRequest(request, {
      params: objectField({ id: stringField() }, ['id']),
      query: objectField({ id: stringField() }, ['id'])
    });

    expect(extracted.params.id).to.equal(undefined);
    expect(extracted.query.id).to.equal('query-id');

    const result = validateApiRequest(request, {
      params: objectField({ id: stringField() }, ['id']),
      query: objectField({ id: stringField() }, ['id'])
    });

    expect(result.valid).to.equal(false);
    expect(result.issues.some((issue) => issue.path === 'params.id')).to.equal(true);
    expect(result.issues.some((issue) => issue.path === 'query.id')).to.equal(false);
  });

  it('should normalize legacy search query filters into named maps', async function () {
    const request = {
      params: {},
      query: {
        searchStr: 'galaxy',
        exactNames: 'title,creator',
        exact_title: 'Nebula',
        exact_creator: 'Andromeda',
        facetNames: 'subject',
        facet_subject: 'Astronomy',
      },
      headers: {},
      body: {},
    } as unknown as Sails.Req;

    const result = validateApiRouteRequest(request, searchRecordsRoute);

    expect(result.valid).to.equal(true);
    if (!result.valid) {
      throw new Error('Expected search query validation to pass');
    }

    expect(result.query.exactNames).to.deep.equal({ title: 'Nebula', creator: 'Andromeda' });
    expect(result.query.facetNames).to.deep.equal({ subject: 'Astronomy' });
  });

  it('should prefer canonical query values and fall back to body values when configured', async function () {
    const request = {
      params: { oid: 'record-1' },
      query: { merge: 'false' },
      headers: {},
      body: { merge: 'true', datastreams: 'true' }
    } as unknown as Sails.Req;

    const result = validateApiRequest(request, updateMetaRoute.request);
    const extracted = extractApiRequest(request, updateMetaRoute.request);

    expect(result.valid).to.equal(true);
    expect(extracted.query.merge).to.equal(false);
    expect(extracted.query.datastreams).to.equal(true);
  });

  it('should hydrate list query fields from body fallbacks when query values are absent', async function () {
    const request = {
      params: {},
      query: {},
      headers: {},
      body: {
        editOnly: 'true',
        recordType: 'dataset',
        state: 'published',
        start: '10',
        rows: '25',
        packageType: 'archive',
        sort: 'dateCreated',
        filterFields: 'title,creator',
        filter: 'alpha,beta'
      }
    } as unknown as Sails.Req;

    const result = validateApiRequest(request, listRecordsRoute.request);
    const extracted = extractApiRequest(request, listRecordsRoute.request);

    expect(result.valid).to.equal(true);
    expect(extracted.query.editOnly).to.equal(true);
    expect(extracted.query.recordType).to.equal('dataset');
    expect(extracted.query.start).to.equal(10);
    expect(extracted.query.rows).to.equal(25);
    expect(extracted.query.filterFields).to.equal('title,creator');
  });

  it('should enforce multipart upload constraints through the shared route validator', async function () {
    const request = {
      params: {},
      query: {},
      headers: {},
      body: {}
    } as unknown as Sails.Req;

    const result = validateApiRouteRequest(request, brandingApiRoutes.find((route) => route.action === 'logo')!, {
      files: {
        logo: [{ size: 1024 * 1024, type: 'image/gif' }],
      },
    });

    expect(result.valid).to.equal(false);
    if (result.valid) {
      throw new Error('Expected multipart validation to fail');
    }
    expect(result.issues.some((issue) => issue.path === 'files.logo[0]' && issue.message === 'File exceeds maxBytes 524288')).to.equal(true);
    expect(result.issues.some((issue) => issue.path === 'files.logo[0]' && issue.message === 'Unsupported mime type image/gif')).to.equal(true);
  });
});
