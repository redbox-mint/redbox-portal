import type { RecordDefinitionSeedManifest } from '../services/RecordDefinitionSeedService';

/** Explicit brand IDs; deployment hooks supply versioned aggregates, never legacy function configuration. */
export const recordDefinitionSeeds: RecordDefinitionSeedManifest = { schemaVersion: 1, seeds: [] };
