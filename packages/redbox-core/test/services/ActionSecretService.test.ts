import { strict as assert } from 'node:assert';
import { createCipheriv, randomBytes } from 'node:crypto';
import sinon from 'sinon';
import { inspect } from 'node:util';
import {
  ActionSecretProviderError,
  createActionSecretSlotIdentity,
  resolveActionPlan,
} from '../../src/action-registry';
import { createActionExecutionOperation } from '../../src/action-execution';
import { createRegisteredActionExecutor } from '../../src/action-execution/registered-executor';
import { createActionSecretExecutionBoundary } from '../../src/action-registry/secrets';
import { persistedRecordActionSecretProvider } from '../../src/services/action-secrets/storage';
import { Services as Runtime } from '../../src/services/RecordDefinitionRuntimeService';
import { Services } from '../../src/services/ActionSecretService';
import { secretFixture } from '../helpers/action-secret-fixture';

describe('B08 protected action secret persistence', () => {
  let restore: () => void;
  let fixture: ReturnType<typeof secretFixture>;
  let rows: Map<string, any>;
  let provider: ReturnType<typeof persistedRecordActionSecretProvider>;
  let slot: ReturnType<typeof createActionSecretSlotIdentity>;
  let active: any;
  let draft: any;
  let collection: any;
  let resolve: () => Promise<any>;
  let handler: sinon.SinonSpy;
  const sentinel = 'b08-sensitive-fixture-value';
  beforeEach(() => {
    handler = sinon.spy(() => ({ schemaVersion: 1 as const, kind: 'no-change' as const }));
    fixture = secretFixture('secret-test', handler);
    rows = new Map();
    slot = createActionSecretSlotIdentity({
      brandId: 'brand-alpha',
      recordTypeKey: 'secret-test',
      bindingId: fixture.binding.id,
      parameterName: 'credential',
    });
    const oldKey = process.env.REDBOX_ACTION_SECRET_KEY;
    const oldModel = (global as any).ActionSecret;
    const oldDraft = (global as any).RecordDefinitionDraft;
    const oldSails = (global as any).sails;
    process.env.REDBOX_ACTION_SECRET_KEY = randomBytes(32).toString('hex');
    (global as any).sails = {
      config: { actionRegistry: fixture.registry },
      log: { info() {}, debug() {}, verbose() {}, error() {}, warn() {} },
    };
    draft = {
      branding: slot.brandId,
      recordTypeKey: slot.recordTypeKey,
      recordType: 'physical-record-type',
      definition: { actionBindings: [fixture.binding] },
    };
    active = { identity: { retiredAt: null }, revision: { definition: { actionBindings: [fixture.binding] } } };
    sinon.stub(Runtime.RecordDefinitionRuntime.prototype, 'resolve').callsFake(async () => active);
    collection = {
      findOne: async (filter: any, options?: any) => {
        const row = rows.get(filter._id);
        return !row || (filter.protectedValue && row.protectedValue === null)
          ? null
          : options
            ? { _id: filter._id }
            : row;
      },
      updateOne: async (filter: any, update: any) => {
        rows.set(filter._id, { ...filter, ...update.$setOnInsert, ...update.$set });
        return { acknowledged: true, matchedCount: 1 };
      },
      deleteOne: async (filter: any) => {
        rows.delete(filter._id);
        return { acknowledged: true, matchedCount: 1 };
      },
    };
    let identityToken: string | null = null;
    const identityCollection = {
      updateOne: async (filter: any, update: any) => {
        if (filter.secretMutationToken !== identityToken) return { acknowledged: true, matchedCount: 0 };
        identityToken = update.$set.secretMutationToken;
        return { acknowledged: true, matchedCount: 1 };
      },
    };
    (global as any).ActionSecret = {
      getDatastore: () => ({
        manager: { collection: (name: string) => (name === 'actionsecret' ? collection : identityCollection) },
      }),
    };
    (global as any).RecordDefinitionDraft = { findOne: () => ({ exec: (cb: any) => cb(null, draft) }) };
    provider = persistedRecordActionSecretProvider(fixture.registry);
    const boundary = createActionSecretExecutionBoundary(provider, fixture.registry);
    const binding = boundary.resolvePlan({
      schemaVersion: 1,
      recordTypeKey: slot.recordTypeKey,
      bindings: [fixture.binding],
    }).bindings[0]!;
    resolve = () => provider.resolveForHandler({ requesterBrandId: slot.brandId, slot, resolvedBinding: binding });
    restore = () => {
      if (oldKey === undefined) delete process.env.REDBOX_ACTION_SECRET_KEY;
      else process.env.REDBOX_ACTION_SECRET_KEY = oldKey;
      (global as any).ActionSecret = oldModel;
      (global as any).RecordDefinitionDraft = oldDraft;
      (global as any).sails = oldSails;
      sinon.restore();
    };
  });
  afterEach(() => restore());
  const access = () => ({ requesterBrandId: slot.brandId, slot });
  it('service exposes configured state, retains blanks, replaces and explicitly clears separately', async () => {
    const service = new Services.ActionSecrets();
    assert.equal(await service.isConfigured(access()), false);
    assert.equal(await service.write({ ...access(), value: sentinel }), 'replaced');
    assert.equal(await service.isConfigured(access()), true);
    assert.equal(await service.write(access()), 'retained');
    assert.equal(await service.write({ ...access(), value: ' \n ' }), 'retained');
    assert.equal((await resolve()).reveal(), sentinel);
    active.identity.retiredAt = '2026-09-05T00:00:00.000Z';
    assert.equal((await resolve()).reveal(), sentinel); // Retirement only stops new record creation.
    active.identity.retiredAt = null;
    assert.equal(JSON.stringify([...rows.values()]).includes(sentinel), false);
    assert.equal(rows.get(slot.id).recordType, 'physical-record-type');
    assert.equal(inspect(await resolve()).includes(sentinel), false);
    assert.equal(JSON.stringify(await resolve()), '"[REDACTED]"');
    await service.replace({ ...access(), value: 'replacement' });
    assert.equal((await resolve()).reveal(), 'replacement');
    await service.clear(access());
    assert.equal(await service.isConfigured(access()), false);
    await assert.rejects(resolve(), { code: 'required-secret-not-configured' });
    assert.equal(JSON.stringify(draft).includes(sentinel), false);
  });
  for (const value of ['\ud800', '\udc00', null, {}, 12, [], 'x'.repeat(65537), 'é'.repeat(32769), ' '.repeat(65537)]) {
    it(`rejects malformed/oversized value ${typeof value}/${String(value).length}`, async () => {
      await assert.rejects(provider.write({ ...access(), value } as any));
      assert.equal(rows.size, 0);
    });
  }
  for (const request of [null, {}, { slot: null }, { slot: { id: sentinel } }]) {
    it(`redacts malformed access with ${request === null ? 0 : Object.keys(request).length} fields`, async () => {
      for (const method of ['write', 'replace', 'clear', 'isConfigured', 'resolveForHandler'] as const) {
        await assert.rejects(provider[method](request as any), error => !String(error).includes(sentinel));
      }
    });
  }
  it('redacts accessor/proxy failures without inspecting their error payload', async () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(sentinel);
        },
      }
    );
    const request = {
      get slot() {
        throw hostile;
      },
    };
    await assert.rejects(provider.isConfigured(request as any), error => !String(error).includes(sentinel));
  });
  it('denies cross-brand, forged slot, undeclared parameter, missing draft, and blank unauthorized access', async () => {
    await assert.rejects(provider.replace({ ...access(), requesterBrandId: 'brand-other', value: sentinel }), {
      code: 'cross-brand-secret-access',
    });
    await assert.rejects(
      provider.replace({ ...access(), slot: { ...slot, parameterName: 'other' }, value: sentinel }),
      { code: 'invalid-secret-slot' }
    );
    await assert.rejects(
      provider.replace({
        ...access(),
        slot: createActionSecretSlotIdentity({ ...slot, parameterName: 'other' }),
        value: sentinel,
      })
    );
    draft = undefined;
    await assert.rejects(provider.write({ ...access(), value: '' }));
    await assert.rejects(provider.replace({ ...access(), value: sentinel }));
    assert.equal(rows.size, 0);
  });
  it('denies forged resolution authority, cross-binding and stale active bindings', async () => {
    await provider.replace({ ...access(), value: sentinel });
    const forged = resolveActionPlan(fixture.registry, {
      schemaVersion: 1,
      recordTypeKey: slot.recordTypeKey,
      bindings: [fixture.binding],
    }).bindings[0]!;
    await assert.rejects(provider.resolveForHandler({ ...access(), resolvedBinding: forged }), {
      code: 'handler-secret-access-denied',
    });
    active.revision.definition.actionBindings = [{ ...fixture.binding, order: 99 }];
    await assert.rejects(resolve());
    active.revision.definition.actionBindings = [];
    await assert.rejects(resolve());
    active = null;
    await assert.rejects(resolve());
  });
  it('denies wrong/missing keys, tampering, oversized and swapped envelopes without leaking adapter errors', async () => {
    await provider.replace({ ...access(), value: sentinel });
    const original = rows.get(slot.id).protectedValue;
    for (const bad of [sentinel, original.slice(0, -2) + (original.endsWith('00') ? '01' : '00'), 'x'.repeat(140000)]) {
      rows.get(slot.id).protectedValue = bad;
      await assert.rejects(resolve(), error => !String(error).includes(sentinel));
    }
    rows.get(slot.id).protectedValue = original;
    process.env.REDBOX_ACTION_SECRET_KEY = randomBytes(32).toString('hex');
    await assert.rejects(resolve());
    delete process.env.REDBOX_ACTION_SECRET_KEY;
    await assert.rejects(provider.replace({ ...access(), value: sentinel }));
    collection.findOne = async () => {
      throw new Error(sentinel);
    };
    await assert.rejects(resolve(), error => !String(error).includes(sentinel));
  });
  it('accepts the UTF-8 byte limit and randomizes repeated ciphertext', async () => {
    const value = 'é'.repeat(32768);
    await provider.replace({ ...access(), value });
    const envelope = rows.get(slot.id).protectedValue;
    assert.equal((await resolve()).reveal(), value);
    await provider.replace({ ...access(), value });
    assert.notEqual(rows.get(slot.id).protectedValue, envelope);
  });
  for (const bytes of [[0xff], [0x80], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    it(`rejects authenticated invalid UTF-8 ${Buffer.from(bytes).toString('hex')} before handler delivery`, async () => {
      await provider.replace({ ...access(), value: sentinel });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.REDBOX_ACTION_SECRET_KEY!, 'hex'), iv);
      cipher.setAAD(Buffer.from(slot.id));
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.concat([Buffer.from(sentinel), Buffer.from(bytes)])),
        cipher.final(),
      ]);
      rows.get(slot.id).protectedValue = [
        'v1',
        iv.toString('hex'),
        cipher.getAuthTag().toString('hex'),
        ciphertext.toString('hex'),
      ].join(':');
      const logs: unknown[] = [];
      for (const level of ['info', 'debug', 'verbose', 'error', 'warn']) {
        sinon.stub((global as any).sails.log, level).callsFake((...args: unknown[]) => logs.push(args));
      }
      await assert.rejects(resolve(), error => {
        assert.ok(error instanceof ActionSecretProviderError);
        assert.equal(error.code, 'secret-provider-failure');
        assert.equal(error.message, 'The action secret provider could not complete the operation.');
        assert.equal(inspect(error, { showHidden: true }).includes(sentinel), false);
        assert.equal(JSON.stringify(error).includes(sentinel), false);
        return true;
      });
      const executor = createRegisteredActionExecutor(fixture.registry, provider, {
        logger: {
          error: (...args) => {
            logs.push(args);
          },
        },
      });
      const operation = createActionExecutionOperation('onCreate', 'b08-utf8-request');
      const outcome = await executor.runSequential(
        { schemaVersion: 1, recordTypeKey: slot.recordTypeKey, bindings: [fixture.binding] },
        {
          schemaVersion: 1,
          executionId: operation.executionId,
          requestId: 'b08-utf8-request',
          correlationId: 'b08-utf8',
          timestamp: '2026-09-05T00:00:00.000Z',
          brandId: slot.brandId,
          recordTypeKey: slot.recordTypeKey,
          scope: fixture.binding.scope,
          actor: null,
          record: { candidate: {} },
          priorOutputs: [],
        },
        operation
      );
      assert.equal(handler.callCount, 0);
      assert.equal(outcome.report.actions[0]?.status, 'failed');
      assert.equal(outcome.report.actions[0]?.failure?.code, 'secret-provider-failure');
      assert.equal(inspect([outcome, operation, logs], { depth: null, showHidden: true }).includes(sentinel), false);
      assert.equal(JSON.stringify([outcome, operation, logs]).includes(sentinel), false);
    });
  }
  it('preserves valid Unicode including a leading BOM and literal replacement character', async () => {
    const value = '\ufeffcredential-\ufffd-é-😀';
    await provider.replace({ ...access(), value });
    assert.equal((await resolve()).reveal(), value);
  });
  it('denies revocation racing the protected read and binds ciphertext to its original slot', async () => {
    await provider.replace({ ...access(), value: sentinel });
    const originalFind = collection.findOne;
    collection.findOne = async (...args: any[]) => {
      const row = await originalFind(...args);
      active.revision.definition.actionBindings = [];
      return row;
    };
    await assert.rejects(resolve());
    collection.findOne = originalFind;
    active.revision.definition.actionBindings = [fixture.binding];
    const other = createActionSecretSlotIdentity({ ...slot, brandId: 'brand-other' });
    draft.branding = other.brandId;
    await provider.replace({ requesterBrandId: other.brandId, slot: other, value: 'other-brand-value' });
    rows.get(slot.id).protectedValue = rows.get(other.id).protectedValue;
    await assert.rejects(resolve());
  });
  it('fails closed on unacknowledged writes and removals', async () => {
    collection.updateOne = async () => ({ acknowledged: false });
    collection.deleteOne = async () => ({ acknowledged: false });
    await assert.rejects(provider.replace({ ...access(), value: sentinel }));
    await assert.rejects(provider.clear(access()));
  });
  it('retains the fence when a slot write loses its acknowledgement', async () => {
    const update = collection.updateOne;
    let writes = 0;
    collection.updateOne = async (...args: any[]) => {
      writes += 1;
      await update(...args);
      throw new Error('Simulated lost acknowledgement');
    };
    await assert.rejects(provider.replace({ ...access(), value: sentinel }));
    await assert.rejects(provider.clear(access()));
    assert.equal(writes, 1);
    assert.equal(rows.get(slot.id).adminVersion, 1);
  });
  it('does not resurrect a replacement whose acknowledgement races a later clear', async () => {
    let applied!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(done => {
      applied = done;
    });
    const proceed = new Promise<void>(done => {
      release = done;
    });
    const update = collection.updateOne;
    collection.updateOne = async (...args: any[]) => {
      const result = await update(...args);
      applied();
      await proceed;
      return result;
    };
    const writing = provider.replace({ ...access(), value: sentinel });
    await reached;
    await assert.rejects(provider.clear(access()));
    release();
    await writing;
    await provider.clear(access());
    assert.equal(rows.get(slot.id).protectedValue, null);
    await assert.rejects(resolve(), { code: 'required-secret-not-configured' });
  });
  it('linearizes replacement/clear without a plaintext read-modify-write or resurrection', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => provider.replace({ ...access(), value: `value-${i}` }))
    );
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(rows.get(slot.id).adminVersion, 1);
    assert.equal(rows.size, 1);
    await provider.clear(access());
    assert.equal(rows.get(slot.id).adminVersion, 2);
    assert.equal(rows.get(slot.id).protectedValue, null);
    await assert.rejects(resolve());
  });
});
