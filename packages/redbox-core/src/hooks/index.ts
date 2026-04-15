/**
 * Hooks barrel export
 *
 * Exports all Sails hooks from redbox-core
 */

export { defineWebpackHook } from './webpack';
export { defineRedboxHook } from './defineRedboxHook';
export type { DefineRedboxHookOptions, HookRegistrationMap } from './defineRedboxHook';
