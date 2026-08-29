/**
 * Demo routes configuration for redbox-hook-dev.
 *
 * Sets the root redirect to the demo rdmp portal home.
 */

import { createRouteId, scopeAuthorization, type RoutesConfig } from '@researchdatabox/redbox-core';

const rootAuthorization = scopeAuthorization('portal.home.read');

export const routes: Partial<RoutesConfig> = {
  '/': {
    target: '/default/rdmp/home',
    authorization: rootAuthorization,
    routeId: createRouteId({ path: '/', action: 'redirect', authorization: rootAuthorization }),
  },
};
