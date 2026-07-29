/**
 * Demo views configuration for redbox-hook-dev.
 *
 * Adds demo portal paths to the noCache list.
 */

import type { ViewsConfig } from '@researchdatabox/redbox-core';

export const views: Partial<ViewsConfig> = {
    noCache: [
        '/default/rdmp/researcher/home',
        '/default/rdmp/home',
        '/',
    ],
};
