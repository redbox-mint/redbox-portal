import { administratorRefusal } from '../actors';
import { referenceErrors, type ReferenceRequest } from './reference';
/** The same retained actor/brand guard runs before validation and provider mapping. */
export function integrationAdministratorPrelude(request: ReferenceRequest) {
  const { actor, brand } = request.context;
  const refusal = administratorRefusal(actor, brand.id);
  if (refusal) return referenceErrors(request, refusal.status, [{ detail: refusal.detail }]);
}
