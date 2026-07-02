import type { WorkspaceTypeConfig } from '@researchdatabox/redbox-core';

/**
 * Demo workspace type definition.
 * Moved out of @researchdatabox/redbox-core; supplied via redbox-hook-dev.
 */
export const workspacetype: WorkspaceTypeConfig = {
    'existing-locations': {
        name: 'existing-locations',
        label: '@existing-locations-label',
        subtitle: '@existing-locations-label',
        description: '@existing-locations-description',
        logo: '/images/blank.png'
    }
};
