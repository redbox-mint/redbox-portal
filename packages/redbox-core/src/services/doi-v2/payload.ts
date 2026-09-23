import _ from 'lodash';
import { DateTime } from 'luxon';
import type {
  DoiAffiliationMapping,
  DoiArraySourceMapping,
  DoiContributorMapping,
  DoiCreatorMapping,
  DoiGeoLocationMapping,
  DoiProfile,
  DoiRelatedItemMapping,
} from '../../configmodels/DoiPublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { asStringArray, asTrimmedString, evaluateBinding } from './bindings';
import { createBindingContext } from './context';
import type { DoiAction, DoiRecordModel } from './types';

type JsonObject = Record<string, unknown>;

async function mapNamedFields(
  mapping: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value == null || key === 'sourcePath' || key === 'itemMode') {
      continue;
    }
    if (Array.isArray(value)) {
      continue;
    }
    if (typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
      const bound = await evaluateBinding(value as never, context as never);
      const text = typeof bound === 'string' ? bound.trim() : bound;
      if (text != null && text !== '') {
        result[key] = text;
      }
    }
  }
  return result;
}

async function mapAffiliations(mappings: DoiAffiliationMapping[] | undefined, context: Record<string, unknown>) {
  if (!Array.isArray(mappings)) {
    return undefined;
  }
  const values = [];
  for (const mapping of mappings) {
    const mapped = await mapNamedFields(mapping as unknown as Record<string, unknown>, context);
    if (!_.isEmpty(mapped)) {
      values.push(mapped);
    }
  }
  return values.length === 0 ? undefined : values;
}

async function mapNameIdentifiers(mappings: Array<Record<string, unknown>> | undefined, context: Record<string, unknown>) {
  if (!Array.isArray(mappings)) {
    return undefined;
  }
  const values = [];
  for (const mapping of mappings) {
    const mapped = await mapNamedFields(mapping, context);
    if (!_.isEmpty(mapped)) {
      values.push(mapped);
    }
  }
  return values.length === 0 ? undefined : values;
}

/**
 * Resolves the record values an array mapping iterates over. A single value is treated as a
 * one-item list, null items are skipped, and non-object items are exposed to bindings as `item.value`.
 */
function getSourceItems(record: DoiRecordModel, sourcePath: string): Array<{ item: JsonObject; index: number }> {
  const source = _.get(record, sourcePath);
  const values: unknown[] = Array.isArray(source) ? source : source == null ? [] : [source];
  const items: Array<{ item: JsonObject; index: number }> = [];
  values.forEach((value, index) => {
    if (value != null) {
      items.push({ item: _.isPlainObject(value) ? value as JsonObject : { value }, index });
    }
  });
  return items;
}

async function mapCreators(
  mappings: DoiCreatorMapping[] | DoiContributorMapping[] | undefined,
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile
): Promise<JsonObject[]> {
  if (!Array.isArray(mappings)) {
    return [];
  }
  const results: JsonObject[] = [];
  for (const mapping of mappings) {
    for (const { item, index } of getSourceItems(record, mapping.sourcePath)) {
      const context = { ...createBindingContext(record, oid, profile), item, index };
      const mapped = await mapNamedFields(mapping as unknown as Record<string, unknown>, context);
      const affiliations = await mapAffiliations(mapping.affiliations, context);
      const nameIdentifiers = await mapNameIdentifiers(mapping.nameIdentifiers as Array<Record<string, unknown>> | undefined, context);
      if (affiliations != null) {
        mapped.affiliation = affiliations;
      }
      if (nameIdentifiers != null) {
        mapped.nameIdentifiers = nameIdentifiers;
      }
      if (!_.isEmpty(mapped)) {
        results.push(mapped);
      }
    }
  }
  return results;
}

/** Fields an entry must contain before it is sent: every `all` field and at least one `any` field. */
interface EntryRequirement<T> {
  all?: ReadonlyArray<keyof T & string>;
  any?: ReadonlyArray<keyof T & string>;
}

function meetsRequirement<T>(entry: JsonObject, requirement: EntryRequirement<T>): boolean {
  const present = (field: string) => entry[field] != null;
  return (requirement.all ?? []).every(present)
    && (requirement.any == null || requirement.any.some(present));
}

/**
 * Maps a metadata collection, expanding mappings with a `sourcePath` into one entry per record item.
 * Entries missing a field DataCite requires for that collection are omitted rather than sent.
 */
async function mapSimpleArray<T extends DoiArraySourceMapping>(
  mappings: T[] | undefined,
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile,
  requirement: EntryRequirement<T>
): Promise<JsonObject[]> {
  if (!Array.isArray(mappings)) {
    return [];
  }
  const context = createBindingContext(record, oid, profile);
  const results: JsonObject[] = [];
  const addMapped = (mapped: JsonObject) => {
    if (meetsRequirement(mapped, requirement)) {
      results.push(mapped);
    }
  };
  for (const mapping of mappings) {
    const fields = mapping as unknown as JsonObject;
    const sourcePath = typeof mapping.sourcePath === 'string' ? mapping.sourcePath.trim() : '';
    if (sourcePath === '') {
      addMapped(await mapNamedFields(fields, context));
      continue;
    }
    for (const { item, index } of getSourceItems(record, sourcePath)) {
      addMapped(await mapNamedFields(fields, { ...context, item, index }));
    }
  }
  return results;
}

