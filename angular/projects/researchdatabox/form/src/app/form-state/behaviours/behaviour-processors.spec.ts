import { FormBehaviourProcessorType } from '@researchdatabox/sails-ng-common';
import { executeBehaviourProcessor } from './behaviour-processors';

describe('Behaviour processors', () => {
  it('re-fetches saved server metadata for repeated refreshes on the same oid', async () => {
    const recordService = jasmine.createSpyObj('RecordService', ['getRecordMeta']);
    const logger = jasmine.createSpyObj('LoggerService', ['debug', 'warn', 'error']);
    const executionContext = {
      behaviourIndex: 0,
      processorIndex: 0,
      recordService,
      logger,
      metadataCache: new Map(),
    } as any;

    recordService.getRecordMeta.and.resolveTo({
      dataLocations: [{ type: 'url', location: 'https://example.org/saved-location' }],
    });

    // First refresh sees the original saved server payload.
    const firstResult = await executeBehaviourProcessor(
      { type: FormBehaviourProcessorType.FetchMetadata },
      {
        value: 'oid-1',
        event: {},
        formData: {},
        requestParams: { dataRecordOid: 'oid-1' },
        runtimeContext: { requestParams: { dataRecordOid: 'oid-1' } },
      },
      executionContext
    );

    recordService.getRecordMeta.and.resolveTo({
      dataLocations: [
        { type: 'url', location: 'https://example.org/saved-location' },
        { type: 'url', location: 'https://example.org/newly-saved-location' },
      ],
    });

    // Second refresh must hit the server again so newly saved locations appear.
    const secondResult = await executeBehaviourProcessor(
      { type: FormBehaviourProcessorType.FetchMetadata },
      {
        value: 'oid-1',
        event: {},
        formData: {},
        requestParams: { dataRecordOid: 'oid-1' },
        runtimeContext: { requestParams: { dataRecordOid: 'oid-1' } },
      },
      executionContext
    );

    expect(recordService.getRecordMeta).toHaveBeenCalledTimes(2);
    expect(firstResult).toEqual(
      jasmine.objectContaining({
        oid: 'oid-1',
        dataLocations: [jasmine.objectContaining({ location: 'https://example.org/saved-location' })],
      })
    );
    expect(secondResult).toEqual(
      jasmine.objectContaining({
        oid: 'oid-1',
        dataLocations: [
          jasmine.objectContaining({ location: 'https://example.org/saved-location' }),
          jasmine.objectContaining({ location: 'https://example.org/newly-saved-location' }),
        ],
      })
    );
  });
});
