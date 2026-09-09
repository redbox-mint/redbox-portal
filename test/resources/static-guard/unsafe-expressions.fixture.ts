import { template as looksHarmless } from 'lodash-es';

declare const configuredSource: string;

const runConfiguredSource = eval;
runConfiguredSource(configuredSource);
looksHarmless(configuredSource)({});
