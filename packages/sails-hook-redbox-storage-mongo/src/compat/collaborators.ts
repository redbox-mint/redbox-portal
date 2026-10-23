import type { StorageCollaborators } from '../collaborators';

/** Legacy globals are resolved lazily, only for the comparison host. */
export function legacyStorageCollaborators(app: Sails.Application): StorageCollaborators {
  return {
    log: app.log,
    get recordTypes() {
      return RecordTypesService;
    },
    get forms() {
      return FormsService;
    },
    get disks() {
      return StorageManagerService;
    },
    translate: key => TranslationService.t(key),
    exportMaxRecords: () => Number(app.config.record?.export?.maxRecords),
  };
}
