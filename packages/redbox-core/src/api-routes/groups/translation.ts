import { apiRoute } from '../route-factory';
import {
  apiActionResponseSchema,
  arrayField,
  booleanField,
  nonEmptyStringField,
  patternStringField,
  translationBundleSchema,
  translationEntrySchema,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const translationKeyTailDescription = 'Translation key path tail; may include slash-delimited segments.';

const translationParams = objectField(
  {
    locale: patternStringField('^[A-Za-z0-9_-]+$'),
    namespace: patternStringField('^[A-Za-z0-9_-]+$'),
    key: patternStringField('^[A-Za-z0-9_\\/.-]+$', translationKeyTailDescription),
  },
  ['locale', 'namespace', 'key']
);

const bundleParams = objectField({ locale: patternStringField('^[A-Za-z0-9_-]+$'), namespace: patternStringField('^[A-Za-z0-9_-]+$') }, ['locale', 'namespace']);

export const listEntriesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/i18n/entries',
  'webservice/TranslationController',
  'listEntries',
  { query: objectField({
    locale: patternStringField('^[A-Za-z0-9_-]+$'),
    namespace: patternStringField('^[A-Za-z0-9_-]+$'),
    keyPrefix: patternStringField('^[A-Za-z0-9_/-]+$'),
  }) },
  {
    tags: ['Translation'],
    summary: 'List translation entries',
    responses: { 200: responseField(arrayField(translationEntrySchema), 'Translation entries') },
  }
);

export const getEntryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key*',
  'webservice/TranslationController',
  'getEntry',
  { params: translationParams },
  {
    tags: ['Translation'],
    summary: 'Get translation entry',
    description: translationKeyTailDescription,
    responses: { 200: responseField(translationEntrySchema, 'Translation entry') },
  }
);

export const setEntryRoute = apiRoute(
  'post',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key*',
  'webservice/TranslationController',
  'setEntry',
  {
    params: translationParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField({ value: stringField(), category: stringField(), description: stringField() }, ['value']),
        },
      },
    },
  },
  {
    tags: ['Translation'],
    summary: 'Set translation entry',
    description: translationKeyTailDescription,
    responses: { 200: responseField(translationEntrySchema, 'Translation entry saved') },
  }
);

export const deleteEntryRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key*',
  'webservice/TranslationController',
  'deleteEntry',
  { params: translationParams },
  {
    tags: ['Translation'],
    summary: 'Delete translation entry',
    description: translationKeyTailDescription,
    responses: { 200: responseField(apiActionResponseSchema, 'Translation entry deleted') },
  }
);

export const getBundleRoute = apiRoute(
  'get',
  '/:branding/:portal/api/i18n/bundles/:locale/:namespace',
  'webservice/TranslationController',
  'getBundle',
  { params: bundleParams },
  {
    tags: ['Translation'],
    summary: 'Get translation bundle',
    responses: { 200: responseField(translationBundleSchema, 'Translation bundle') },
  }
);

export const setBundleRoute = apiRoute(
  'post',
  '/:branding/:portal/api/i18n/bundles/:locale/:namespace',
  'webservice/TranslationController',
  'setBundle',
  {
    params: bundleParams,
    query: objectField({
      splitToEntries: booleanField(),
      overwriteEntries: booleanField(),
    }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              data: objectField({}, [], 'Bundle payload', true),
              splitToEntries: booleanField(),
              overwriteEntries: booleanField(),
            },
            [],
            'Bundle payload'
          ),
        },
      },
    },
  },
  {
    tags: ['Translation'],
    summary: 'Set translation bundle',
    responses: { 200: responseField(translationBundleSchema, 'Translation bundle saved') },
  }
);

export const translationApiRoutes = [
  listEntriesRoute,
  getEntryRoute,
  setEntryRoute,
  deleteEntryRoute,
  getBundleRoute,
  setBundleRoute,
];
