import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Rva } from '../../vocabulary/RvaImport';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import { integrationAdministratorPrelude } from './integrationGuard';
type Contract = Pick<ApiRouteDefinition, 'request'>;
import { prepareReferenceRequest, type RequestPreparation } from './requestPreparation';
export const optionalSyncBodyPreparation: RequestPreparation<unknown> = {
  run: (_input, req) => (req.body === undefined ? { ...req, body: {} } : req),
};
export interface VocabularyIntegrationInput {
  readonly rva: Pick<Rva.RvaImport, 'importRvaVocabulary' | 'syncRvaVocabulary'>;
  readonly vocabulary: Pick<Vocabulary.VocabularyService, 'getById'>;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; vocabularyId: string }
  ): Promise<unknown>;
  readonly log: ILogger;
}
export function vocabularyIntegrationFailure(
  input: Pick<VocabularyIntegrationInput, 'log'>,
  req: ReferenceRequest
): ReferenceResult {
  req.recordFailure?.();
  input.log.error('Vocabulary import or sync failed');
  return referenceErrors(req, 400, [
    {
      detail: 'Vocabulary import or sync failed. Earlier steps may have applied; retry after reviewing the vocabulary.',
    },
  ]);
}
async function administer(
  input: VocabularyIntegrationInput,
  req: ReferenceRequest,
  contract: Contract,
  sync: boolean,
  browser: boolean
): Promise<ReferenceResult> {
  const refusal = integrationAdministratorPrelude(req);
  if (refusal) return refusal;
  const request = browser && sync ? await prepareReferenceRequest(input, req, optionalSyncBodyPreparation) : req;
  const valid = validateApiRouteRequest(request, contract);
  if (!valid.valid) return referenceValidationErrors(req, valid.issues);
  const body = valid.body as { rvaId?: string; versionId?: string };
  const versionId = body.versionId || undefined;
  if ((!sync && !body.rvaId?.trim()) || (versionId !== undefined && !/^\d+$/.test(versionId)))
    return referenceErrors(req, 400, [{ detail: 'Invalid RVA vocabulary or version id' }]);
  const { actor, brand } = req.context;
  const id = valid.params.id as string | undefined;
  if (id) {
    const vocabulary = await input.vocabulary.getById(id);
    if (!vocabulary || vocabulary.branding !== brand.id)
      return referenceErrors(req, 404, [{ detail: 'Vocabulary not found' }]);
  }
  const result = id
    ? await input.rva.syncRvaVocabulary(id, versionId)
    : await input.rva.importRvaVocabulary(body.rvaId!, versionId, brand.id);
  const vocabularyId = id ?? String(Reflect.get(result, 'id'));
  await input.audit(actor!, sync ? 'sync-vocabulary' : 'import-vocabulary', { brandId: brand.id, vocabularyId });
  return referenceData(req, result);
}
export const importVocabulary = (
  input: VocabularyIntegrationInput,
  req: ReferenceRequest,
  contract: Contract,
  browser = false
) => administer(input, req, contract, false, browser);
export const sync = (input: VocabularyIntegrationInput, req: ReferenceRequest, contract: Contract, browser = false) =>
  administer(input, req, contract, true, browser);
