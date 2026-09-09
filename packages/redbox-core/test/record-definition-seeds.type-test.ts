import { RecordDefinitionSeedService, ServiceExports, Config } from '../dist';
const manifest: RecordDefinitionSeedService.RecordDefinitionSeedManifest = { schemaVersion: 1, seeds: [] };
const service: RecordDefinitionSeedService.RecordDefinitionSeedServiceExports =
  ServiceExports.RecordDefinitionSeedService;
export const result: Promise<RecordDefinitionSeedService.RecordDefinitionSeedReport> = service.seed(manifest);
export const defaultManifest: RecordDefinitionSeedService.RecordDefinitionSeedManifest = Config.recordDefinitionSeeds;
// @ts-expect-error Seed manifests must carry a supported version.
export const unversioned: RecordDefinitionSeedService.RecordDefinitionSeedManifest = { seeds: [] };
// @ts-expect-error Runtime bootstrap cannot be told to overwrite deployed state.
service.seed({ schemaVersion: 1, seeds: [], overwrite: true });
