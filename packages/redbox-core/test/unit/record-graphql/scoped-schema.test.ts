import type { SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import assert from 'node:assert/strict';
import { Services } from '../../../src/services/RecordGraphqlService';
import { createCoreRecordContractContributors, RecordContractContributorRegistry } from '../../../src/record-contract';
import { recordGraphql } from '../../../src/config/recordGraphql.config';
import { gridCaller } from '../../fixtures/record-grid.fixtures';

describe('Scoped explorer editor schema', () => {
  it('isolates a valid selected type from an unrelated broken form without reading records', async () => {
    let reads = 0;
    const title: SimpleInputFormComponentDefinitionFrame = {
      name: 'title',
      component: { class: 'SimpleInputComponent', config: { type: 'text' } },
    };
    const service = new Services.RecordGraphql({
      getConfig: () => ({ ...recordGraphql, enabled: true }),
      getContributorRegistry: () =>
        new RecordContractContributorRegistry(
          createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
        ),
      getCandidates: async () => [
        {
          recordType: 'publication',
          workflowStep: 'draft',
          form: 'publication-draft',
          configuration: { name: 'publication-draft', type: 'publication', componentDefinitions: [title] },
        },
        {
          recordType: 'unrelated',
          workflowStep: 'draft',
          form: 'broken',
          configuration: {
            name: 'broken',
            type: 'unrelated',
            componentDefinitions: [
              {
                name: 'missing',
                overrides: { reusableFormName: 'unavailable' },
                component: { class: 'ReusableComponent', config: {} },
              },
            ],
          },
        },
      ],
      getReusableDefinitions: () => ({}),
      getContributorRegistrationIssues: () => [],
      getRecord: async () => {
        reads++;
        return undefined;
      },
    });
    const sdl = await service.describeReadSchema(gridCaller, { recordType: 'publication' });
    assert.ok(sdl.includes('M_publication_draft'));
    assert.ok(!sdl.includes('M_unrelated'));
    assert.equal(reads, 0);
    await assert.rejects(service.describeReadSchema(gridCaller));
    await assert.rejects(service.describeReadSchema(gridCaller, { recordType: 'unknown' }));
    await assert.rejects(
      service.describeReadSchema(gridCaller, { recordType: 'publication', workflowStages: ['unknown'] })
    );
  });
});
