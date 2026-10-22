import assert from 'node:assert/strict';
import sinon from 'sinon';
import NodeCache from 'node-cache';
import { firstValueFrom, Observable } from 'rxjs';
import { stubCacheEntryRepository } from '../helpers/cacheRepository';
import { Services } from '../../src/services/CacheService';
import { createMockSails, setupServiceTestGlobals } from './testHelper';
import { MongoNetworkError } from 'mongodb';

class CharacterizedCache extends Services.Cache {
  constructor() {
    super();
    this.cache = new NodeCache({ stdTTL: 60, checkperiod: 0 });
  }
  memory(): NodeCache {
    return this.cache;
  }
}

const settled = () => new Promise<void>(resolve => setImmediate(resolve));

describe('CacheService persistence characterization (P0)', function () {
  let cache: CharacterizedCache;
  let find: sinon.SinonStub;
  let create: sinon.SinonStub;
  let update: sinon.SinonStub;
  let errors: sinon.SinonStub;
  let savedGlobals: PropertyDescriptorMap;
  const now = 1_792_339_200;

  beforeEach(function () {
    savedGlobals = Object.getOwnPropertyDescriptors(globalThis);
    sinon.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
    const mockSails = createMockSails({ config: { custom_cache: { cacheExpiry: 60 } } });
    errors = mockSails.log.error;
    setupServiceTestGlobals(mockSails);
    const repo = stubCacheEntryRepository();
    find = repo.findByName;
    create = repo.create;
    update = repo.updateByName;
    cache = new CharacterizedCache();
  });

  afterEach(async function () {
    // Let CoreBase's constructor finish its asynchronous logger setup before restoring globals.
    await Promise.resolve();
    cache.memory().close();
    sinon.restore();
    for (const key of ['sails', '_']) {
      if (savedGlobals[key]) Object.defineProperty(globalThis, key, savedGlobals[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  it('returns an Observable, bypasses persistence for truthy memory, and returns null for a miss', async function () {
    cache.memory().set('hit', { value: 'memory' });
    const result = cache.get('hit');
    assert(result instanceof Observable);
    assert.deepEqual(await firstValueFrom(result), { value: 'memory' });
    assert.equal(find.callCount, 0);
    assert.equal(await firstValueFrom(cache.get('absent')), null);
    assert.equal(find.callCount, 1);
  });

  for (const value of [false, 0, '', null]) {
    it(`looks up persistence for falsy memory ${JSON.stringify(value)} and preserves its public value`, async function () {
      cache.memory().set('falsy', value);
      find.resolves({ id: 'synthetic', name: 'synthetic', data: value, ts_added: now });
      assert.equal(await firstValueFrom(cache.get('falsy')), value);
      assert.equal(find.callCount, 1);
      assert.equal(await firstValueFrom(cache.get('falsy')), value);
      assert.equal(find.callCount, 2);
    });
  }

  it('normalizes missing data to null without writing to persistence', async function () {
    find.resolves({ id: 'missing', name: 'missing', ts_added: now });
    assert.equal(await firstValueFrom(cache.get('missing')), null);
    assert.equal(create.callCount + update.callCount, 0);
  });

  it('accepts age equal to global expiry, resets memory to the full default TTL, and retains expired documents', async function () {
    find.resolves({ id: 'synthetic', name: 'synthetic', data: 'at-boundary', ts_added: now - 60 });
    assert.equal(await firstValueFrom(cache.get('boundary')), 'at-boundary');
    assert.equal(cache.memory().getTtl('boundary'), (now + 60) * 1000);
    find.resolves({ id: 'synthetic', name: 'synthetic', data: 'expired', ts_added: now - 61 });
    assert.equal(await firstValueFrom(cache.get('expired')), null);
    assert.equal(create.callCount + update.callCount, 0);
    assert.equal(cache.memory().has('expired'), false);
  });

  it('writes memory before persistence completes, returns void, and passes only epoch seconds to the create', async function () {
    let finishFind!: (row: null) => void;
    let finishCreate!: () => void;
    find.returns(
      new Promise<null>(resolve => {
        finishFind = resolve;
      })
    );
    create.returns(
      new Promise<void>(resolve => {
        finishCreate = resolve;
      })
    );
    assert.equal(cache.set('async', { value: 'first' }, 5), undefined);
    assert.deepEqual(await firstValueFrom(cache.get('async')), { value: 'first' });
    assert.equal(create.callCount, 0);
    assert.equal(cache.memory().getTtl('async'), (now + 5) * 1000);
    assert(finishFind);
    finishFind(null);
    await settled();
    assert.deepEqual(create.firstCall.args, [{ name: 'async', data: { value: 'first' }, ts_added: now }]);
    assert(finishCreate);
    finishCreate();
    await settled();
  });

  it('updates by name and logs rejected persistence without losing the memory write', async function () {
    const failure = new Error('synthetic persistence failure');
    find.resolves({ id: 'existing', name: 'existing', ts_added: now });
    update.rejects(failure);
    cache.set('existing', 'memory');
    await settled();
    assert.deepEqual(update.firstCall.args, ['existing', { name: 'existing', data: 'memory', ts_added: now }]);
    assert(errors.calledWith('Error updating cache for entry existing:'));
    assert(errors.calledWithMatch({ name: 'Error', message: 'Cache persistence operation failed.' }));
    assert.equal(await firstValueFrom(cache.get('existing')), 'memory');
  });

  it('logs find/create errors, while read errors reach the Observable subscriber', async function () {
    const failure = new Error('synthetic read failure');
    find.rejects(failure);
    cache.set('find-error', 'memory');
    await settled();
    assert(errors.calledWithMatch({ name: 'Error', message: 'Cache persistence operation failed.' }));
    assert.equal(create.callCount, 0);
    await assert.rejects(firstValueFrom(cache.get('read-error')), /synthetic read failure/);
    errors.resetHistory();
    find.resolves(null);
    create.rejects(failure);
    cache.set('create-error', 'memory');
    await settled();
    assert(errors.calledWithMatch({ name: 'Error', message: 'Cache persistence operation failed.' }));
  });

  it('retains the notification null reset in memory with TTL zero and queries persistence on its next read', async function () {
    cache.set('notification', null, 0);
    assert.equal(cache.memory().getTtl('notification'), 0);
    assert.equal(cache.memory().get('notification'), null);
    await settled();
    assert.deepEqual(create.firstCall.args, [{ name: 'notification', data: null, ts_added: now }]);
    find.resolves({ id: 'synthetic', name: 'synthetic', data: null, ts_added: now });
    assert.equal(await firstValueFrom(cache.get('notification')), null);
    assert.equal(find.callCount, 2);
    assert.equal(cache.memory().getTtl('notification'), (now + 60) * 1000);
  });
  it('captures memory at get call time and starts each persistence read only on subscription', async function () {
    const result = cache.get('timing');
    cache.memory().set('timing', 'later');
    assert.equal(find.callCount, 0);
    find.resolves({ id: 'timing', name: 'timing', data: 'persisted', ts_added: now });
    assert.equal(await firstValueFrom(result), 'persisted');
    assert.equal(await firstValueFrom(result), 'persisted');
    assert.equal(find.callCount, 2);
  });

  it('logs invalid persistence data after writing memory and never calls a repository write', async function () {
    const rich = { date: new Date() };
    assert.equal(cache.set('rich', rich), undefined);
    assert.deepEqual(cache.memory().get('rich'), rich);
    await settled();
    assert.equal(create.callCount + update.callCount, 0);
    assert.equal(errors.callCount, 2);
    assert.equal(errors.secondCall.args[0].name, 'InvalidCacheEntryError');
  });

  it('retains competing find/create races without retry or upsert', async function () {
    const duplicate = Object.assign(new Error('duplicate synthetic name'), { code: 'E_UNIQUE' });
    create.onSecondCall().rejects(duplicate);
    cache.set('race', 'first');
    cache.set('race', 'second');
    assert.equal(cache.memory().get('race'), 'second');
    await settled();
    assert.equal(find.callCount, 2);
    assert.equal(create.callCount, 2);
    assert.equal(update.callCount, 0);
    assert(errors.calledWithMatch({ name: 'Error', code: 'E_UNIQUE' }));
  });

  it('omits payload-bearing native and hook messages while retaining safe failure codes and original read errors', async function () {
    for (const code of [121, 'E_UNIQUE', 'synthetic-private-cache-payload', undefined]) {
      const failure = Object.assign(new Error('synthetic-private-cache-payload'), {
        code,
        name: 'synthetic-private-cache-payload',
        cause: { data: 'synthetic-private-cache-payload' },
      });
      errors.resetHistory();
      find.rejects(failure);
      cache.set('failed-write', 'memory');
      await settled();
      assert.equal(errors.callCount, 2);
      assert.doesNotMatch(JSON.stringify(errors.args), /synthetic-private-cache-payload/);
      assert.equal(errors.secondCall.args[0].code, code === 121 || code === 'E_UNIQUE' ? code : undefined);
      assert.equal(await firstValueFrom(cache.get('failed-write')), 'memory');
      await assert.rejects(firstValueFrom(cache.get('failed-read')), error => error === failure);
    }
  });

  it('preserves network diagnostics without logging native messages or malformed labels', async function () {
    const cause = Object.assign(new Error('synthetic-private-cache-payload'), { code: 'ECONNREFUSED' });
    const failure = new MongoNetworkError('synthetic-private-cache-payload', { cause });
    failure.addErrorLabel('ResetPool');
    failure.addErrorLabel('synthetic-private-cache-payload');
    find.rejects(failure);
    cache.set('network-error', 'memory');
    await settled();
    assert.deepEqual(errors.secondCall.args, [
      {
        name: 'MongoNetworkError',
        message: 'Cache persistence operation failed.',
        code: 'ECONNREFUSED',
        errorLabels: ['ResetPool'],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(errors.args), /synthetic-private-cache-payload/);
    assert.equal(await firstValueFrom(cache.get('network-error')), 'memory');
    await assert.rejects(firstValueFrom(cache.get('failed-read')), error => error === failure);
  });

  it('preserves hook diagnostic identifiers without a driver-specific catalog', async function () {
    class InstitutionCacheError {
      message = 'synthetic-private-cache-payload';
      code = 'E_CACHE_TEMPORARY';
      errorLabels = ['RetryAfterReconnect', 'mongodb://user:secret@host/db', { data: 'private' }];
      cause = { data: 'synthetic-private-cache-payload' };
    }
    for (const failure of [
      new InstitutionCacheError(),
      Object.assign(new Error('synthetic-private-cache-payload'), new InstitutionCacheError(), {
        name: 'InstitutionCacheError',
      }),
    ]) {
      errors.resetHistory();
      find.rejects(failure);
      cache.set('hook-error', 'memory');
      await settled();
      assert.deepEqual(errors.secondCall.args, [
        {
          name: 'InstitutionCacheError',
          message: 'Cache persistence operation failed.',
          code: 'E_CACHE_TEMPORARY',
          errorLabels: ['RetryAfterReconnect'],
        },
      ]);
      assert.doesNotMatch(JSON.stringify(errors.args), /synthetic-private-cache-payload|secret|private/);
    }
  });

  it('terminates cyclic cause chains without exposing their messages', async function () {
    const failure = new Error('synthetic-private-cache-payload');
    failure.cause = failure;
    find.rejects(failure);
    cache.set('cyclic-error', 'memory');
    await settled();
    assert.deepEqual(errors.secondCall.args, [{ name: 'Error', message: 'Cache persistence operation failed.' }]);
    assert.doesNotMatch(JSON.stringify(errors.args), /synthetic-private-cache-payload/);
  });
});
