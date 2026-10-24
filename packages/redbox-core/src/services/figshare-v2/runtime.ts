import { comparisonFigshareRuntime } from '../../compat/sails/figshareWorkers';
export {
  FigshareConfigTag,
  FigshareRunContextTag,
  isCurationLocked,
  listArticleFiles,
  ensureNoFileUploadInProgress,
} from '../../integrations/figshare/runtime';
export const makeRuntimeLayer = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareRuntime>['makeRuntimeLayer']>
) => comparisonFigshareRuntime().makeRuntimeLayer(...args);
export const runBuildMetadataPayload = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareRuntime>['runBuildMetadataPayload']>
) => comparisonFigshareRuntime().runBuildMetadataPayload(...args);
export const runSyncMetadataProgram = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareRuntime>['runSyncMetadataProgram']>
) => comparisonFigshareRuntime().runSyncMetadataProgram(...args);
