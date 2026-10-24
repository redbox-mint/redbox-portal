import { comparisonFigshareManagedAssets } from '../../compat/sails/figshareWorkers';
export type { AssetCheckpoint } from '../../integrations/figshare/managed-assets';
export const mirrorManagedAssets = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareManagedAssets>['mirrorManagedAssets']>
) => comparisonFigshareManagedAssets().mirrorManagedAssets(...args);
export const cleanupProjection = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareManagedAssets>['cleanupProjection']>
) => comparisonFigshareManagedAssets().cleanupProjection(...args);
