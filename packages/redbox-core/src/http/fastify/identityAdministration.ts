import type { FastifyRequest, FastifyReply } from 'fastify';
import { readRequest, readAction } from './readActions';
import { identityAdministrationPrelude, identityAdministrationFailure } from '../actions/identityAdministration';
import { identityLinkPrelude } from '../actions/identityLinks';
import { administrationPrelude } from '../actions/administration';
import type { RouteBinding } from './routes';
const linkActions = new Set([
  'listUsers',
  'getUser',
  'getUsers',
  'searchLinkCandidates',
  'getUserLinks',
  'getUserAudit',
  'linkAccounts',
]);
/** Only pre-validation guards live here. Every guard is also called by the shared
 * action; complete route replacements keep host-owned validation and preludes. */
export async function identityAdministrationGuard(binding: RouteBinding, request: FastifyRequest, reply: FastifyReply) {
  const { controller, action } = binding.route.declaration;
  const facts = readRequest(request);
  let result;
  try {
    if (controller === 'webservice/AdminController') result = administrationPrelude(facts, true);
    else if (controller === 'webservice/SiemController') result = administrationPrelude(facts);
    else if (linkActions.has(action)) result = identityLinkPrelude(facts);
    else result = identityAdministrationPrelude(facts, controller === 'UserController');
  } catch (error) {
    result = identityAdministrationFailure(
      { log: { error: () => request.log.error('USER_ADMINISTRATION_FAILED') } },
      facts,
      error,
      controller === 'UserController' && action === 'update'
    );
  }
  if (result) return readAction(request, reply, async () => result, undefined, true);
}
