import assert from 'node:assert/strict';
import { RecordTypeModel } from '../../src/model/storage/RecordTypeModel';
import { firstValueFrom } from 'rxjs';
import { RecordTypes, type RecordTypesDependencies } from '../../src/recordTypes';

describe('explicit RecordTypes composition', () => {
  it('does no constructor work, joins initialization and caches the created definitions', async () => {
    let reads = 0,
      writes = 0;
    const dependencies: RecordTypesDependencies = {
      repository: {
        listForBrand: async () => {
          reads++;
          return [];
        },
        createDefinition: async values => {
          writes++;
          return { id: 'id', name: String(values.name), branding: String(values.branding) };
        },
        findByName: async () => null,
        removeForBrand: async () => {},
      },
      config: { appmode: {}, recordtype: { dataset: new RecordTypeModel() } },
      log: { debug() {}, verbose() {} },
      storageCapability: () => undefined,
    };
    const module = new RecordTypes(dependencies);
    assert.equal(reads, 0);
    assert.equal(module.getAllCache(), undefined);
    const first = module.initialize({ id: 'brand' });
    assert.equal(module.initialize({ id: 'brand' }), first);
    await first;
    assert.equal(reads, 1);
    assert.equal(writes, 1);
    assert.equal(module.getAllCache()?.length, 1);
    await module.close();
    assert.equal(module.getAllCache(), undefined);
  });

  it('defers repository reads and shares their result across subscriptions to one call', async () => {
    let reads = 0;
    const module = new RecordTypes({
      repository: {
        listForBrand: async () => {
          reads++;
          return [];
        },
        findByName: async () => null,
        createDefinition: async () => {
          throw new Error('unused');
        },
        removeForBrand: async () => {},
      },
      config: { appmode: {}, recordtype: {} },
      log: { debug() {}, verbose() {} },
      storageCapability: () => undefined,
    });
    const result = module.getAll({ id: 'brand' });
    assert.equal(reads, 0);
    assert.deepEqual(await firstValueFrom(result), []);
    assert.deepEqual(await firstValueFrom(result), []);
    assert.equal(reads, 1);
  });
});
