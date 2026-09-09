import { defineRedboxHook, type RecordContractComponentContributor } from '@researchdatabox/redbox-core';

const exampleValueContract: RecordContractComponentContributor = {
  kind: 'component',
  key: 'example.value',
  version: '1',
  componentType: 'ExampleValueComponent',
  ownedPointers: [''],
  nullability: 'non-null',
  compile: () => ({
    kind: 'node',
    node: { kind: 'scalar', scalarType: 'string', nullable: false },
  }),
};

module.exports = defineRedboxHook({
  registerRecordContractContributors: () => [exampleValueContract],
});