async function mapGeoLocations(
  mappings: DoiGeoLocationMapping[] | undefined,
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile
): Promise<JsonObject[]> {
  if (!Array.isArray(mappings)) {
    return [];
  }
  const context = createBindingContext(record, oid, profile);
  const results: JsonObject[] = [];
  for (const mapping of mappings) {
    const entry: JsonObject = {};
    if (mapping.geoLocationPoint != null) {
      const point = await mapNamedFields(mapping.geoLocationPoint as unknown as Record<string, unknown>, context);
      if (!_.isEmpty(point)) {
        entry.geoLocationPoint = point;
      }
    }
    if (mapping.geoLocationBox != null) {
      const box = await mapNamedFields(mapping.geoLocationBox as unknown as Record<string, unknown>, context);
      if (!_.isEmpty(box)) {
        entry.geoLocationBox = box;
      }
    }
    if (mapping.geoLocationPlace != null) {
      const place = await mapNamedFields(mapping.geoLocationPlace as unknown as Record<string, unknown>, context);
      if (!_.isEmpty(place)) {
        entry.geoLocationPlace = place;
      }
    }
    if (!_.isEmpty(entry)) {
      results.push(entry);
    }
  }
  return results;
}

async function mapRelatedItems(
  mappings: DoiRelatedItemMapping[] | undefined,
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile
): Promise<JsonObject[]> {
  if (!Array.isArray(mappings)) {
    return [];
  }
  const context = createBindingContext(record, oid, profile);
  const results: JsonObject[] = [];
  for (const mapping of mappings) {
    const entry = await mapNamedFields(mapping as unknown as Record<string, unknown>, context);
    const titles = await mapSimpleArray(mapping.titles, record, oid, profile, { all: ['title'] });
    const creators = await mapCreators(mapping.creators, record, oid, profile);
    const contributors = await mapCreators(mapping.contributors, record, oid, profile);
    if (titles.length > 0) {
      entry.titles = titles;
    }
    if (creators.length > 0) {
      entry.creators = creators;
    }
    if (contributors.length > 0) {
      entry.contributors = contributors;
    }
    if (!_.isEmpty(entry)) {
      results.push(entry);
    }
  }
  return results;
}

/**
 * DataCite only enforces the mandatory metadata properties (creators, titles,
 * publisher, publicationYear, resourceTypeGeneral) and the landing-page url when a
 * DOI is moved into the findable state, which is reached via the 'publish' event.
 * Drafts (and other transitions) accept incomplete metadata, so the required-field
 * pre-flight checks are only applied for findable publishes. A metadata-only update
 * sends no event and the DOI's current state is not known locally, so those checks
 * are left to DataCite, which rejects incomplete findable DOIs with a 422 response.
 */
function isFindableEvent(event: string | undefined): boolean {
  return event === 'publish';
}

function validatePublicationYear(publicationYear: string | undefined, errors: string[]) {
  if (publicationYear == null) {
    return;
  }
  if (!/^\d{4}$/.test(publicationYear)) {
    errors.push('publication-year-invalid');
  }
}

function validateUrl(url: string | undefined, errors: string[]) {
  if (url == null) {
    return;
  }
  try {
    new URL(url);
  } catch {
    errors.push('url-invalid');
  }
}

function validateDates(dates: JsonObject[], errors: string[]) {
  for (const item of dates) {
    const dateValue = asTrimmedString(item.date);
    if (dateValue == null) {
      continue;
    }
    const valid = DateTime.fromISO(dateValue).isValid
      || DateTime.fromRFC2822(dateValue).isValid
      || DateTime.fromHTTP(dateValue).isValid
      || DateTime.fromFormat(dateValue, 'yyyy').isValid
      || DateTime.fromFormat(dateValue, 'yyyy-MM-dd').isValid;
    if (!valid) {
      errors.push('date-invalid');
      return;
    }
  }
}

