import { cloneDeep } from 'lodash';
import { normalizeCategoryCode } from '../figshare-v2/categories';
import type {
  PublicationVocabularyCrosswalk,
  PublicationVocabularyResolveInput,
  PublicationVocabularyResolution,
} from './contracts';
import { PublicationVocabularyError } from './contracts';

export function normalizeVocabularyCode(
  value: string,
  normalizer: PublicationVocabularyCrosswalk['normalizer']
): string {
  return normalizer === 'figshare-code-v1' ? normalizeCategoryCode(value) : value.trim();
}
export function resolvePublicationVocabulary(
  crosswalk: PublicationVocabularyCrosswalk,
  input: PublicationVocabularyResolveInput
): PublicationVocabularyResolution {
  if (
    !Array.isArray(input.codes) ||
    !input.codes.every(code => typeof code === 'string') ||
    (input.outputs !== undefined && !['targetId', 'value', 'sourceId', 'label'].includes(input.outputs)) ||
    (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1))
  )
    throw new PublicationVocabularyError('Invalid vocabulary resolution request');
  if (
    crosswalk.brandId !== input.brandId ||
    crosswalk.id !== input.crosswalkId ||
    crosswalk.localVocabularyId !== input.sourceVocabularyId
  )
    throw new PublicationVocabularyError('Crosswalk does not belong to this brand and local vocabulary', 404);
  if (input.revision === undefined && crosswalk.status === 'archived')
    throw new PublicationVocabularyError('Crosswalk is archived', 409);
  const revision = crosswalk.revisions.find(row => row.revision === (input.revision ?? crosswalk.approvedRevision));
  if (!revision?.approvedAt || !revision.approvedBy)
    throw new PublicationVocabularyError('Crosswalk has no matching approved revision', 409);
  const codes = [
    ...new Set(input.codes.map(code => normalizeVocabularyCode(code, crosswalk.normalizer)).filter(Boolean)),
  ];
  const entries = new Map<string, string>();
  for (const entry of revision.entries)
    for (const code of entry.codes) {
      const key = normalizeVocabularyCode(code, crosswalk.normalizer);
      if (!entries.has(key)) entries.set(key, entry.id);
    }
  const targets = new Map(revision.targets.map(target => [target.id, target]));
  const result: PublicationVocabularyResolution = {
    crosswalkId: crosswalk.id,
    revision: revision.revision,
    revisionDigest: revision.digest,
    normalizedCodes: codes,
    values: [],
    matches: [],
    unresolvedCodes: [],
    historicalTargets: [],
  };
  for (const code of codes) {
    const entry = entries.get(code);
    const mappings = entry
      ? revision.mappings.filter(row => row.localEntryId === entry && row.status === 'approved')
      : [];
    let resolved = false;
    for (const mapping of mappings) {
      const target = targets.get(mapping.targetId);
      if (!target) throw new PublicationVocabularyError('Approved revision has a missing target', 409);
      resolved = true;
      if (target.historical) {
        result.historicalTargets.push({ code, target: cloneDeep(target) });
        continue;
      }
      result.matches.push({ code, target: cloneDeep(target) });
      const value =
        input.outputs === 'label'
          ? target.label
          : input.outputs === 'sourceId'
            ? target.sourceId
            : input.outputs === 'value'
              ? target.value
              : target.id;
      if (!result.values.includes(value)) result.values.push(value);
    }
    if (!resolved) result.unresolvedCodes.push(code);
  }
  return result;
}
