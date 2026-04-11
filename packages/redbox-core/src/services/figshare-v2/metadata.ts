import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { FigshareClient } from './http';
import {
  RecordModel,
  FigshareArticle,
  FigsharePublicationPlan,
  FigshareLicense,
  FigshareInstitutionAccount,
  RecordContributor,
  getRecordField,
} from './types';
import { evaluateBinding } from './bindings';

const figshareLicenseCache = new Map<string, FigshareLicense[]>();

function validationError(message: string): RBValidationError {
  return new RBValidationError({
    message,
    displayErrors: [{ title: message, detail: message }]
  });
}

function getDefaultContributors(config: FigsharePublishingConfigData, record: RecordModel): RecordContributor[] {
  const contributorPaths = Array.isArray(config.authors.contributorPaths) && config.authors.contributorPaths.length > 0
    ? config.authors.contributorPaths
    : ['metadata.contributor_ci', 'metadata.contributor_data_manager', 'metadata.dataOwner', 'metadata.chiefInvestigator', 'metadata.contributors'];
  const contributors = contributorPaths
    .flatMap((contributorPath: string) => {
      const value = getRecordField(record, contributorPath);
      return Array.isArray(value) ? value : value != null ? [value] : [];
    })
    .filter((entry: unknown) => typeof entry === 'object' && entry != null && !Array.isArray(entry)) as RecordContributor[];
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

  const prefix = (config.authors.emailTransform.prefix ?? '').trim();
  const domainOverride = (config.authors.emailTransform.domainOverride ?? '').trim();
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

async function resolveAuthors(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel): Promise<Array<{ id?: number | string; name?: string }>> {
  const contributors = getDefaultContributors(config, record);
  if (contributors.length === 0) {
    return [];
  }

  const uniqueContributors = config.authors.uniqueBy === 'none'
    ? contributors
    : _.uniqBy(contributors, (entry) => String(entry[config.authors.uniqueBy] ?? ''));

  const resolvedAuthors: Array<{ id?: number | string; name?: string }> = [];
  for (const contributor of uniqueContributors.slice(0, config.authors.maxInlineAuthors)) {
    let matched = false;
    for (const rule of config.authors.lookup) {
      const rawValue = await evaluateBinding(rule.value, contributor as Record<string, unknown>);
      const value = typeof rawValue === 'string' ? applyAuthorLookupTransform(config, rule.matchBy, rawValue) : rawValue;
      if (value == null || value === '') {
        continue;
      }
      const matches: FigshareInstitutionAccount[] = await client.searchInstitutionAccounts({ [rule.matchBy]: value });
      const firstMatch = matches[0];
      if (firstMatch?.id != null && firstMatch.id !== '') {
        resolvedAuthors.push({ id: firstMatch.id });
        matched = true;
        break;
      }
    }

    if (!matched) {
      const fallbackName = contributor[config.authors.externalNameField] ?? contributor.text_full_name ?? contributor.name;
      if (fallbackName != null && fallbackName !== '') {
        resolvedAuthors.push({ name: String(fallbackName) });
      }
    }
  }

  return resolvedAuthors;
}

function matchesLicense(matchBy: FigsharePublishingConfigData['metadata']['license']['matchBy'], rawValue: string, license: FigshareLicense): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }
  if (matchBy === 'nameExact') {
    return license.name.trim().toLowerCase() === normalized;
  }
  if (matchBy === 'valueExact') {
    return String(license.value ?? license.id ?? '').trim().toLowerCase() === normalized;
  }
  const candidate = `${license.url ?? ''} ${license.name} ${license.value ?? ''}`.toLowerCase();
  return candidate.includes(normalized);
}

async function resolveLicense(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel): Promise<unknown> {
  const licenseValue = await evaluateBinding(config.metadata.license.source, record as Record<string, unknown>);
  if (licenseValue == null || licenseValue === '') {
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
  if (!Array.isArray(availableLicenses) || availableLicenses.length === 0) {
    return licenseValue;
  }

  const matched = availableLicenses.find((license) =>
    matchesLicense(config.metadata.license.matchBy, String(licenseValue), license)
  );
  if (matched == null) {
    throw validationError(`Unable to resolve Figshare license '${licenseValue}'`);
  }

  return matched.value ?? matched.id ?? licenseValue;
}

function validatePayload(config: FigsharePublishingConfigData, payload: Record<string, unknown>): void {
  if (String(payload.title ?? '').trim() === '') {
    throw validationError('Figshare title is required');
  }
  if (String(payload.description ?? '').trim() === '') {
    throw validationError('Figshare description is required');
  }
  if (config.metadata.license.required && payload.license == null) {
    throw validationError('Figshare license is required');
  }
  const customFields = payload.custom_fields as Record<string, unknown> | undefined;
  for (const customField of config.metadata.customFields) {
    const value = customFields?.[customField.figshareField];
    for (const validation of customField.validations || []) {
      if (validation.type === 'required' && (value == null || value === '')) {
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

export async function buildMetadataPayload(config: FigsharePublishingConfigData, record: RecordModel, client?: FigshareClient): Promise<Record<string, unknown>> {
  const recordData = record as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    title: await evaluateBinding(config.metadata.title, recordData),
    description: await evaluateBinding(config.metadata.description, recordData),
    keywords: await evaluateBinding(config.metadata.keywords, recordData),
    defined_type: config.article.itemType
  };

  if (config.article.groupId != null) {
    payload.group_id = config.article.groupId;
  }

  const funding = await evaluateBinding(config.metadata.funding, recordData);
  if (funding != null && funding !== '') {
    payload.funding = funding;
  }

  const categorySource = await evaluateBinding(config.metadata.categories.source, recordData);
  const sourceItems = Array.isArray(categorySource) ? categorySource : categorySource != null ? [categorySource] : [];
  const sourceCodes = sourceItems.filter(Boolean).map((item: unknown) =>
    typeof item === 'object' && item != null
      ? String((item as Record<string, unknown>).notation ?? (item as Record<string, unknown>).code ?? '')
      : String(item)
  );
  const mappedCategories = sourceCodes
    .map((sourceCode: string) =>
      config.categories.mappingTable.find((entry) => entry.sourceCode === sourceCode)?.figshareCategoryId
    )
    .filter((value): value is number => value != null);
  payload.categories = mappedCategories;

  if (!config.categories.allowUnmapped && sourceCodes.length > 0 && mappedCategories.length === 0) {
    throw validationError('No Figshare categories mapped for selected record categories');
  }

  const licenseValue = client == null
    ? await evaluateBinding(config.metadata.license.source, recordData)
    : await resolveLicense(client, config, record);
  if (licenseValue != null && licenseValue !== '') {
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
      title: await evaluateBinding(config.metadata.relatedResource.title, recordData),
      identifier: await evaluateBinding(config.metadata.relatedResource.doi, recordData)
    }];
  }

  if (config.metadata.customFields.length > 0) {
    const customFieldsPayload: Record<string, unknown> = {};
    for (const customField of config.metadata.customFields) {
      customFieldsPayload[customField.figshareField] = await evaluateBinding(customField.value, recordData);
    }
    payload.custom_fields = customFieldsPayload;
  }

  validatePayload(config, payload);
  return payload;
}

export async function syncMetadataPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, plan: FigsharePublicationPlan): Promise<FigshareArticle> {
  const payload = await buildMetadataPayload(config, record, client);
  if (plan.action === 'create') {
    return client.createArticle(payload);
  }
  return client.updateArticle(String(plan.articleId ?? ''), payload);
}