/** Builds the DataCite request body from a record and its configured DOI profile. */
export async function buildDoiPayload(
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile,
  action: DoiAction,
  event: string | undefined
): Promise<Record<string, unknown>> {
  const context = createBindingContext(record, oid, profile);
  const doi = asTrimmedString(await evaluateBinding(profile.metadata.doi, context));
  const prefix = asTrimmedString(await evaluateBinding(profile.metadata.prefix, context));
  const url = asTrimmedString(await evaluateBinding(profile.metadata.url, context));
  const contentUrl = await evaluateBinding(profile.metadata.contentUrl, context);
  const publicationYear = asTrimmedString(await evaluateBinding(profile.metadata.publicationYear, context));
  const language = asTrimmedString(await evaluateBinding(profile.metadata.language, context));
  const publisher = asTrimmedString(await evaluateBinding(profile.metadata.publisher, context));
  const version = asTrimmedString(await evaluateBinding(profile.metadata.version, context));
  const formats = asStringArray(await evaluateBinding(profile.metadata.formats, context));
  const sizes = asStringArray(await evaluateBinding(profile.metadata.sizes, context));
  const titles = await mapSimpleArray(profile.metadata.titles, record, oid, profile, { all: ['title'] });
  const creators = await mapCreators(profile.metadata.creators, record, oid, profile);
  const subjects = await mapSimpleArray(profile.metadata.subjects, record, oid, profile, { all: ['subject'] });
  const contributors = await mapCreators(profile.metadata.contributors, record, oid, profile);
  const dates = await mapSimpleArray(profile.metadata.dates, record, oid, profile, { all: ['date', 'dateType'] });
  const alternateIdentifiers = await mapSimpleArray(profile.metadata.alternateIdentifiers, record, oid, profile, { all: ['identifier', 'identifierType'] });
  const relatedIdentifiers = await mapSimpleArray(profile.metadata.relatedIdentifiers, record, oid, profile, {
    all: ['relatedIdentifier', 'relatedIdentifierType', 'relationType']
  });
  const rightsList = await mapSimpleArray(profile.metadata.rightsList, record, oid, profile, { any: ['rights', 'rightsUri', 'rightsIdentifier'] });
  const descriptions = await mapSimpleArray(profile.metadata.descriptions, record, oid, profile, { all: ['description', 'descriptionType'] });
  const geoLocations = await mapGeoLocations(profile.metadata.geoLocations, record, oid, profile);
  const fundingReferences = await mapSimpleArray(profile.metadata.fundingReferences, record, oid, profile, { all: ['funderName'] });
  const relatedItems = await mapRelatedItems(profile.metadata.relatedItems, record, oid, profile);
  const types = await mapNamedFields(profile.metadata.types as unknown as Record<string, unknown>, context);

  const attributes: Record<string, unknown> = {
    ...(event != null ? { event } : {}),
    ...(doi != null ? { doi } : {}),
    ...(action === 'create' && prefix != null ? { prefix } : {}),
    ...(url != null ? { url } : {}),
    ...(contentUrl != null ? { contentUrl: Array.isArray(contentUrl) ? contentUrl : asStringArray(contentUrl) } : {}),
    ...(publicationYear != null ? { publicationYear } : {}),
    ...(language != null ? { language } : {}),
    ...(publisher != null ? { publisher } : {}),
    ...(version != null ? { version } : {}),
    ...(formats.length > 0 ? { formats } : {}),
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(creators.length > 0 ? { creators } : {}),
    ...(titles.length > 0 ? { titles } : {}),
    ...(subjects.length > 0 ? { subjects } : {}),
    ...(contributors.length > 0 ? { contributors } : {}),
    ...(dates.length > 0 ? { dates } : {}),
    ...(alternateIdentifiers.length > 0 ? { alternateIdentifiers } : {}),
    ...(relatedIdentifiers.length > 0 ? { relatedIdentifiers } : {}),
    ...(rightsList.length > 0 ? { rightsList } : {}),
    ...(descriptions.length > 0 ? { descriptions } : {}),
    ...(geoLocations.length > 0 ? { geoLocations } : {}),
    ...(fundingReferences.length > 0 ? { fundingReferences } : {}),
    ...(relatedItems.length > 0 ? { relatedItems } : {}),
    ...(Object.keys(types).length > 0 ? { types } : {})
  };
  const requestBody = {
    data: {
      type: 'dois',
      attributes
    }
  };

  const errors: string[] = [];
  // Required-field (presence) checks only apply when the DOI is being made findable.
  // The format checks below always run, but only flag values that are actually present.
  if (isFindableEvent(event)) {
    if (profile.validation.requireTitles && titles.length === 0) {
      errors.push('title-required');
    }
    if (profile.validation.requirePublisher && publisher == null) {
      errors.push('publisher-required');
    }
    if (profile.validation.requireCreators && creators.length === 0) {
      errors.push('creators-required');
    }
    if (profile.validation.requirePublicationYear && publicationYear == null) {
      errors.push('publication-year-required');
    }
    if (profile.validation.requireUrl && url == null) {
      errors.push('url-required');
    }
    if (asTrimmedString(types.resourceTypeGeneral) == null) {
      errors.push('general-resource-type-required');
    }
  }
  validatePublicationYear(publicationYear, errors);
  validateUrl(url, errors);
  validateDates(dates, errors);
  if (errors.length > 0) {
    const error = new RBValidationError({
      message: `Could not build DOI payload for oid ${oid}: ${errors.join(', ')}`,
      displayErrors: errors.map(code => ({ code, title: 'datacite-validation-error', meta: { oid, action, ...(event != null ? { event } : {}) } }))
    });
    (error as RBValidationError & { requestSummary?: Record<string, unknown> }).requestSummary = {
      ...(event != null ? { event } : {}),
      action,
      requestBody
    };
    throw error;
  }

  return requestBody;
}
