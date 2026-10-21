import type { PublicationVocabularyResolution } from '../publication-vocabulary/contracts';
import { PublicationVocabularyError } from '../publication-vocabulary/contracts';

/** Numeric categories exist only at the legacy/provider boundary, never in shared resolution. */
export function figshareCategoryId(target: { namespace: string; value: string }): number {
  if (
    !target.namespace.startsWith('figshare:') ||
    !/^[1-9][0-9]*$/.test(target.value) ||
    !Number.isSafeInteger(Number(target.value))
  )
    throw new PublicationVocabularyError('Target is not a verified Figshare category');
  return Number(target.value);
}
export function legacyFigshareResolution(result: PublicationVocabularyResolution, outputs: string) {
  if (!['categoryId', 'label', 'sourceId'].includes(outputs))
    throw new PublicationVocabularyError('Unsupported Figshare crosswalk output');
  const values =
    outputs === 'categoryId'
      ? [...new Set(result.matches.map(match => figshareCategoryId(match.target)))].sort((a, b) => a - b)
      : [...new Set(result.matches.map(match => (outputs === 'label' ? match.target.label : match.target.sourceId)))];
  return {
    values,
    normalizedCodes: result.normalizedCodes,
    unresolvedCodes: result.unresolvedCodes,
    historicalTargets: result.historicalTargets.map(match => ({
      code: match.code,
      categoryId: figshareCategoryId(match.target),
      sourceId: match.target.sourceId,
    })),
  };
}
