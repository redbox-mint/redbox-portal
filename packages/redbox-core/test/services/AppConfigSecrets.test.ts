import { expect } from 'chai';
import * as sinon from 'sinon';
import { CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AppConfigSecrets } from '../../src/services/AppConfigSecrets';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('AppConfigSecrets', function () {
  const config = { provider: 'aws-secrets-manager' as const, region: 'ap-southeast-2', namePrefix: 'test/appconfig' };
  const reference = (arn: string, key?: string) => ({ $appConfigSecret: { provider: 'aws-secrets-manager' as const, arn, ...(key === undefined ? {} : { key }) } });
  let store: AppConfigSecrets;
  let send: sinon.SinonStub;
  let awsSend: (command: CreateSecretCommand | GetSecretValueCommand | PutSecretValueCommand) => Promise<unknown>;
  let secrets: Map<string, { arn: string; name: string; value: string }>;
  let locks: Map<string, { owner: string; expiresAt: Date }>;

  beforeEach(function () {
    setupServiceTestGlobals(createMockSails());
    secrets = new Map();
    locks = new Map();
    (globalThis as unknown as Record<string, unknown>).AppConfig = {
      getDatastore: () => ({ manager: { collection: () => ({
        updateOne: async (filter: { _id: string; expiresAt: { $lte: Date } }, update: { $set: { owner: string; expiresAt: Date } }) => {
          const lock = locks.get(filter._id);
          if (lock && lock.expiresAt > filter.expiresAt.$lte) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
          locks.set(filter._id, update.$set);
          return { matchedCount: lock ? 1 : 0 };
        },
        deleteOne: async (filter: { _id: string; owner: string }) => {
          if (locks.get(filter._id)?.owner === filter.owner) locks.delete(filter._id);
        }
      }) } })
    };
    awsSend = async command => {
      if (command instanceof CreateSecretCommand) {
        const name = command.input.Name!;
        if (secrets.has(name)) throw Object.assign(new Error('Exists'), { name: 'ResourceExistsException' });
        const arn = `arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:${name}-123456`;
        const value = { arn, name, value: command.input.SecretString! };
        secrets.set(arn, value);
        secrets.set(name, value);
        return { ARN: arn, Name: name };
      }
      const id = command.input.SecretId;
      const secret = secrets.get(id);
      if (!secret) throw Object.assign(new Error('Missing'), { name: 'ResourceNotFoundException' });
      if (command instanceof GetSecretValueCommand) return { ARN: secret.arn, Name: secret.name, SecretString: secret.value };
      if (command instanceof PutSecretValueCommand) {
        secret.value = command.input.SecretString!;
        return { ARN: secret.arn, Name: secret.name };
      }
      throw new Error('Unexpected command');
    };
    send = sinon.stub(SecretsManagerClient.prototype, 'send').callsFake(awsSend);
    store = new AppConfigSecrets(config);
  });

  afterEach(function () {
    sinon.restore();
    cleanupServiceTestGlobals();
    delete (globalThis as unknown as Record<string, unknown>).AppConfig;
  });

  function calls(type: typeof CreateSecretCommand | typeof GetSecretValueCommand | typeof PutSecretValueCommand): number {
    return send.getCalls().filter(call => call.args[0] instanceof type).length;
  }

  it('seeds field values from creation and coalesces concurrent reads after invalidation', async function () {
    const ref = await store.store('brand1', 'test', 'token', 'value');
    expect(await store.resolve(ref)).to.equal('value');
    expect(calls(GetSecretValueCommand)).to.equal(0);
    store.invalidate(ref.$appConfigSecret.arn);
    expect(await Promise.all([store.resolve(ref), store.resolve(ref)])).to.deep.equal(['value', 'value']);
    expect(calls(GetSecretValueCommand)).to.equal(1);
  });

  it('does not cache failed reads or expose AWS error details', async function () {
    const ref = reference('arn:missing');
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await store.resolve(ref); expect.fail('Expected rejection'); }
      catch (error) { expect(String(error)).to.equal('Error: Unable to resolve AppConfig secret in AWS Secrets Manager'); }
    }
    expect(calls(GetSecretValueCommand)).to.equal(2);
  });

  it('creates one JSON secret for multiple fields and updates the same ARN', async function () {
    const arn = (await store.storeBundle('brand1', new Map([['token', 'first'], ['password', 'second']])))!;
    expect(calls(CreateSecretCommand)).to.equal(1);
    expect(await store.resolve(reference(arn, 'token'))).to.equal('first');
    expect(await store.resolve(reference(arn, 'password'))).to.equal('second');
    send.resetHistory();
    expect(await store.storeBundle('brand1', new Map([['token', 'changed']]))).to.equal(arn);
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(1);
    expect(calls(CreateSecretCommand)).to.equal(0);
    expect(await store.resolve(reference(arn, 'password'))).to.equal('second');
    expect(await store.resolve(reference(arn, 'token'))).to.equal('changed');
  });

  it('merges against AWS rather than a stale process cache and deletes cleared fields', async function () {
    const arn = (await store.storeBundle('brand1', new Map([['a', 'original']])))!;
    const otherProcess = new AppConfigSecrets(config);
    await otherProcess.storeBundle('brand1', new Map([['b', 'other-process']]));
    await store.storeBundle('brand1', new Map([['c', 'new'], ['a', null]]));
    expect(JSON.parse(secrets.get(arn)!.value).values).to.deep.equal({ b: 'other-process', c: 'new' });
  });

  it('does not put identical values or create an empty secret for clears', async function () {
    await store.storeBundle('brand1', new Map([['token', 'same']]));
    send.resetHistory();
    await store.storeBundle('brand1', new Map([['token', 'same']]));
    expect(calls(PutSecretValueCommand)).to.equal(0);
    await store.storeBundle('empty-brand', new Map([['token', null]]));
    expect(calls(CreateSecretCommand)).to.equal(0);
  });

  it('keeps separate brands in separate secrets', async function () {
    const first = await store.storeBundle('first-brand', new Map([['token', 'first']]));
    const second = await store.storeBundle('second-brand', new Map([['token', 'second']]));
    expect(first).not.to.equal(second);
    expect(calls(CreateSecretCommand)).to.equal(2);
  });

  it('rejects an overlapping writer before it reads AWS and releases the lease after completion', async function () {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    send.callsFake(async command => { await gate; return awsSend(command); });
    const first = store.storeBundle('brand1', new Map([['a', 'first']]));
    await new Promise(resolve => setImmediate(resolve));
    const otherProcess = new AppConfigSecrets(config);
    try { await otherProcess.storeBundle('brand1', new Map([['b', 'second']])); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.contain('update is in progress'); }
    expect(send.callCount).to.equal(1);
    release();
    await first;
    expect(locks.size).to.equal(0);
    await otherProcess.storeBundle('brand1', new Map([['b', 'second']]));
    expect(locks.size).to.equal(0);
  });

  it('fails closed without MongoDB write coordination', async function () {
    delete (globalThis as unknown as Record<string, unknown>).AppConfig;
    (globalThis as unknown as Record<string, unknown>).AppConfig = {};
    try { await store.storeBundle('brand1', new Map([['token', 'value']])); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.contain('MongoDB write coordination'); }
    expect(send.called).to.equal(false);
  });

  it('rejects oversized bundles before writing AWS', async function () {
    try { await store.storeBundle('brand1', new Map([['token', 'x'.repeat(65_536)]])); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.contain('Unable to store'); }
    expect(calls(CreateSecretCommand)).to.equal(0);
    expect(calls(PutSecretValueCommand)).to.equal(0);
    expect(locks.size).to.equal(0);
  });

  it('sanitizes bundle update errors and leaves the previous cached value available', async function () {
    const arn = (await store.storeBundle('brand1', new Map([['token', 'original']])))!;
    send.callsFake(async command => {
      if (command instanceof PutSecretValueCommand) throw Object.assign(new Error('Access denied arn:private value=secret'), { name: 'AccessDeniedException' });
      return awsSend(command);
    });
    try { await store.storeBundle('brand1', new Map([['token', 'changed']])); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.equal('Error: Unable to store AppConfig secret in AWS Secrets Manager'); }
    expect(await store.resolve(reference(arn, 'token'))).to.equal('original');
    expect(locks.size).to.equal(0);
  });

  it('aborts slow requests and keeps their lease until expiry before allowing recovery', async function () {
    const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    send.callsFake(async (_command, options) => new Promise((_resolve, reject) => {
      options.abortSignal.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const result = store.storeBundle('brand1', new Map([['token', 'original']])).then(
      () => { throw new Error('Expected timeout'); }, error => error
    );
    await new Promise(resolve => setImmediate(resolve));
    await clock.tickAsync(30_001);
    expect(String(await result)).to.contain('Unable to store');
    expect(locks.size).to.equal(1);
    send.callsFake(awsSend);
    await clock.tickAsync(90_000);
    const recovered = new AppConfigSecrets(config);
    await recovered.storeBundle('brand1', new Map([['token', 'recovered']]));
    expect(locks.size).to.equal(0);
    clock.restore();
  });

  it('refreshes all fields in a bundle with one read on explicit invalidation', async function () {
    const arn = (await store.storeBundle('brand1', new Map([['a', 'first'], ['b', 'second']])))!;
    const secret = secrets.get(arn)!;
    secret.value = JSON.stringify({ format: 'redbox-appconfig-v1', values: { a: 'rotated', b: 'second' } });
    store.invalidate(arn);
    send.resetHistory();
    expect(await store.resolve(reference(arn, 'a'))).to.equal('rotated');
    expect(await store.resolve(reference(arn, 'b'))).to.equal('second');
    expect(calls(GetSecretValueCommand)).to.equal(1);
  });
});
