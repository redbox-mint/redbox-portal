/**
 * Form State Module
 *
 * Provides NgRx-based global form state management with signals bridge.
 *
 * @module form-state
 */

export * from './providers';
export * from './state';
export * from './effects';
export * from './facade';
export * from './events';
// Form behaviours are exported from the same form-state barrel because the
// runtime is event-bus driven and intentionally sits alongside the existing
// field expression infrastructure rather than introducing a separate module.
export * from './behaviours';
