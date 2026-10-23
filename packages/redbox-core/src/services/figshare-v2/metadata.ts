import { comparisonFigshareMetadata } from '../../compat/sails/figshareHelpers';
export const buildMetadataPayload = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareMetadata>['buildMetadataPayload']>
) => comparisonFigshareMetadata().buildMetadataPayload(...args);
export const syncMetadataPhase = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareMetadata>['syncMetadataPhase']>
) => comparisonFigshareMetadata().syncMetadataPhase(...args);
