import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { FigshareClient } from './http';
import { AnyRecord, FigsharePublicationPlan } from './types';
import { evaluateBinding } from './bindings';

const figshareLicenseCache = new Map<string, AnyRecord[]>();

function validationError(message: string): RBValidationError {
  return new RBValidationError({
    message,
    displayErrors: [{ title: message, detail: message }]
  });
}

function getDefaultContributors(config: FigsharePublishingConfigData, record: AnyRecord): AnyRecord[] {
  const contributorPaths = _.isArray(config.authors.contributorPaths) && config.authors.contributorPaths.length > 0
    ? config.authors.contributorPaths
    : ['metadata.contributor_ci', 'metadata.contributor_data_manager', 'metadata.dataOwner', 'metadata.chiefInvestigator', 'metadata.contributors'];
  const contributors = contributorPaths
    .flatMap((contributorPath: string) => _.castArray(_.get(record, contributorPath, [])))
    .filter((entry: unknown) => _.isPlainObject(entry)) as AnyRecord[];
  return contributors;
}

function applyAuthorLookupTransform(config: FigsharePublishingConfigData, matchBy: string, value: string): string {
  if (matchBy !== 'email') {
    return value;
  }

  let normalized = value.trim();
  if (normalized === '') {
    return normalized;
  }

  const prefix = String(_.get(config, 'authors.emailTransform.prefix', '')).trim();
  const domainOverride = String(_.get(config, 'authors.emailTransform.domainOverride', '')).trim();
  const [localPart, domainPart = ''] = normalized.split('@');
  if (prefix !== '' && localPart !== '' && !localPart.startsWith(prefix)) {
    normalized = `${prefix}${localPart}${domainPart ? `@${domainPart}` : ''}`;
  }
  if (domainOverride !== '' && localPart !== '') {
    const nextLocalPart = normalized.split('@')[0] || localPart;
    normalized = `${nextLocalPart}@${domainOverride.replace(/^@+/, '')}`;
  }
  return normalized;
}

async function resolveAuthors(client: FigshareClient, config: FigsharePublishingConfigData, record: AnyRecord): Promise<AnyRecord[]> {
  const contributors = getDefaultContributors(config, record);
  if (contributors.length === 0) {
    return [];
  }

  const uniqueContributors = config.authors.uniqueBy === 'none'
    ? contributors
    : _.uniqBy(contributors, (entry: AnyRecord) => String(_.get(entry, config.authors.uniqueBy, '')));

  const resolvedAuthors: AnyRecord[] = [];
  for (const contributor of uniqueContributors.slice(0, config.authors.maxInlineAuthors)) {
    let matched = false;
    for (const rule of config.authors.lookup) {
      const rawValue = await evaluateBinding(rule.value, contributor);
      const value = _.isString(rawValue) ? applyAuthorLookupTransform(config, rule.matchBy, rawValue) : rawValue;
      if (_.isNil(value) || value === '') {
        continue;
      }
      const matches = await client.searchInstitutionAccounts({ [rule.matchBy]: value });
      const firstMatch = matches[0];
      const matchedId = _.get(firstMatch, 'id');
      if (!_.isNil(matchedId) && matchedId !== '') {
        resolvedAuthors.push({ id: matchedId });
        matched = true;
        break;
      }
    }

    if (!matched) {
      const fallbackName = _.get(contributor, config.authors.externalNameField) || _.get(contributor, 'text_full_name') || _.get(contributor, 'name');
      if (!_.isNil(fallbackName) && fallbackName !== '') {
        resolvedAuthors.push({ name: fallbackName });
      }
    }
  }

  return resolvedAuthors;
}

function matchesLicense(matchBy: FigsharePublishingConfigData['metadata']['license']['matchBy'], rawValue: string, license: AnyRecord): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }
  if (matchBy === 'nameExact') {
    return String(_.get(license, 'name', '')).trim().toLowerCase() === normalized;
  }
  if (matchBy === 'valueExact') {
    return String(_.get(license, 'value', _.get(license, 'id', ''))).trim().toLowerCase() === normalized;
  }
  const candidate = `${_.get(license, 'url', '')} ${_.get(license, 'name', '')} ${_.get(license, 'value', '')}`.toLowerCase();
  return candidate.includes(normalized);
}

