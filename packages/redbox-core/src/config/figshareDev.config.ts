import { FigshareFixtureConfig } from '../configmodels/FigsharePublishing';

/**
 * Developer-only Figshare runtime overrides.
 * Available via configuration.figshareDev.
 */
export interface FigshareDevConfig {
  enabled: boolean;
  mode: 'live' | 'fixture';
  fixtures?: FigshareFixtureConfig;
}

export const figshareDev: FigshareDevConfig = {
  enabled: false,
  mode: 'live',
  fixtures: undefined,
};
