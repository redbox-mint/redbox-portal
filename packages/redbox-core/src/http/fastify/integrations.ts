import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RouteBinding } from './routes';
import { readRequest, readAction } from './readActions';
import { integrationAdministratorPrelude } from '../actions/integrationGuard';
import { formVocabularyPrelude, formVocabularyFailure } from '../actions/formVocabulary';
import { formVocabularyRoutes } from '../integrationRoutes';
const lookups = new Set(formVocabularyRoutes.map(route => route.controller + '\0' + route.action));
/** Final executable targets retain their shared actor prelude before host validation. */
export async function integrationGuard(binding: RouteBinding, request: FastifyRequest, reply: FastifyReply) {
  const facts = readRequest(request),
    { controller, action } = binding.route.declaration;
  let result;
  if (lookups.has(controller + '\0' + action)) {
    try {
      formVocabularyPrelude(facts);
    } catch (error) {
      result = formVocabularyFailure(
        { log: { error: () => request.log.error('FORM_VOCABULARY_FAILED') } },
        facts,
        error,
        action
      );
    }
  } else result = integrationAdministratorPrelude(facts);
  if (result) return readAction(request, reply, async () => result, undefined, true);
}
