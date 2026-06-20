/**
 * Demo record configuration for redbox-hook-dev.
 *
 * Provides demo MINT URL and the @referrer_rdmp context variable.
 */

import type { RecordConfig } from '@researchdatabox/redbox-core';

export const record: Partial<RecordConfig> = {
    baseUrl: {
        redbox: "http://redbox:9000/redbox",
        mint: 'https://demo.redboxresearchdata.com.au/mint',
    },
    contextVariables: {
        '@referrer_rdmp': {
            source: 'request',
            type: 'header',
            field: 'referrer',
            parseUrl: true,
            searchParams: 'rdmp',
        },
    },
};
