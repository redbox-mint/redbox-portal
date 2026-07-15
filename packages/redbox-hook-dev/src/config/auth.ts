/**
 * Demo auth configuration for redbox-hook-dev.
 *
 * Sets the default portal to 'rdmp' for demo environments.
 */

import type { AuthBootstrapConfig } from '@researchdatabox/redbox-core';

export const auth: Partial<AuthBootstrapConfig> = {
    defaultPortal: 'rdmp',
    postLogoutRedir: '/default/rdmp/home',
};
