/**
 * Hooks barrel export
 *
 * Exports all Sails hooks from redbox-core
 */

export { defineWebpackHook } from './webpack';
export { defineRedboxHook } from './defineRedboxHook';
export type { DefineRedboxHookOptions, HookRegistrationMap } from './defineRedboxHook';
export {
  compareHookPrecedence,
  discoverRedboxHookPackages,
  getHookPrecedenceOrder,
  getHookProcessingOrder,
  readHookLoadPriority,
} from './hookDiscovery';
export type { RedboxHookDiscoveryOptions, RedboxHookOrderConfig, RedboxHookPackageMetadata } from './hookDiscovery';
export {
  discoverRedboxHookResources,
  getHookAssetRoots,
  getHookViewRoots,
  resolveHookAssetFile,
  resolveHookViewFile,
} from './hookResources';
export type { RedboxHookResource, ResolveHookFileOptions, ResolvedHookFile } from './hookResources';
