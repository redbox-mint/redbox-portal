import _ from 'lodash';
import {
  FigsharePublishing,
  resolveFigshareConnectionToken,
  type FigsharePublishingConfigData,
} from '../configmodels/FigsharePublishing';
import type { FigshareDevConfig } from '../config/figshareDev.config';
import type { ResolvedFigsharePublishingConfigData } from '../queries/FigshareStatus';
export function resolveFigshareVocabularyConfigData(
  brandConfig: unknown,
  figshareDev: FigshareDevConfig,
  environment: string
): ResolvedFigsharePublishingConfigData | null {
  const brandConfigRecord =
    brandConfig != null && typeof brandConfig === 'object' ? (brandConfig as Record<string, unknown>) : undefined;
  const figsharePublishing = brandConfigRecord?.figsharePublishing;
  const figsharePublishingConfig =
    figsharePublishing != null && typeof figsharePublishing === 'object'
      ? (figsharePublishing as Partial<FigsharePublishingConfigData>)
      : undefined;
  if (figsharePublishingConfig == null) {
    return null;
  }

  const resolvedConfig = _.merge(
    new FigsharePublishing(),
    _.cloneDeep(figsharePublishingConfig)
  ) as unknown as ResolvedFigsharePublishingConfigData;
  const useFixtureRuntime =
    environment.toLowerCase() !== 'production' && figshareDev.enabled === true && figshareDev.mode === 'fixture';
  resolvedConfig.runtime = {
    mode: useFixtureRuntime ? 'fixture' : 'live',
    fixtures: useFixtureRuntime ? _.cloneDeep(figshareDev.fixtures) : undefined,
  };
  resolvedConfig.connection =
    resolvedConfig.connection != null && typeof resolvedConfig.connection === 'object'
      ? resolvedConfig.connection
      : { ...new FigsharePublishing().connection };
  const connectionToken = resolvedConfig.connection.token;
  resolvedConfig.connection.token =
    typeof connectionToken === 'string' && connectionToken.trim() !== ''
      ? resolveFigshareConnectionToken(connectionToken, { allowEmpty: true })
      : '';
  return resolvedConfig;
}
