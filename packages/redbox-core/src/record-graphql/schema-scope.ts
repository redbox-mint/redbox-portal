import type { ReadContractCandidate } from './read-contract';
import { GRID_LIMITS } from './grid-types';

/** Editor discovery scope; execution and named-query validation still use the complete schema. */
export interface ReadSchemaScope {
  recordType: string;
  workflowStages?: readonly string[];
}
export function scopeReadCandidates(
  candidates: readonly ReadContractCandidate[],
  scope?: ReadSchemaScope
): readonly ReadContractCandidate[] {
  if (scope === undefined) return candidates;
  const name = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 200;
  if (
    !scope ||
    !name(scope.recordType) ||
    (scope.workflowStages !== undefined &&
      (!Array.isArray(scope.workflowStages) ||
        scope.workflowStages.length > GRID_LIMITS.stages ||
        scope.workflowStages.some(stage => !name(stage)) ||
        new Set(scope.workflowStages).size !== scope.workflowStages.length))
  )
    throw new Error('Invalid editor schema scope.');
  const matching = candidates.filter(candidate => candidate.recordType === scope.recordType);
  if (
    !matching.length ||
    scope.workflowStages?.some(stage => !matching.some(candidate => candidate.workflowStep === stage))
  )
    throw new Error('Unknown editor schema scope.');
  return matching.filter(
    candidate => !scope.workflowStages?.length || scope.workflowStages.includes(candidate.workflowStep)
  );
}
