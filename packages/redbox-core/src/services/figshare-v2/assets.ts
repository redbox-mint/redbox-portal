import { comparisonFigshareAssets } from '../../compat/sails/figshareHelpers';
export const getAttachmentStream = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['getAttachmentStream']>
) => comparisonFigshareAssets().getAttachmentStream(...args);
export const getAttachmentFingerprint = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['getAttachmentFingerprint']>
) => comparisonFigshareAssets().getAttachmentFingerprint(...args);
export const getStagingDisk = (...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['getStagingDisk']>) =>
  comparisonFigshareAssets().getStagingDisk(...args);
export const buildStagingKey = (...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['buildStagingKey']>) =>
  comparisonFigshareAssets().buildStagingKey(...args);
export const stageAttachmentToDisk = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['stageAttachmentToDisk']>
) => comparisonFigshareAssets().stageAttachmentToDisk(...args);
export const readPartsSequentially = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['readPartsSequentially']>
) => comparisonFigshareAssets().readPartsSequentially(...args);
export const syncAssetsPhase = (...args: Parameters<ReturnType<typeof comparisonFigshareAssets>['syncAssetsPhase']>) =>
  comparisonFigshareAssets().syncAssetsPhase(...args);
