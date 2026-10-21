import assert from 'node:assert/strict';
import { Services as Oni } from '../../../src/services/OniService';
import { Services as Figshare } from '../../../src/services/FigshareService';
import type { RecordModel } from '../../../src/model/storage/RecordModel';

describe('Shared publication provider request compatibility (PUB-07)', () => {
  let previous: unknown;
  let mutations: number;
  const record: RecordModel = {
    redboxOid: 'record',
    id: 'storage-id',
    harvestId: '',
    dateCreated: '',
    lastSaveDate: '',
    metadata: { title: 'Source' },
    metaMetadata: {
      brandId: 'brand',
      type: 'dataPublication',
      createdBy: 'creator',
      form: 'form',
      searchCore: '',
      attachmentFields: [],
    },
    workflow: { stage: 'queued', stageLabel: 'Queued' },
    authorization: {
      edit: [],
      view: [],
      editRoles: [],
      viewRoles: [],
      editPending: [],
      viewPending: [],
      stored: { edit: [], view: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] },
    },
  };
  beforeEach(() => {
    previous = Reflect.get(globalThis, 'PublicationService');
    mutations = 0;
  });
  afterEach(() => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'PublicationService');
    else Reflect.set(globalThis, 'PublicationService', previous);
  });
  it('returns the Oni record shape after shared save registration without building, committing or ingesting a crate', async () => {
    const calls: unknown[][] = [];
    Reflect.set(globalThis, 'PublicationService', {
      acceptProviderRequest: async (...args: unknown[]) => {
        calls.push(args);
        return true;
      },
    });
    const service = new Oni.OniService();
    for (const name of ['runPublishDataset', 'createRepository', 'ingestDataset'])
      Reflect.set(service, name, () => {
        mutations++;
        throw new Error('Remote operation during save');
      });
    const result = await service.exportDataset(
      'record',
      record,
      { site: 'legacy-site', readiness: 'ready' },
      { username: 'approver' }
    );
    assert.equal(result, record);
    assert.equal(result.metadata.citation_url, undefined);
    assert.equal(mutations, 0);
    assert.deepEqual(calls[0].slice(0, 3), ['oni', 'OniService.exportDataset', 'record']);
  });
  it('routes Figshare validation and upload compatibility hooks through shared request acceptance without a client', async () => {
    const entries: unknown[] = [];
    Reflect.set(globalThis, 'PublicationService', {
      acceptProviderRequest: async (_provider: unknown, entry: unknown) => {
        entries.push(entry);
        return true;
      },
    });
    const service = new Figshare.FigshareService();
    Reflect.set(service, 'makeClient', () => {
      mutations++;
      throw new Error('Remote operation during save');
    });
    assert.equal(await service.validateFigshareRecord('record', record, {}, {}), record);
    assert.equal(await service.uploadFilesToFigshareArticle('record', record), record);
    assert.deepEqual(entries, [
      'FigshareService.validateFigshareRecord',
      'FigshareService.uploadFilesToFigshareArticle',
    ]);
    assert.equal(mutations, 0);
  });
  it('propagates local shared-approval rejection without a synchronous Oni fallback', async () => {
    Reflect.set(globalThis, 'PublicationService', {
      acceptProviderRequest: async () => {
        throw new Error('Publication approval validation failed');
      },
    });
    const service = new Oni.OniService();
    Reflect.set(service, 'runPublishDataset', () => {
      mutations++;
      throw new Error('Remote operation');
    });
    await assert.rejects(service.exportDataset('record', record, {}, {}), /approval validation failed/);
    assert.equal(mutations, 0);
  });
});
