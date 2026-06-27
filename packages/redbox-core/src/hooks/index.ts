/**
 * Hooks barrel export
 *
 * Exports all Sails hooks from redbox-core
 */

export { defineWebpackHook } from './webpack';
export { defineRedboxHook } from './defineRedboxHook';
export type { DefineRedboxHookOptions, HookRegistrationMap } from './defineRedboxHook';
export {
  discoverRedboxHookResources,
  getHookAssetRoots,
  getHookViewRoots,
  resolveHookAssetFile,
  resolveHookViewFile,
} from './hookResources';
export type { RedboxHookResource, ResolveHookFileOptions, ResolvedHookFile } from './hookResources';
