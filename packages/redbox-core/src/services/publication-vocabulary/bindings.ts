import { evaluateSimpleBinding, validateSimpleBinding, type SimpleValueBinding } from '../integration-v2/bindings';
import type { PublicationVocabularyResolveInput, PublicationVocabularyResolution } from './contracts';
import { PublicationVocabularyError } from './contracts';

export interface PublicationCrosswalkBinding {
  kind: 'crosswalk';
  source: SimpleValueBinding;
  crosswalkId: string;
  sourceVocabularyId: string;
  outputs?: PublicationVocabularyResolveInput['outputs'];
  revision?: number;
  defaultValue?: unknown;
}
/** Provider contexts stay with the caller; crosswalk output is always a namespaced/string value. */
export async function resolvePublicationCrosswalkBinding(
  binding: PublicationCrosswalkBinding,
  target: object,
  context: {
    brandId: string;
    resolve: (input: PublicationVocabularyResolveInput) => Promise<PublicationVocabularyResolution>;
  }
): Promise<PublicationVocabularyResolution> {
  if (!binding.source || !['path', 'handlebars', 'jsonata'].includes(binding.source.kind))
    throw new PublicationVocabularyError('A crosswalk requires a simple source binding');
  validateSimpleBinding(binding.source, 'Publication vocabulary');
  if (!binding.crosswalkId?.trim() || !binding.sourceVocabularyId?.trim() || !context.brandId.trim())
    throw new PublicationVocabularyError('Brand, crosswalk and source vocabulary are required');
  const raw = await evaluateSimpleBinding(binding.source, target, 'Publication vocabulary');
  const candidates: unknown[] = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  if (!candidates.every(value => typeof value === 'string' || typeof value === 'number'))
    throw new PublicationVocabularyError('Crosswalk source must resolve to codes');
  return context.resolve({
    brandId: context.brandId,
    crosswalkId: binding.crosswalkId,
    sourceVocabularyId: binding.sourceVocabularyId,
    codes: candidates.map(String),
    outputs: binding.outputs,
    revision: binding.revision,
  });
}
