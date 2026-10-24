import { of } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import type { StorageCollaborators } from '../../src/collaborators';

export function storageFixture(exportMaxRecords = 10): StorageCollaborators {
  return {
    log: nothingLogger,
    recordTypes: {
      get: () => {
        throw new Error('No record type in fixture');
      },
    },
    forms: { getFormByName: () => of(null) },
    disks: {
      stagingDisk: () => {
        throw new Error('No staging disk in fixture');
      },
      disk: () => {
        throw new Error('No disk in fixture');
      },
    },
    translate: key => key,
    exportMaxRecords: () => exportMaxRecords,
  };
}
