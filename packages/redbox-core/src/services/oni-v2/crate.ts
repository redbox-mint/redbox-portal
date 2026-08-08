import _ from 'lodash';
import Handlebars from 'handlebars';
import * as mime from 'mime-types';
import { posix as pathPosix } from 'node:path';
import type {
  AnyRecord,
  OniAttachment,
  OniCrateBuildInput,
  OniCrateBuildResult,
  OniRecordModel,
  OniUserModel,
} from './types';
import type { OniPublishingConfigData } from '../../configmodels/OniPublishing';
import { RBValidationError } from '../../model/RBValidationError';
import {
  applyDatasetLink,
  buildMappingContext,
  mapDatasetFields,
  mapGraphEntities,
  validateMappedDataset,
} from './mapping';

type WktParserHelperModule = {
  default?: WktParserHelperApi;
};

type WktParserHelperApi = {
  convertToWK?: (input: unknown) => string;
  geojsonToWkt?: (input: unknown) => string;
};

export const RO_CRATE_CONTEXT = 'https://w3id.org/ro/crate/1.1/context';
export const RO_CRATE_PROFILE = 'https://w3id.org/ro/crate/1.1';
let wktParserHelper: WktParserHelperApi | null = null;

export function generateArcpId(namespace: string, id: string): string {
  return `arcp://name,${namespace}/${id}`;
}

export function buildDatasetUrl(
  config: OniPublishingConfigData,
  siteUrl: string,
  useCleanUrl: boolean,
  oid: string
): string {
  const baseUrl = siteUrl.replace(/\/+$/, '');
  if (useCleanUrl) {
    return `${baseUrl}/${encodeURIComponent(oid)}`;
  }
  const recUrlOid = encodeURIComponent(generateArcpId(config.rootCollection.targetRepoNamespace, oid));
  return `${baseUrl}/object?id=${recUrlOid}&_crateId=${recUrlOid}`;
}

export function applyCitationWriteBack(
  record: OniRecordModel,
  config: OniPublishingConfigData,
  datasetUrl: string
): void {
  _.set(record, config.writeBack.citationUrlPath, datasetUrl);
  _.unset(record, config.writeBack.publicationErrorPath);
  const existingDoi = String(_.get(record, config.writeBack.citationDoiPath) ?? '');
  if (existingDoi !== '') {
    _.set(
      record,
      config.writeBack.citationDoiPath,
      existingDoi.replace(config.writeBack.doiUrlPlaceholder, datasetUrl)
    );
  }
}

export function applyPublicationError(record: OniRecordModel, config: OniPublishingConfigData, error: Error): void {
  _.set(
    record,
    config.writeBack.publicationErrorPath,
    `Data publication failed with error: ${error.name} ${error.message}`
  );
}

