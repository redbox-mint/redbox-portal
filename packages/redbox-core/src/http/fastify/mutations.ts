import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RouteBinding } from './routes';
import { readRequest, readAction } from './readActions';
import { recordMutationPrelude, recordMutationFailure } from '../actions/recordMutations';
import { recordMetadataActorPrelude } from '../actions/recordMetadata';
import { queryWritePrelude } from '../actions/queryWrites';
import { harvestMutationPrelude } from '../actions/harvestMutations';
import { configurationWritePrelude, configurationWriteFailure } from '../actions/configurationWrites';
import { configurationWriteRoutes, queryWriteRoutes, harvestMutationRoutes } from '../mutationRoutes';
const configurationControllers = new Set(configurationWriteRoutes.map(route => route.controller));
const queryControllers = new Set(queryWriteRoutes.map(route => route.controller));
/** Shared preludes stay ahead of declared validation and extension dispatch.
 * Ownership is selected from final resolved executable targets, including aliases. */
export async function mutationGuard(binding: RouteBinding, request: FastifyRequest, reply: FastifyReply) {
  const { controller, action } = binding.route.declaration;
  const facts = readRequest(request);
  let result;
  if (configurationControllers.has(controller)) {
    try {
      configurationWritePrelude(facts, action);
    } catch (error) {
      result = configurationWriteFailure(
        facts,
        error,
        controller.includes('DashboardConfigController'),
        !binding.route.declaration.path.includes('/api/'),
        action,
        controller === 'TranslationController'
      );
    }
  } else if (queryControllers.has(controller)) result = queryWritePrelude(facts);
  else if (harvestMutationRoutes.some(route => route.controller === controller && route.action === action))
    result = harvestMutationPrelude(facts);
  else if (controller === 'ActionController') result = recordMetadataActorPrelude(facts);
  else {
    try {
      result = recordMutationPrelude(facts);
    } catch (error) {
      result = recordMutationFailure(
        { log: { error: () => request.log.error('RECORD_MUTATION_FAILED') } },
        facts,
        error
      );
    }
  }
  if (result) return readAction(request, reply, async () => result, undefined, true);
}