async function resolveLicense(client: FigshareClient, config: FigsharePublishingConfigData, record: AnyRecord): Promise<unknown> {
  const licenseValue = await evaluateBinding(config.metadata.license.source, record);
  if (_.isNil(licenseValue) || licenseValue === '') {
    if (config.metadata.license.required) {
      throw validationError('Figshare license is required');
    }
    return undefined;
  }

  const cacheKey = `${config.connection.baseUrl}::${config.connection.token}`;
  let availableLicenses = figshareLicenseCache.get(cacheKey);
  if (availableLicenses == null) {
    availableLicenses = await client.listLicenses();
    figshareLicenseCache.set(cacheKey, availableLicenses);
  }
  if (!_.isArray(availableLicenses) || availableLicenses.length === 0) {
    return licenseValue;
  }

  const matched = availableLicenses.find((license: AnyRecord) =>
    matchesLicense(config.metadata.license.matchBy, String(licenseValue), license)
  );
  if (_.isNil(matched)) {
    throw validationError(`Unable to resolve Figshare license '${licenseValue}'`);
  }

  return _.get(matched, 'value', _.get(matched, 'id', licenseValue));
}

function validatePayload(config: FigsharePublishingConfigData, payload: AnyRecord): void {
  if (_.trim(String(payload.title ?? '')) === '') {
    throw validationError('Figshare title is required');
  }
  if (_.trim(String(payload.description ?? '')) === '') {
    throw validationError('Figshare description is required');
  }
  if (config.metadata.license.required && _.isNil(payload.license)) {
    throw validationError('Figshare license is required');
  }
  for (const customField of config.metadata.customFields) {
    const value = _.get(payload, ['custom_fields', customField.figshareField]);
    for (const validation of customField.validations || []) {
      if (validation.type === 'required' && (_.isNil(value) || value === '')) {
        throw validationError(`Figshare custom field '${customField.figshareField}' is required`);
      }
      if (validation.type === 'maxLength' && typeof value === 'string' && validation.value != null && value.length > validation.value) {
        throw validationError(`Figshare custom field '${customField.figshareField}' exceeds max length ${validation.value}`);
      }
      if (validation.type === 'url' && typeof value === 'string' && value !== '' && !/^https?:\/\//i.test(value)) {
        throw validationError(`Figshare custom field '${customField.figshareField}' must be a URL`);
      }
      if (validation.type === 'doi' && typeof value === 'string' && value !== '' && !/^10\.\d{4,9}\//.test(value)) {
        throw validationError(`Figshare custom field '${customField.figshareField}' must be a DOI`);
      }
    }
  }
}

export async function buildMetadataPayload(config: FigsharePublishingConfigData, record: AnyRecord, client?: FigshareClient): Promise<AnyRecord> {
  const payload: AnyRecord = {
    title: await evaluateBinding(config.metadata.title, record),
    description: await evaluateBinding(config.metadata.description, record),
    keywords: await evaluateBinding(config.metadata.keywords, record),
    defined_type: config.article.itemType
  };

  if (config.article.groupId != null) {
    payload.group_id = config.article.groupId;
  }

  const funding = await evaluateBinding(config.metadata.funding, record);
  if (!_.isNil(funding) && funding !== '') {
    payload.funding = funding;
  }

  const categorySource = await evaluateBinding(config.metadata.categories.source, record);
  const sourceCodes = _.castArray(categorySource).filter(Boolean).map((item: unknown) =>
    _.isPlainObject(item) ? String(_.get(item, 'notation', _.get(item, 'code', ''))) : String(item)
  );
  const mappedCategories = sourceCodes
    .map((sourceCode: string) =>
      config.categories.mappingTable.find((entry) => entry.sourceCode === sourceCode)?.figshareCategoryId
    )
    .filter((value: number | undefined) => value != null);
  payload.categories = mappedCategories;

  if (!config.categories.allowUnmapped && sourceCodes.length > 0 && mappedCategories.length === 0) {
    throw validationError('No Figshare categories mapped for selected record categories');
  }

  const licenseValue = client == null
    ? await evaluateBinding(config.metadata.license.source, record)
    : await resolveLicense(client, config, record);
  if (!_.isNil(licenseValue) && licenseValue !== '') {
    payload.license = licenseValue;
  }

  if (client != null) {
    const authors = await resolveAuthors(client, config, record);
    if (authors.length > 0) {
      payload.authors = authors;
    }
  }

  if (config.metadata.relatedResource) {
    payload.related_materials = [{
      title: await evaluateBinding(config.metadata.relatedResource.title, record),
      identifier: await evaluateBinding(config.metadata.relatedResource.doi, record)
    }];
  }

  if (config.metadata.customFields.length > 0) {
    const customFields: AnyRecord = {};
    for (const customField of config.metadata.customFields) {
      customFields[customField.figshareField] = await evaluateBinding(customField.value, record);
    }
    payload.custom_fields = customFields;
  }

  validatePayload(config, payload);
  return payload;
}

export async function syncMetadataPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: AnyRecord, plan: FigsharePublicationPlan): Promise<AnyRecord> {
  const payload = await buildMetadataPayload(config, record, client);
  if (plan.action === 'create') {
    return client.createArticle(payload);
  }
  return client.updateArticle(String(plan.articleId ?? ''), payload);
}