export function getDataRecordOid(record: OniRecordModel, config: OniPublishingConfigData): string {
  return String(_.get(record, config.selection.dataRecordOidPath) ?? '').trim();
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

function safeLogicalPath(value: string): string {
  const normalized = pathPosix.normalize(value.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (normalized === '' || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error(`Invalid Oni attachment logical path '${value}'`);
  }
  return normalized;
}

function renderLogicalPath(template: string, entry: AnyRecord): string {
  const compiled = Handlebars.compile(template || 'files/{{fileId}}/{{name}}', { noEscape: true });
  const rendered = compiled({
    ...entry,
    fileId: String(entry.fileId ?? ''),
    name: pathPosix.basename(String(entry.name ?? entry.originalFileName ?? 'attachment')),
  });
  return safeLogicalPath(rendered);
}

export function getSelectedAttachments(record: OniRecordModel, config: OniPublishingConfigData): OniAttachment[] {
  if (normalizeBoolean(_.get(record, config.selection.metadataOnlyPath))) {
    return [];
  }
  const dataLocations = _.get(record, config.selection.dataLocationsPath);
  const entries = Array.isArray(dataLocations) ? (dataLocations as AnyRecord[]) : [];
  return entries
    .filter(entry => String(entry.type ?? '') === 'attachment')
    .filter(
      entry =>
        config.selection.attachmentMode === 'all' || normalizeBoolean(_.get(entry, config.selection.selectedFlagPath))
    )
    .map(entry => {
      const fileId = String(entry.fileId ?? '').trim();
      const name = String(entry.name ?? entry.originalFileName ?? '').trim();
      if (fileId === '' || name === '') {
        throw new Error('Selected Oni attachment is missing fileId or name');
      }
      return {
        fileId,
        name,
        logicalPath: renderLogicalPath(config.selection.logicalPathTemplate, entry),
        source: entry,
        encodingFormat: mime.lookup(name),
      };
    });
}

export function getPerson(rbPerson: AnyRecord, type: string): AnyRecord | undefined {
  const id = [rbPerson.orcid, rbPerson.email, rbPerson.text_full_name, rbPerson.name].find(
    value => String(value ?? '').trim() !== ''
  );
  if (!id) {
    return undefined;
  }
  return {
    '@id': String(id),
    '@type': type,
    name: rbPerson.text_full_name ?? rbPerson.name,
    givenName: rbPerson.givenName ?? rbPerson.given_name,
    familyName: rbPerson.familyName ?? rbPerson.family_name,
    email: rbPerson.email,
  };
}

export function getLicense(metadata: AnyRecord, config: OniPublishingConfigData): AnyRecord[] {
  const licenses: AnyRecord[] = [];
  if (!_.isEmpty(metadata.license_other_url) || !_.isEmpty(metadata.license_notes)) {
    if (metadata.license_other_url) {
      licenses.push({
        '@id': metadata.license_other_url,
        '@type': 'CreativeWork',
        url: metadata.license_other_url,
        name: metadata.license_notes || metadata.license_other_url,
      });
    } else {
      licenses.push({
        '@id': `${config.metadata.defaultIriPrefs.license}other`,
        '@type': 'CreativeWork',
        name: metadata.license_notes,
      });
    }
  }
  if (metadata.license_identifier && metadata.license_identifier !== 'undefined') {
    licenses.push({
      '@id': metadata.license_identifier,
      '@type': 'CreativeWork',
      name: metadata.license_identifier,
      url: metadata.license_identifier,
    });
  }
  if (metadata.accessRights_url) {
    licenses.push({
      '@id': metadata.accessRights_url,
      '@type': 'WebSite',
      name: 'Conditions of Access',
      url: metadata.accessRights_url,
    });
  }
  if (_.isEmpty(licenses) && config.rootCollection.enableDatasetToUseDefaultLicense) {
    licenses.push(config.rootCollection.defaultLicense as unknown as AnyRecord);
  }
  return licenses;
}

function getYearFromDate(value: unknown): string | undefined {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return String(date.getFullYear());
}

function getTemporalCoverage(metadata: AnyRecord): string | undefined {
  let temporalCoverage = '';
  if (metadata.startDate) {
    temporalCoverage = String(metadata.startDate);
    if (metadata.endDate) {
      temporalCoverage += `/${String(metadata.endDate)}`;
    }
  } else if (metadata.endDate) {
    temporalCoverage = String(metadata.endDate);
  }
  if (metadata.timePeriod) {
    temporalCoverage = temporalCoverage
      ? `${temporalCoverage}; ${String(metadata.timePeriod)}`
      : String(metadata.timePeriod);
  }
  return temporalCoverage || undefined;
}

async function getWktParserHelper(): Promise<WktParserHelperApi> {
  if (wktParserHelper != null) {
    return wktParserHelper;
  }
  const importedHelper = (await import('wkt-parser-helper')) as WktParserHelperApi & WktParserHelperModule;
  wktParserHelper = importedHelper.default ?? importedHelper;
  return wktParserHelper;
}

export async function convertToWkt(id: string, geoJsonSrc: unknown): Promise<AnyRecord> {
  const geoJson = _.cloneDeep(geoJsonSrc);
  _.unset(geoJson, '@type');
  const helper = await getWktParserHelper();
  const converter = helper.geojsonToWkt ?? helper.convertToWK;
  if (!converter) {
    throw new Error('wkt-parser-helper does not expose a GeoJSON to WKT converter');
  }
  return {
    '@id': id,
    '@type': 'Geometry',
    asWKT: converter(geoJson),
  };
}

async function getSpatialCoverage(metadata: AnyRecord, extraContext: AnyRecord): Promise<AnyRecord[] | undefined> {
  if (_.isEmpty(metadata.geospatial)) {
    return undefined;
  }
  const geospatial = (Array.isArray(metadata.geospatial) ? metadata.geospatial : [metadata.geospatial]).filter(
    geoJson => {
      if (!isRecordValue(geoJson)) {
        return false;
      }
      if (geoJson.type === 'FeatureCollection') {
        return Array.isArray(geoJson.features) && geoJson.features.length > 0;
      }
      if (geoJson.type === 'GeometryCollection') {
        return Array.isArray(geoJson.geometries) && geoJson.geometries.length > 0;
      }
      return true;
    }
  );
  if (geospatial.length === 0) {
    return undefined;
  }
  extraContext.Geometry = 'http://www.opengis.net/ont/geosparql#Geometry';
  extraContext.asWKT = 'http://www.opengis.net/ont/geosparql#asWKT';
  return Promise.all(
    geospatial.map(async (geoJson: unknown, idx: number) => ({
      '@id': `_:place-${idx}`,
      '@type': 'Place',
      geo: await convertToWkt(`_:geo-${idx}`, geoJson),
    }))
  );
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function findPersonForUser(graph: AnyRecord[], rootDataset: AnyRecord, user: OniUserModel): AnyRecord | undefined {
  const people = _.concat((rootDataset.author as AnyRecord[]) ?? [], (rootDataset.contributor as AnyRecord[]) ?? []);
  const userEmail = normalizeEmail(user.email);
  const candidateRefs = _.compact(
    people.map((entry: AnyRecord) => {
      if (userEmail !== '' && normalizeEmail(entry?.email) === userEmail) {
        return entry;
      }
      const refId = String(entry?.['@id'] ?? '').trim();
      return refId === '' ? undefined : graph.find(graphEntry => graphEntry?.['@id'] === refId);
    })
  ) as AnyRecord[];
  const byEmail = candidateRefs.find(entry => normalizeEmail(entry?.email) === userEmail);
  if (byEmail) {
    return byEmail;
  }
  return candidateRefs.find(entry => String(entry?.['@type'] ?? '') === 'Person');
}

function addHistory(graph: AnyRecord[], rootDataset: AnyRecord, creator: OniUserModel, approver: OniUserModel): void {
  let creatorPerson = findPersonForUser(graph, rootDataset, creator);
  const sameUserByEmail =
    normalizeEmail(creator.email) !== '' && normalizeEmail(creator.email) === normalizeEmail(approver.email);
  let approverPerson = sameUserByEmail ? creatorPerson : findPersonForUser(graph, rootDataset, approver);
  if (!creatorPerson) {
    creatorPerson = getPerson(creator, 'Person');
    if (creatorPerson) {
      graph.push(creatorPerson);
    }
  }
  if (sameUserByEmail) {
    approverPerson = creatorPerson;
  }
  if (!approverPerson) {
    approverPerson = getPerson(approver, 'Person');
    if (approverPerson) {
      graph.push(approverPerson);
    }
  }
  if (!creatorPerson || !approverPerson) {
    return;
  }
  graph.push({
    '@id': 'history1',
    '@type': 'CreateAction',
    name: 'Create',
    description: 'Data record created',
    endTime: rootDataset.dateCreated,
    object: { '@id': rootDataset['@id'] },
    agent: { '@id': creatorPerson['@id'] },
  });
  graph.push({
    '@id': 'history2',
    '@type': 'UpdateAction',
    name: 'Publish',
    endTime: rootDataset.datePublished,
    object: { '@id': rootDataset['@id'] },
    agent: { '@id': approverPerson['@id'] },
  });
}

export function createRootCollectionEntity(config: OniPublishingConfigData): AnyRecord {
  return {
    '@id': config.rootCollection.rootCollectionId,
    '@type': config.rootCollection.dsType,
    identifier: config.rootCollection.targetRepoColId,
    name: config.rootCollection.targetRepoColName,
    description: config.rootCollection.targetRepoColDescription,
    license: config.rootCollection.defaultLicense,
  };
}

export function createRootCollectionCrate(config: OniPublishingConfigData): AnyRecord {
  return {
    '@context': RO_CRATE_CONTEXT,
    '@graph': [
      {
        '@id': config.metadata.jsonldFilename,
        '@type': 'CreativeWork',
        about: { '@id': config.rootCollection.rootCollectionId },
        conformsTo: { '@id': RO_CRATE_PROFILE },
      },
      createRootCollectionEntity(config),
    ],
  };
}

function createFileEntities(attachments: OniAttachment[]): AnyRecord[] {
  return attachments.map(attachment => ({
    '@id': attachment.logicalPath,
    '@type': ['File'],
    name: attachment.name,
    encodingFormat: attachment.encodingFormat || undefined,
  }));
}

function isRecordValue(value: unknown): value is AnyRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getDatasetReferences(rootDataset: AnyRecord, property: string): AnyRecord[] {
  const value = rootDataset[property];
  if (Array.isArray(value)) {
    return value.filter(isRecordValue);
  }
  return isRecordValue(value) ? [value] : [];
}

function findGraphEntity(graph: AnyRecord[], id: string): AnyRecord | undefined {
  return graph.find(entry => String(entry['@id'] ?? '') === id);
}

function upsertGraphEntity(graph: AnyRecord[], entity: AnyRecord): AnyRecord {
  const id = String(entity['@id'] ?? '').trim();
  if (id !== '') {
    const existing = findGraphEntity(graph, id);
    if (existing) {
      Object.assign(existing, entity);
      return existing;
    }
  }
  graph.push(entity);
  return entity;
}

function toReference(entity: AnyRecord): AnyRecord {
  return { '@id': entity['@id'] };
}

function addContributorContactPoint(graph: AnyRecord[], rootDataset: AnyRecord, contributor: AnyRecord): void {
  const contactPoint = getPerson(contributor, 'ContactPoint');
  if (!contactPoint) {
    return;
  }

  contactPoint.contactType = 'Data Manager';
  contactPoint.identifier = contactPoint['@id'];
  const contactEmail = String(contactPoint.email ?? '').trim();
  if (contactEmail !== '') {
    contactPoint['@id'] = `mailto:${contactEmail}`;
  }

  const contactPointEntity = upsertGraphEntity(graph, contactPoint);
  const contactPointReference = toReference(contactPointEntity);
  const contactIdentifier = String(contactPoint.identifier ?? '').trim();
  const authorReference = getDatasetReferences(rootDataset, 'author').find(
    entry => String(entry['@id'] ?? '') === contactIdentifier
  );
  const authorEntity = authorReference ? findGraphEntity(graph, String(authorReference['@id'] ?? '')) : undefined;
  if (authorEntity) {
    authorEntity.contactPoint = contactPointReference;
    return;
  }

  const contactPerson = getPerson(contributor, 'Person');
  if (contactPerson) {
    const contactPersonEntity = upsertGraphEntity(graph, {
      ...contactPerson,
      contactPoint: contactPointReference,
    });
    applyDatasetLink(rootDataset, contactPersonEntity, { property: 'contributor' });
  }
}

export async function buildOniRoCrate(input: OniCrateBuildInput): Promise<OniCrateBuildResult> {
  const metadata = input.record.metadata ?? {};
  const metaMetadata = input.record.metaMetadata ?? {};
  const dataRecordOid = getDataRecordOid(input.record, input.config);
  if (dataRecordOid === '') {
    const message = `Could not find data record oid at '${input.config.selection.dataRecordOidPath}' for publication '${input.oid}'`;
    throw new RBValidationError({
      message,
      displayErrors: [
        {
          code: 'oni-data-record-oid-missing',
          title: 'Oni data record OID is missing',
          detail: message,
          meta: { oid: input.oid, path: input.config.selection.dataRecordOidPath },
        },
      ],
    });
  }

  const datasetUrl = buildDatasetUrl(input.config, input.site.publicUrl, input.site.useCleanUrl, input.oid);

  const now = new Date().toISOString();
  const rootId = generateArcpId(input.config.rootCollection.targetRepoNamespace, input.oid);
  const extraContext: AnyRecord = {};
  const attachments = getSelectedAttachments(input.record, input.config);
  const fileEntities = createFileEntities(attachments);
  const graph: AnyRecord[] = [
    {
      '@id': input.config.metadata.jsonldFilename,
      '@type': 'CreativeWork',
      about: { '@id': rootId },
      conformsTo: { '@id': RO_CRATE_PROFILE },
    },
  ];

  const rootCollection = createRootCollectionEntity(input.config);
  graph.push(rootCollection);

  const licenses = getLicense(metadata, input.config);
  const spatialCoverage = await getSpatialCoverage(metadata, extraContext);
  const spatialEntities = (spatialCoverage ?? []).flatMap(place => {
    const geometry = isRecordValue(place.geo) ? place.geo : undefined;
    return geometry ? [{ ...place, geo: toReference(geometry) }, geometry] : [place];
  });
  for (const supportingEntity of [input.config.metadata.organization, ...licenses, ...spatialEntities]) {
    upsertGraphEntity(graph, supportingEntity as unknown as AnyRecord);
  }

  const systemRootDatasetFields: AnyRecord = {
    '@id': rootId,
    '@type': ['Dataset', 'RepositoryObject'],
    identifier: input.oid,
    yearCreated: getYearFromDate(metaMetadata.createdOn),
    datePublished: now,
    yearPublished: getYearFromDate(now),
    memberOf: { '@id': input.config.rootCollection.rootCollectionId },
    hasPart: fileEntities.map(entry => ({ '@id': entry['@id'] })),
  };
  const mappingContext = buildMappingContext(input, {
    datasetUrl,
    rootId,
    now,
    organization: input.config.metadata.organization,
    license: licenses,
    spatialCoverage,
    temporalCoverage: getTemporalCoverage(metadata),
  });
  const mappedRootDataset = await mapDatasetFields(input.config.mapping?.rootDataset ?? [], mappingContext);
  const rootDataset: AnyRecord = {
    ...mappedRootDataset,
    ...systemRootDatasetFields,
  };
  const mappedGraphEntities = await mapGraphEntities(
    input.config.mapping?.graphEntities ?? [],
    mappingContext,
    rootDataset
  );

  const contributor = metadata.contributor_data_manager;
  if (isRecordValue(contributor)) {
    addContributorContactPoint(mappedGraphEntities, rootDataset, contributor);
  }

  graph.push(...mappedGraphEntities, rootDataset, ...fileEntities);
  validateMappedDataset(rootDataset, input.config.mapping?.validation);
  addHistory(graph, rootDataset, input.creator, input.approver);

  return {
    datasetUrl,
    rootId,
    rootCollectionId: input.config.rootCollection.rootCollectionId,
    dataRecordOid,
    attachments,
    crateJson: {
      '@context': _.isEmpty(extraContext) ? RO_CRATE_CONTEXT : [RO_CRATE_CONTEXT, extraContext],
      '@graph': graph,
    },
  };
}
