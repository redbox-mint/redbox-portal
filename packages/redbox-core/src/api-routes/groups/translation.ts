import { apiRoute } from '../route-factory';
import {
  apiActionResponseSchema,
  apiErrorResponseSchema,
  arrayField,
  booleanField,
  booleanQueryField,
  nonEmptyStringField,
  patternStringField,
  translationBundleSchema,
  translationEntrySchema,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';
import { z } from '../zod-openapi';

const translationKeyTailDescription = 'Translation key segment.';
const localeField = patternStringField('^[a-z]{2}(-[A-Z]{2})?$');

const translationParams = objectField(
  {
    locale: localeField,
    namespace: patternStringField('^[A-Za-z0-9_-]+$'),
    key: patternStringField('^[A-Za-z0-9_-]+$', translationKeyTailDescription),
  },
  ['locale', 'namespace', 'key']
);

const dottedTranslationParams = objectField(
  {
    locale: localeField,
    namespace: patternStringField('^[A-Za-z0-9_-]+$'),
    key: patternStringField('^[A-Za-z0-9_-]+$', translationKeyTailDescription),
    keyExt: patternStringField('^[A-Za-z0-9_.-]+$', 'Translation key suffix after the first dot.'),
  },
  ['locale', 'namespace', 'key', 'keyExt']
);

const bundleParams = objectField({ locale: localeField, namespace: patternStringField('^[A-Za-z0-9_-]+$') }, ['locale', 'namespace']);
const setBundleEnvelopeBody = objectField(
  {
    data: objectField({}, [], 'Bundle payload', true),
    splitToEntries: booleanField(),
    overwriteEntries: booleanField(),
  },
  ['data'],
  'Bundle payload'
);
const setBundleBody = z.union([
  setBundleEnvelopeBody,
  z.object({}).passthrough().openapi({
    description: 'Legacy raw translation bundle payload',
    additionalProperties: true,
  }),
]).openapi({
  description: 'Translation bundle payload. Accepts either the canonical { data } envelope or a legacy raw bundle object.',
});

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
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key',
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
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key',
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
    responses: {
      200: responseField(translationEntrySchema, 'Translation entry saved'),
      404: responseField(apiErrorResponseSchema, 'Entry not found (soft-deleted)'),
    },
  }
);

export const getDottedEntryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key.:keyExt',
  'webservice/TranslationController',
  'getEntry',
  { params: dottedTranslationParams },
  {
    tags: ['Translation'],
    summary: 'Get translation entry with dotted key',
    description: 'Compatibility route for dotted translation keys.',
    responses: { 200: responseField(translationEntrySchema, 'Translation entry') },
  }
);

export const setDottedEntryRoute = apiRoute(
  'post',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key.:keyExt',
  'webservice/TranslationController',
  'setEntry',
  {
    params: dottedTranslationParams,
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
    summary: 'Set translation entry with dotted key',
    description: 'Compatibility route for dotted translation keys.',
    responses: { 200: responseField(translationEntrySchema, 'Translation entry saved') },
  }
);

export const deleteEntryRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key',
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

export const deleteDottedEntryRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/i18n/entries/:locale/:namespace/:key.:keyExt',
  'webservice/TranslationController',
  'deleteEntry',
  { params: dottedTranslationParams },
  {
    tags: ['Translation'],
    summary: 'Delete translation entry with dotted key',
    description: 'Compatibility route for dotted translation keys.',
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
      splitToEntries: booleanQueryField(),
      overwriteEntries: booleanQueryField(),
    }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: setBundleBody,
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
  getDottedEntryRoute,
  setDottedEntryRoute,
  deleteEntryRoute,
  deleteDottedEntryRoute,
  getBundleRoute,
  setBundleRoute,
];
