import _ from 'lodash';
import type {
  OniDatasetFieldMapping,
  OniDatasetMappingConfig,
  OniGraphEntityMapping,
} from '../../configmodels/OniPublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { evaluateBinding } from './bindings';
import type { AnyRecord, OniCrateBuildInput } from './types';

export interface OniMappingDerivedValues {
  datasetUrl: string;
  rootId: string;
  now: string;
  organization: unknown;
  license: unknown;
  spatialCoverage?: unknown;
  temporalCoverage?: unknown;
}

export function buildMappingContext(input: OniCrateBuildInput, derived: OniMappingDerivedValues): AnyRecord {
  return {
    record: input.record,
    metadata: input.record.metadata ?? {},
    metaMetadata: input.record.metaMetadata ?? {},
    oid: input.oid,
    siteName: input.siteName,
    datasetUrl: derived.datasetUrl,
    rootId: derived.rootId,
    creator: input.creator,
    approver: input.approver,
    now: derived.now,
    organization: derived.organization,
    license: derived.license,
    spatialCoverage: derived.spatialCoverage,
    temporalCoverage: derived.temporalCoverage,
    context: {
      personType: 'Person',
      organizationType: 'Organization',
      structuredValueType: 'StructuredValue',
      funderIriPrefix: input.config.metadata.defaultIriPrefs.funder,
      aboutForIriPrefix:
        input.config.metadata.defaultIriPrefs.about['dc:subject_anzsrc:for'] ??
        input.config.metadata.defaultIriPrefs.about.anzsrc_for ??
        '',
      aboutSeoIriPrefix:
        input.config.metadata.defaultIriPrefs.about['dc:subject_anzsrc:seo'] ??
        input.config.metadata.defaultIriPrefs.about.anzsrc_seo ??
        '',
      ...(input.config.mapping?.context ?? {}),
    },
  };
}

function isEmptyMappedValue(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0) || _.isEqual(value, {});
}

function applyArrayMode(value: unknown, mode: OniDatasetFieldMapping['arrayMode']): unknown {
  if (mode === 'wrap') {
    return Array.isArray(value) ? value : [value];
  }
  if (mode === 'first') {
    return Array.isArray(value) ? value[0] : value;
  }
  return value;
}

export async function mapDatasetFields(mappings: OniDatasetFieldMapping[], context: AnyRecord): Promise<AnyRecord> {
  const output: AnyRecord = {};
  for (const mapping of mappings) {
    const omitEmpty = mapping.omitEmpty !== false;
    const value = applyArrayMode(await evaluateBinding(mapping.value, context), mapping.arrayMode ?? 'preserve');
    if (omitEmpty && isEmptyMappedValue(value)) {
      continue;
    }
    _.set(output, mapping.property, value);
  }
  return output;
}

export function applyDatasetLink(
  rootDataset: AnyRecord,
  entity: AnyRecord,
  linkToDataset: OniGraphEntityMapping['linkToDataset']
): void {
  if (!linkToDataset) {
    return;
  }
  const reference = { '@id': entity['@id'] };
  if (linkToDataset.mode === 'set') {
    rootDataset[linkToDataset.property] = reference;
    return;
  }
  const existing = rootDataset[linkToDataset.property];
  rootDataset[linkToDataset.property] = Array.isArray(existing)
    ? [...existing, reference]
    : existing
      ? [existing, reference]
      : [reference];
}

async function mapGraphEntity(mapping: OniGraphEntityMapping, context: AnyRecord): Promise<AnyRecord | undefined> {
  const id = await evaluateBinding(mapping.id, context);
  const type = await evaluateBinding(mapping.type, context);
  const fields = await mapDatasetFields(mapping.fields, context);
  const entity: AnyRecord = {
    '@id': id,
    '@type': type,
    ...fields,
  };
  const omitIfEmpty = mapping.omitIfEmpty !== false;
  if (omitIfEmpty && (isEmptyMappedValue(id) || isEmptyMappedValue(type))) {
    return undefined;
  }
  return entity;
}

function getGraphEntityItems(mapping: OniGraphEntityMapping, source: unknown): unknown[] {
  if (mapping.sourcePath == null) {
    return [undefined];
  }
  if (source == null) {
    return [];
  }
  if (mapping.itemMode === 'single') {
    return [source];
  }
  return Array.isArray(source) ? source : [source];
}

export async function mapGraphEntities(
  mappings: OniGraphEntityMapping[],
  context: AnyRecord,
  rootDataset: AnyRecord
): Promise<AnyRecord[]> {
  const entities: AnyRecord[] = [];
  for (const mapping of mappings) {
    const source = mapping.sourcePath ? _.get(context, mapping.sourcePath) : undefined;
    const items = getGraphEntityItems(mapping, source);
    for (const [index, item] of items.entries()) {
      const entity = await mapGraphEntity(mapping, { ...context, item, index });
      if (!entity) {
        continue;
      }
      entities.push(entity);
      applyDatasetLink(rootDataset, entity, mapping.linkToDataset);
    }
  }
  return entities;
}

export function validateMappedDataset(rootDataset: AnyRecord, validation: OniDatasetMappingConfig['validation']): void {
  const missing = (validation?.requiredRootFields ?? []).filter(field => isEmptyMappedValue(_.get(rootDataset, field)));
  if (missing.length > 0) {
    throw new RBValidationError({
      message: `Oni mapped dataset is missing required root fields: ${missing.join(', ')}`,
      displayErrors: missing.map(field => ({ code: 'oni-required-root-field-missing', title: field })),
    });
  }
}
