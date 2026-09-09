import { parseWorkflowStageKey } from '@researchdatabox/sails-ng-common';
import { coreRecordActionRegistry } from '../../src/services/record-actions/coordinator';
import type { RecordDefinitionSeedManifest } from '../../src/services/RecordDefinitionSeedService';
import type { RecordDefinitionPublicationAuthority } from '../../src/services/RecordDefinitionPublicationService';
export function seedManifest(brandId = 'brand-a'): RecordDefinitionSeedManifest {
  return {
    schemaVersion: 1,
    seeds: [
      {
        brandId,
        recordTypeKey: 'dataset',
        seedVersion: 1,
        packageType: 'dataset',
        searchCore: 'records',
        definition: {
          schemaVersion: 1,
          definitionState: 'publishable',
          recordType: {
            labels: { name: 'Dataset', namePlural: 'Datasets' },
            searchable: true,
            searchFilters: [],
            relationships: [],
            transferResponsibility: { fields: [], roleRules: [] },
            validation: { mode: 'shadow', operations: [] },
            concurrency: { mode: 'last-write-wins' },
          },
          stages: [
            {
              schemaVersion: 1,
              key: parseWorkflowStageKey('draft'),
              label: 'Draft',
              formReference: 'dataset-form',
              viewRoles: ['Admin'],
              editRoles: ['Admin'],
              displayOrder: 0,
              starting: true,
              terminal: true,
              validationOverrides: [],
            },
          ],
          transitions: [],
          actionBindings: [],
        },
      },
    ],
  };
}

export const seedAuthority: RecordDefinitionPublicationAuthority = {
  async load() {
    return {
      actionRegistry: coreRecordActionRegistry(),
      roles: ['Admin'],
      forms: [{ reference: 'dataset-form', validationOperations: {}, validationGroups: {} }],
      availableRecordTypeKeys: [],
      storageCapabilityProvider: null,
      stageReferences: [],
    };
  },
};
