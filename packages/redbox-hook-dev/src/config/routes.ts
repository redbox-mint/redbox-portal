/**
 * Demo routes configuration for redbox-hook-dev.
 *
 * Sets the root redirect to the demo rdmp portal home.
 */

import type { RoutesConfig } from '@researchdatabox/redbox-core';

export const routes: Partial<RoutesConfig> = {
    '/': '/default/rdmp/home',
};
