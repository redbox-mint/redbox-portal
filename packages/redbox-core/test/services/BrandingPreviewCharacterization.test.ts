import { brandingInput } from '../helpers/brandingInputs';
import assert from 'node:assert/strict';
import sinon from 'sinon';
import { stubCacheEntryRepository } from '../helpers/cacheRepository';
import { Services } from '../../src/services/BrandingService';
import { createDomainFixture } from './testHelper';

describe('Branding preview persistence characterization (P0)', function () {
  let service: Services.Branding;
  let find: sinon.SinonStub;
  let destroy: sinon.SinonStub;
  let fixture: any;
  const now = 1_792_339_200;
  const data = { css: '/* synthetic */', branding: 'brand-a', portal: 'portal-a', hash: 'synthetic', revision: 2 };

  beforeEach(function () {
    sinon.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
    fixture = createDomainFixture({ config: { branding: {} } });
    find = sinon.stub().resolves({ id: 'preview-id', name: 'branding-preview:token', data, ts_added: now });
    destroy = sinon.stub().resolves([]);
    const repo = stubCacheEntryRepository();
    repo.findByName = find;
    repo.deleteById = destroy;
    service = new Services.Branding(brandingInput(fixture));
  });

  afterEach(async function () {
    await Promise.resolve();
    sinon.restore();

  });

  it('reads by token and deletes by string ID before returning the scoped payload', async function () {
    let finishDelete: (() => void) | undefined;
    destroy.returns(
      new Promise<void>(resolve => {
        finishDelete = resolve;
      })
    );
    let resolved = false;
    const result = service.fetchPreview('token').then(value => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    assert.deepEqual(find.firstCall.args, ['branding-preview:token']);
    assert.deepEqual(destroy.firstCall.args, ['preview-id']);
    assert.equal(resolved, false);
    assert(finishDelete);
    finishDelete();
    assert.deepEqual(await result, data);
  });

  it('accepts the default 300-second boundary and deletes an older preview before reporting expiry', async function () {
    find.resolves({ id: 'preview-id', name: 'branding-preview:token', data, ts_added: now - 300 });
    assert.deepEqual(await service.fetchPreview('boundary'), data);
    find.resolves({ id: 'preview-id', name: 'branding-preview:token', data, ts_added: now - 301 });
    await assert.rejects(service.fetchPreview('expired'), /^Error: preview-expired$/);
    assert.equal(destroy.callCount, 2);
    find.resolves(null);
    await assert.rejects(service.fetchPreview('absent'), /^Error: preview-not-found$/);
    assert.equal(destroy.callCount, 2);
  });

  it('uses the configured preview TTL independently of the general cache TTL', async function () {
    Object.assign(fixture.config.branding, { previewTtlSeconds: 5 });
    find.resolves({ id: 'preview-id', name: 'branding-preview:token', data, ts_added: now - 6 });
    await assert.rejects(service.fetchPreview('expired'), /preview-expired/);
    assert.equal(destroy.callCount, 1);
  });

  it('propagates deletion failure for both valid and expired previews', async function () {
    destroy.rejects(new Error('synthetic deletion failure'));
    await assert.rejects(service.fetchPreview('valid'), /synthetic deletion failure/);
    find.resolves({ id: 'preview-id', name: 'branding-preview:token', data, ts_added: now - 301 });
    await assert.rejects(service.fetchPreview('expired'), /synthetic deletion failure/);
  });

  it('allows two readers that both find the row before deletion (non-atomic delete-after-read)', async function () {
    const [first, second] = await Promise.all([service.fetchPreview('token'), service.fetchPreview('token')]);
    assert.deepEqual(first, data);
    assert.deepEqual(second, data);
    assert.equal(destroy.callCount, 2);
  });
  it('propagates lookup failure without attempting deletion', async function () {
    const failure = new Error('synthetic preview lookup failure');
    find.rejects(failure);
    await assert.rejects(service.fetchPreview('token'), error => error === failure);
    assert.equal(destroy.callCount, 0);
  });
});
