import _ from 'lodash';
import { DateTime } from 'luxon';
import type {
  DoiAffiliationMapping,
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
    const sourceItems = _.get(record, mapping.sourcePath);
    if (!Array.isArray(sourceItems)) {
      continue;
    }
    for (let index = 0; index < sourceItems.length; index++) {
      const item = sourceItems[index];
      const context = {
        ...createBindingContext(record, oid, profile),
        item: item != null && typeof item === 'object' ? item as Record<string, unknown> : {},
        index
      };
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

async function mapSimpleArray<T extends Record<string, unknown>>(
  mappings: T[] | undefined,
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
    const mapped = await mapNamedFields(mapping, context);
    if (!_.isEmpty(mapped)) {
      results.push(mapped);
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
    const titles = await mapSimpleArray(mapping.titles as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
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

export async function buildDoiPayload(
  record: DoiRecordModel,
  oid: string,
  profile: DoiProfile,
  action: DoiAction,
  event: string
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
  const titles = await mapSimpleArray(profile.metadata.titles as unknown as Array<Record<string, unknown>>, record, oid, profile);
  const creators = await mapCreators(profile.metadata.creators, record, oid, profile);
  const subjects = await mapSimpleArray(profile.metadata.subjects as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const contributors = await mapCreators(profile.metadata.contributors, record, oid, profile);
  const dates = await mapSimpleArray(profile.metadata.dates as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const alternateIdentifiers = await mapSimpleArray(profile.metadata.alternateIdentifiers as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const relatedIdentifiers = await mapSimpleArray(profile.metadata.relatedIdentifiers as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const rightsList = await mapSimpleArray(profile.metadata.rightsList as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const descriptions = await mapSimpleArray(profile.metadata.descriptions as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const geoLocations = await mapGeoLocations(profile.metadata.geoLocations, record, oid, profile);
  const fundingReferences = await mapSimpleArray(profile.metadata.fundingReferences as unknown as Array<Record<string, unknown>> | undefined, record, oid, profile);
  const relatedItems = await mapRelatedItems(profile.metadata.relatedItems, record, oid, profile);
  const types = await mapNamedFields(profile.metadata.types as unknown as Record<string, unknown>, context);

  const attributes: Record<string, unknown> = {
    event,
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

  const errors: string[] = [];
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
  validatePublicationYear(publicationYear, errors);
  validateUrl(url, errors);
  validateDates(dates, errors);
  if (asTrimmedString(types.resourceTypeGeneral) == null) {
    errors.push('general-resource-type-required');
  }
  if (errors.length > 0) {
    throw new RBValidationError({
      message: `Could not build DOI payload for oid ${oid}: ${errors.join(', ')}`,
      displayErrors: errors.map(code => ({ code, title: 'datacite-validation-error', meta: { oid, action, event } }))
    });
  }

  return {
    data: {
      type: 'dois',
      attributes
    }
  };
}
