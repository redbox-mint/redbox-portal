import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import {
  PublicationProviderRegistry,
  PublicationSyncStore,
  type PublicationObject,
  type PublicationProvider,
  type PublicationProviderSourceInputs,
  type PublicationSourcePreparation,
} from '@researchdatabox/redbox-core';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins';
import { AdversarialPublicationAdapter } from '../fixtures/adversarialPublication';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('adversarial acceptance requires real Mongo');
const suite = process.env.MONGO_TEST_URL ? describe : describe.skip;

suite('adversarial local adapter boundaries (real Mongo)', function () {
  this.timeout(20000);
  const database = `publication_adversarial_${randomUUID().replaceAll('-', '')}`;
  const key = { brandId: 'brand', oid: 'record', destinationId: 'archive' };
  let client: MongoClient;
  let store: PublicationSyncStore;
  let adapter: PublicationProvider<PublicationObject, PublicationObject, PublicationObject>;
  let input: PublicationSourcePreparation<PublicationObject>;
  const object = (value: unknown) =>
    isPublicationObject(value)
      ? { valid: true as const, value }
      : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
  const dependencies = (): PublicationProviderSourceInputs => ({
    mappingContextVersion: 1,
    managedFields: [],
    relatedInputs: {},
    attachments: [],
    resolveCrosswalk: async () => {
      throw new Error('No crosswalk');
    },
  });
  function registered() {
    const registry = new PublicationProviderRegistry();
    registry.register(adapter);
    registry.freeze();
    return registry.get('adversarial')!;
  }
  before(async () => {
    client = await new MongoClient(process.env.MONGO_TEST_URL!).connect();
    store = new PublicationSyncStore(client.db(database));
    await store.ensureIndexes();
    await store.initialise(key, 'adversarial', 'fixed');
  });
  after(async () => {
    await client.db(database).dropDatabase();
    await client.close();
  });
  beforeEach(() => {
    input = {
      ...key,
      configuration: { mapping: {} },
      record: { title: 'approved' },
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
      generatedValues: { timestamp: 'approved' },
    };
    adapter = {
      id: 'adversarial',
      contractVersion: 2,
      stateVersion: 2,
      configurationSchema: {},
      secretPaths: [],
      mutationRecovery: { mode: 'idempotency-key' },
      capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
      validateConfiguration: object,
      targetFingerprint: () => 'fixed',
      decodeState: object,
      upgradeState: object,
      decodePreparedSource: object,
      prepareSource: async () => ({ valid: true, value: {} }),
      describeSource: async () => dependencies(),
      synchronise: async context => ({ kind: 'waiting', state: context.state, reason: 'manual' }),
      observe: async context => ({ kind: 'waiting', state: context.state, reason: 'manual' }),
      reconcile: async context => ({ kind: 'waiting', state: context.state, reason: 'manual' }),
      repairs: [],
    };
  });
  for (const callback of [
    'validateConfiguration',
    'targetFingerprint',
    'sourceMaintenancePaths',
    'administrativeResources',
    'replacement-path',
  ] as const)
    it(`isolates configuration supplied to ${callback}`, async () => {
      const before = await store.get(key);
      const configuration = { mapping: { approved: true } };
      const original = structuredClone(configuration);
      const mutate = (value: PublicationObject) => {
        value.mapping = { escaped: true };
      };
      if (callback === 'validateConfiguration')
        adapter.validateConfiguration = value => {
          const result = object(value);
          if (result.valid) mutate(result.value);
          return result;
        };
      if (callback === 'targetFingerprint')
        adapter.targetFingerprint = value => {
          mutate(value);
          return 'fixed';
        };
      if (callback === 'sourceMaintenancePaths')
        adapter.sourceMaintenancePaths = value => {
          mutate(value);
          return [];
        };
      if (callback === 'administrativeResources')
        adapter.administrativeResources = value => {
          mutate(value);
          return [];
        };
      if (callback === 'replacement-path')
        adapter.postCompletionReplacement = {
          capability: 'attachment-to-url',
          receiptField: 'adversarialReceipt',
          path: value => {
            mutate(value);
            return 'metadata.files';
          },
          entries: () => [],
        };
      const provider = registered();
      if (callback === 'replacement-path') provider.postCompletionReplacement!.path(configuration);
      else if (callback === 'validateConfiguration') provider.validateConfiguration(configuration);
      else if (callback === 'targetFingerprint') provider.targetFingerprint(configuration);
      else if (callback === 'sourceMaintenancePaths') provider.sourceMaintenancePaths!(configuration);
      else provider.administrativeResources!(configuration);
      assert.deepEqual(configuration, original);
      assert.deepEqual(await store.get(key), before);
    });

  it('isolates preparation results and describeSource inputs/results from retained adapter objects', async () => {
    const before = await store.get(key);
    const original = structuredClone(input);
    const adversary = new AdversarialPublicationAdapter(adapter);
    const prepared = { title: 'approved' };
    const declared = dependencies();
    adversary.prepare = async value => {
      value.generatedValues.timestamp = 'foreign';
      value.approver.username = 'foreign';
      return { valid: true, value: prepared };
    };
    adversary.describe = async (value, source) => {
      value.configuration.mapping = { escaped: true };
      source.title = 'foreign';
      return declared;
    };
    const registry = new PublicationProviderRegistry();
    registry.register(adversary.provider);
    const provider = registry.get(adapter.id)!;
    const result = await provider.prepareSource!(input);
    assert.equal(result.valid, true);
    if (!result.valid) assert.fail('Prepared source expected');
    const description = await provider.describeSource!(input, result.value);
    prepared.title = 'late-foreign';
    declared.managedFields.push('foreign');
    assert.deepEqual(input, original);
    assert.deepEqual(result.value, { title: 'approved' });
    assert.deepEqual(description.managedFields, []);
    assert.deepEqual(await store.get(key), before);
  });

  for (const version of [1, 2])
    it(`isolates ${version === 1 ? 'migration upgradeState' : 'decodeState'} inputs and retained results`, async () => {
      const before = await store.get(key);
      const state = { evidence: { retained: true } };
      const original = structuredClone(state);
      const retained: PublicationObject = { decoded: true };
      const decode = (value: unknown) => {
        if (isPublicationObject(value)) value.escaped = true;
        return { valid: true as const, value: retained };
      };
      adapter.decodeState = decode;
      adapter.upgradeState = decode;
      const result = registered().decodeState!(state, version);
      retained.escaped = true;
      assert.deepEqual(state, original);
      assert.deepEqual(result.state, { decoded: true });
      assert.deepEqual(await store.get(key), before);
    });

  for (const valid of [false, true])
    it(`copies only successful new allocations in the provider destination namespace (${valid})`, async () => {
      const before = await store.get(key);
      input.generatedValues['adversarial:archive:existing'] = { retained: true };
      const retained = { allocated: true };
      adapter.prepareSource = async value => {
        value.generatedValues.timestamp = 'foreign';
        value.generatedValues['adversarial:other:foreign'] = { escaped: true };
        value.generatedValues['adversarial:archive:existing'] = { escaped: true };
        value.generatedValues['adversarial:archive:new'] = retained;
        return valid
          ? { valid: true, value: {} }
          : { valid: false, issues: [{ path: '', code: 'refused', message: 'Refused preparation' }] };
      };
      const result = await registered().prepareSource!(input);
      retained.allocated = false;
      assert.equal(result.valid, valid);
      assert.deepEqual(input.generatedValues, {
        timestamp: 'approved',
        'adversarial:archive:existing': { retained: true },
        ...(valid ? { 'adversarial:archive:new': { allocated: true } } : {}),
      });
      assert.deepEqual(await store.get(key), before);
    });

  it('isolates content-replacement state and retained entries', async () => {
    const before = await store.get(key);
    const state = { receipt: 'owned' };
    const original = structuredClone(state);
    const entries = [{ type: 'url', location: 'https://example.test/approved' }];
    adapter.postCompletionReplacement = {
      capability: 'attachment-to-url',
      receiptField: 'adversarialReceipt',
      path: () => 'metadata.files',
      entries: value => {
        value.escaped = true;
        return entries;
      },
    };
    const result = registered().postCompletionReplacement!.entries(state, 2, 'approval', 1);
    entries[0].location = 'https://example.test/foreign';
    assert.deepEqual(state, original);
    assert.deepEqual(result, [{ type: 'url', location: 'https://example.test/approved' }]);
    assert.deepEqual(await store.get(key), before);
  });

  it('isolates status input and retained status output', async () => {
    const before = await store.get(key);
    const state: PublicationObject = { receipt: 'owned' };
    const observation = {
      deposit: 'confirmed' as const,
      publication: 'published' as const,
      ingestion: 'not_required' as const,
      visibility: 'unverified' as const,
      accessible: true,
    };
    adapter.summariseStatus = value => {
      value.escaped = true;
      return observation;
    };
    const result = registered().summariseStatus!(state, 2);
    observation.accessible = false;
    assert.deepEqual(state, { receipt: 'owned' });
    assert.equal(result.accessible, true);
    assert.deepEqual(await store.get(key), before);
  });
});
