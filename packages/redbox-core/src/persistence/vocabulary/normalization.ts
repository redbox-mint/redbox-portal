import { buildInvalidNewRecordError, buildInvalidUpdateRecordError } from '../validationErrors';
import { toBoolean } from '@researchdatabox/sails-ng-common';
interface EntryValidationRow {
  id?: string;
  vocabulary?: unknown;
  parent?: unknown;
}
function requireTrimmed(record: Record<string, unknown>, field: string, isCreate: boolean, entity: string): void {
  if (record[field] === undefined && !isCreate) return;
  const value = String(record[field] ?? '').trim();
  if (!value)
    throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
      entity + '.' + field + ' is required'
    );
  record[field] = value;
}
const VALID_TYPES = new Set(['flat', 'tree']);
const VALID_SOURCES = new Set(['local', 'rva', 'external']);
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-\d{6,}$/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasName = typeof record.name !== 'undefined';
  const name = hasName ? String(record.name ?? '').trim() : '';
  if (isCreate && !name) {
    throw buildInvalidNewRecordError('Vocabulary.name is required');
  }
  if (hasName && !name) {
    throw buildInvalidUpdateRecordError('Vocabulary.name is required');
  }
  if (hasName) {
    record.name = name;
  }

  const hasType = typeof record.type !== 'undefined';
  const type = String((hasType ? record.type : isCreate ? 'flat' : undefined) ?? '').toLowerCase();
  if (type) {
    if (!VALID_TYPES.has(type)) {
      throw new Error(`Vocabulary.type must be one of: ${Array.from(VALID_TYPES).join(', ')}`);
    }
    record.type = type;
  }

  const hasSource = typeof record.source !== 'undefined';
  const source = String((hasSource ? record.source : isCreate ? 'local' : undefined) ?? '').toLowerCase();
  if (source) {
    if (!VALID_SOURCES.has(source)) {
      throw new Error(`Vocabulary.source must be one of: ${Array.from(VALID_SOURCES).join(', ')}`);
    }
    record.source = source;
  }

  const hasSlug = typeof record.slug !== 'undefined';
  if (hasSlug || hasName || isCreate) {
    const rawSlug = hasSlug ? String(record.slug).trim() : '';
    const slugSource = rawSlug && rawSlug !== '__AUTO__' ? rawSlug : name;
    record.slug = slugify(slugSource);
    if ((isCreate || hasSlug || hasName) && !String(record.slug ?? '').trim()) {
      throw new Error('Vocabulary.slug is required');
    }
  }

  const effectiveSource = source || String(record.source ?? '');
  if (effectiveSource === 'rva') {
    const sourceId = String(record.sourceId ?? '').trim();
    if (!sourceId) {
      throw new Error('Vocabulary.sourceId is required when source = rva');
    }
    record.sourceId = sourceId;
    record.rvaSourceKey = `${effectiveSource}:${sourceId}`;
  } else if (hasSource || isCreate) {
    delete record.rvaSourceKey;
  }
};
const isLikelyMongoId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);
export const normalizeVocabulary = async (
  record: Record<string, unknown>,
  isCreate: boolean,
  findBrand: (name: string) => Promise<{ id: string } | null>
): Promise<void> => {
  normalize(record, isCreate);

  const hasBranding = typeof record.branding !== 'undefined';
  if (!hasBranding) {
    if (isCreate) {
      throw buildInvalidNewRecordError('Vocabulary.branding is required');
    }
    return;
  }

  const brandingValue = String(record.branding ?? '').trim();
  if (!brandingValue) {
    throw buildInvalidUpdateRecordError('Vocabulary.branding is required');
  }

  if (isLikelyMongoId(brandingValue)) {
    record.branding = brandingValue;
    return;
  }

  const branding = await findBrand(brandingValue);
  if (!branding?.id) {
    throw new Error(`Vocabulary.branding '${brandingValue}' not found`);
  }
  record.branding = String(branding.id);
};
export const normalizeEntryFields = (record: Record<string, unknown>, isCreate: boolean): void => {
  // On create, the record.label must be present and be a non-empty string.
  // On update, the record.label may be present and must be a non-empty string if it is present.
  const label = String(record.label ?? '').trim();
  const hasLabelProp = Object.hasOwn(record, 'label');
  const hasLabelVal = !!record.label;
  if (isCreate && !hasLabelVal) {
    throw buildInvalidNewRecordError('VocabularyEntry.label is required');
  } else if (!isCreate && hasLabelProp && !hasLabelVal) {
    throw buildInvalidUpdateRecordError('VocabularyEntry.label is required');
  } else if ((isCreate && hasLabelVal) || (!isCreate && hasLabelProp && hasLabelVal)) {
    record.label = label;
    record.labelLower = label.toLowerCase();
  }

  // On create, the record.value must be persent and be a string, which can be a non-empty string.
  // On update, the record.value may be persent and must be a string, which can be a non-empty string, if it is present.
  const value = String(record.value ?? '').trim();
  const hasValueProp = Object.hasOwn(record, 'value');
  const hasValueVal = record.value !== undefined && record.value !== null;
  if (isCreate && !hasValueVal) {
    throw buildInvalidNewRecordError('VocabularyEntry.value is required');
  } else if (!isCreate && hasValueProp && !hasValueVal) {
    throw buildInvalidUpdateRecordError('VocabularyEntry.value is required');
  } else if ((isCreate && hasValueVal) || (!isCreate && hasValueProp && hasValueVal)) {
    record.value = value;
    record.valueLower = value.toLowerCase();
  }

  // On either create or update, the record.historical may be present, normalise it to a bool if it is present.
  if (Object.hasOwn(record, 'historical')) {
    record.historical = toBoolean(record.historical);
  }
};
export const validateEntryParent = async (record: Record<string, unknown>, findEntry: EntryLookup): Promise<void> => {
  if (!record.parent) {
    return;
  }

  if (record.id && String(record.parent) === String(record.id)) {
    throw new Error('VocabularyEntry cannot parent itself');
  }

  const parent = await findEntry({ id: String(record.parent) });
  if (!parent) {
    throw new Error('VocabularyEntry.parent not found');
  }

  let recordVocabulary = record.vocabulary ? String(record.vocabulary) : '';
  if (!recordVocabulary && record.id) {
    const existing = await findEntry({ id: String(record.id) });
    if (!existing) {
      throw new Error('VocabularyEntry not found for parent validation');
    }
    if (existing.vocabulary) {
      recordVocabulary = String(existing.vocabulary);
    }
  }

  if (recordVocabulary && String(parent.vocabulary) !== recordVocabulary) {
    throw new Error('VocabularyEntry.parent must belong to the same vocabulary');
  }

  const recordId = record.id ? String(record.id) : '';
  const visited = new Set<string>();
  let cursor: EntryValidationRow | null = parent as EntryValidationRow;
  while (cursor?.id) {
    const currentId = String(cursor.id);
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    if (recordId && currentId === recordId) {
      throw new Error('VocabularyEntry cycle detected');
    }
    if (!cursor.parent) {
      break;
    }
    cursor = (await findEntry({ id: String(cursor.parent) })) as EntryValidationRow | null;
  }
};
export const validateEntryIdentifier = async (
  record: Record<string, unknown>,
  findEntry: EntryLookup
): Promise<void> => {
  const identifier = String(record.identifier ?? '').trim();

  let recordVocabulary = record.vocabulary ? String(record.vocabulary) : '';
  if (!recordVocabulary && record.id) {
    const existing = await findEntry({ id: String(record.id) });
    if (!existing) {
      throw new Error('VocabularyEntry not found for parent validation');
    }
    if (existing.vocabulary) {
      recordVocabulary = String(existing.vocabulary);
    }
  }

  if (!identifier || !recordVocabulary) {
    return;
  }
  const recordId = record.id ? String(record.id) : '';
  const duplicate = (await findEntry({ vocabulary: recordVocabulary, identifier })) as EntryValidationRow | null;
  if (duplicate && (!recordId || String(duplicate.id) !== recordId)) {
    throw new Error('VocabularyEntry.identifier must be unique within a vocabulary');
  }
};
type EntryLookup = (lookup: {
  id?: string;
  vocabulary?: string;
  identifier?: string;
}) => Promise<EntryValidationRow | null>;
export async function normalizeEntry(
  record: Record<string, unknown>,
  isCreate: boolean,
  findEntry: EntryLookup
): Promise<void> {
  normalizeEntryFields(record, isCreate);
  await validateEntryIdentifier(record, findEntry);
  await validateEntryParent(record, findEntry);
}
export const FIGSHARE_VOCABULARY_SCOPES = ['public', 'account'] as const;
export type FigshareVocabularyScope = (typeof FIGSHARE_VOCABULARY_SCOPES)[number];
const VALID_SCOPES = new Set<string>(FIGSHARE_VOCABULARY_SCOPES);
export const normalizeSource = (record: Record<string, unknown>, isCreate: boolean): void => {
  requireTrimmed(record, 'taxonomyId', isCreate, 'FigshareVocabularySource');
  requireTrimmed(record, 'displayName', isCreate, 'FigshareVocabularySource');
  requireTrimmed(record, 'createdBy', isCreate, 'FigshareVocabularySource');
  requireTrimmed(record, 'updatedBy', isCreate, 'FigshareVocabularySource');

  const hasScope = typeof record.scope !== 'undefined';
  if (!hasScope) {
    if (isCreate) {
      throw buildInvalidNewRecordError('FigshareVocabularySource.scope is required');
    }
    return;
  }
  const scope = String(record.scope ?? '')
    .trim()
    .toLowerCase();
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`FigshareVocabularySource.scope must be one of: ${FIGSHARE_VOCABULARY_SCOPES.join(', ')}`);
  }
  record.scope = scope;
};
export const normalizeCategory = (record: Record<string, unknown>, isCreate: boolean): void => {
  requireTrimmed(record, 'sourceId', isCreate, 'FigshareVocabularyCategory');
  requireTrimmed(record, 'taxonomyId', isCreate, 'FigshareVocabularyCategory');
  requireTrimmed(record, 'contentHash', isCreate, 'FigshareVocabularyCategory');
  requireTrimmed(record, 'firstSeenAt', isCreate, 'FigshareVocabularyCategory');
  requireTrimmed(record, 'lastSeenAt', isCreate, 'FigshareVocabularyCategory');

  if (typeof record.parentSourceId !== 'undefined' && record.parentSourceId !== null) {
    record.parentSourceId = String(record.parentSourceId).trim();
  }

  const hasCategoryId = typeof record.categoryId !== 'undefined';
  if (!hasCategoryId) {
    if (isCreate) {
      throw buildInvalidNewRecordError('FigshareVocabularyCategory.categoryId is required');
    }
  } else {
    const categoryId = Number(record.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new Error('FigshareVocabularyCategory.categoryId must be a positive integer');
    }
    record.categoryId = categoryId;
  }

  if (typeof record.path !== 'undefined' && !Array.isArray(record.path)) {
    throw new Error('FigshareVocabularyCategory.path must be an array of sourceIds');
  }

  for (const flag of ['selectable', 'historical']) {
    if (Object.hasOwn(record, flag)) {
      record[flag] = toBoolean(record[flag]);
    }
  }
};
export const FIGSHARE_CROSSWALK_STATUSES = ['draft', 'approved', 'archived'] as const;
export type FigshareCrosswalkStatus = (typeof FIGSHARE_CROSSWALK_STATUSES)[number];
const VALID_STATUSES = new Set<string>(FIGSHARE_CROSSWALK_STATUSES);
export const normalizeCrosswalk = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasName = typeof record.name !== 'undefined';
  if (isCreate && !hasName) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalk.name is required');
  }
  if (hasName) {
    const name = String(record.name ?? '').trim();
    if (!name) {
      throw isCreate
        ? buildInvalidNewRecordError('FigshareVocabularyCrosswalk.name is required')
        : buildInvalidUpdateRecordError('FigshareVocabularyCrosswalk.name is required');
    }
    record.name = name;
  }

  const hasUpdatedBy = typeof record.updatedBy !== 'undefined';
  if (isCreate && !hasUpdatedBy) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalk.updatedBy is required');
  }
  if (hasUpdatedBy) {
    const updatedBy = String(record.updatedBy ?? '').trim();
    if (!updatedBy) {
      throw isCreate
        ? buildInvalidNewRecordError('FigshareVocabularyCrosswalk.updatedBy is required')
        : buildInvalidUpdateRecordError('FigshareVocabularyCrosswalk.updatedBy is required');
    }
    record.updatedBy = updatedBy;
  }

  const hasStatus = typeof record.status !== 'undefined';
  const status = String((hasStatus ? record.status : isCreate ? 'draft' : undefined) ?? '').toLowerCase();
  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`FigshareVocabularyCrosswalk.status must be one of: ${FIGSHARE_CROSSWALK_STATUSES.join(', ')}`);
    }
    record.status = status;
  }

  for (const field of ['workingRevision', 'approvedRevision']) {
    if (typeof record[field] === 'undefined' || record[field] === null) {
      continue;
    }
    const revision = Number(record[field]);
    if (!Number.isInteger(revision) || revision <= 0) {
      throw new Error(`FigshareVocabularyCrosswalk.${field} must be a positive integer`);
    }
    record[field] = revision;
  }

  const workingRevision = Number(record.workingRevision ?? 0);
  const approvedRevision = Number(record.approvedRevision ?? 0);
  if (workingRevision > 0 && approvedRevision > 0 && approvedRevision > workingRevision) {
    throw new Error('FigshareVocabularyCrosswalk.approvedRevision must be less than or equal to workingRevision');
  }

  if (record.status === 'approved' && !String(record.approvedBy ?? '').trim()) {
    throw new Error('FigshareVocabularyCrosswalk.approvedBy is required when status = approved');
  }
};
export const FIGSHARE_MAPPING_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type FigshareMappingStatus = (typeof FIGSHARE_MAPPING_STATUSES)[number];
export const FIGSHARE_MAPPING_MATCH_TYPES = [
  'exact-code',
  'identity',
  'label-suggestion',
  'manual',
  'historical',
] as const;
export type FigshareMappingMatchType = (typeof FIGSHARE_MAPPING_MATCH_TYPES)[number];
const VALID_MAPPING_STATUSES = new Set<string>(FIGSHARE_MAPPING_STATUSES);
const VALID_MATCH_TYPES = new Set<string>(FIGSHARE_MAPPING_MATCH_TYPES);
export const normalizeMapping = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasRevision = typeof record.revision !== 'undefined';
  if (isCreate && !hasRevision) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalkMapping.revision is required');
  }
  if (hasRevision) {
    const revision = Number(record.revision);
    if (!Number.isInteger(revision) || revision <= 0) {
      throw new Error('FigshareVocabularyCrosswalkMapping.revision must be a positive integer');
    }
    record.revision = revision;
  }

  const hasStatus = typeof record.status !== 'undefined';
  const status = String((hasStatus ? record.status : isCreate ? 'proposed' : undefined) ?? '').toLowerCase();
  if (status) {
    if (!VALID_MAPPING_STATUSES.has(status)) {
      throw new Error(
        `FigshareVocabularyCrosswalkMapping.status must be one of: ${FIGSHARE_MAPPING_STATUSES.join(', ')}`
      );
    }
    record.status = status;
  }

  const hasMatchType = typeof record.matchType !== 'undefined';
  if (isCreate && !hasMatchType) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalkMapping.matchType is required');
  }
  if (hasMatchType) {
    const matchType = String(record.matchType ?? '')
      .trim()
      .toLowerCase();
    if (!VALID_MATCH_TYPES.has(matchType)) {
      throw new Error(
        `FigshareVocabularyCrosswalkMapping.matchType must be one of: ${FIGSHARE_MAPPING_MATCH_TYPES.join(', ')}`
      );
    }
    record.matchType = matchType;
  }

  if (record.status === 'approved' && !String(record.approvedBy ?? '').trim()) {
    throw new Error('FigshareVocabularyCrosswalkMapping.approvedBy is required when status = approved');
  }
};
export const FIGSHARE_SYNC_RUN_STATES = ['fetching', 'previewed', 'applying', 'applied', 'failed', 'expired'] as const;
export type FigshareSyncRunState = (typeof FIGSHARE_SYNC_RUN_STATES)[number];
const VALID_STATES = new Set<string>(FIGSHARE_SYNC_RUN_STATES);
const VALID_SYNC_SCOPES = new Set(['public', 'account']);
const ALLOWED_STATE_TRANSITIONS: Record<string, readonly string[]> = {
  fetching: ['previewed', 'failed', 'expired'],
  previewed: ['applying', 'failed', 'expired'],
  applying: ['applied', 'failed'],
  applied: [],
  failed: [],
  expired: [],
};
export function isAllowedSyncRunTransition(from: string, to: string): boolean {
  if (from === to) {
    return true;
  }
  return (ALLOWED_STATE_TRANSITIONS[from] ?? []).includes(to);
}
export const normalizeSyncRun = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasState = typeof record.state !== 'undefined';
  const state = String((hasState ? record.state : isCreate ? 'fetching' : undefined) ?? '').toLowerCase();
  if (state) {
    if (!VALID_STATES.has(state)) {
      throw new Error(`FigshareVocabularySyncRun.state must be one of: ${FIGSHARE_SYNC_RUN_STATES.join(', ')}`);
    }
    record.state = state;
  }

  const hasScope = typeof record.scope !== 'undefined';
  if (isCreate && !hasScope) {
    throw buildInvalidNewRecordError('FigshareVocabularySyncRun.scope is required');
  }
  if (hasScope) {
    const scope = String(record.scope ?? '')
      .trim()
      .toLowerCase();
    if (!VALID_SYNC_SCOPES.has(scope)) {
      throw new Error('FigshareVocabularySyncRun.scope must be one of: public, account');
    }
    record.scope = scope;
  }

  for (const field of ['taxonomyId', 'normalizerVersion', 'expiresAt', 'requestedBy']) {
    const hasField = typeof record[field] !== 'undefined';
    if (isCreate && !hasField) {
      throw buildInvalidNewRecordError(`FigshareVocabularySyncRun.${field} is required`);
    }
    if (hasField) {
      const value = String(record[field] ?? '').trim();
      if (!value) {
        throw new Error(`FigshareVocabularySyncRun.${field} is required`);
      }
      record[field] = value;
    }
  }
};
