import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { FigsharePublishing } from '../../../src/configmodels/FigsharePublishing';
import { buildMetadataPayload, syncMetadataPhase } from '../../../src/services/figshare-v2/metadata';
import { RBValidationError } from '../../../src/model/RBValidationError';
import type { FigshareClient } from '../../../src/services/figshare-v2/http';
import type { FigshareCategory, RecordModel } from '../../../src/services/figshare-v2/types';

describe('Figshare legacy category publishing', function () {
  let config: FigsharePublishing;
  let client: FigshareClient;
  let catalogue: sinon.SinonStub;

  const categories = [
    { id: 26212, title: 'Engineering', is_selectable: false },
    { id: 26848, title: 'Other engineering', is_selectable: false },
    { id: 26860, title: 'Other engineering not elsewhere classified', is_selectable: true },
  ];

  function record(codes: unknown = []): RecordModel {
    return { redboxOid: 'record-1', metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Dataset', description: 'Description', forCodes: codes, figshare_article_id: '34989604' } } as unknown as RecordModel;
  }

  beforeEach(function () {
    config = new FigsharePublishing();
    config.metadata.license.required = false;
    config.categories.mappingTable = [
      { sourceCode: '40', figshareCategoryId: 26212 },
      { sourceCode: '4099', figshareCategoryId: 26848 },
      { sourceCode: '409999', figshareCategoryId: 26860 },
    ];
    catalogue = sinon.stub().resolves(categories);
    client = {
      listAccountCategories: catalogue,
      createArticle: sinon.stub().resolves({ id: 'created' }),
      updateArticle: sinon.stub().resolves({ status: 'draft' }),
    } as unknown as FigshareClient;
  });

  afterEach(function () { sinon.restore(); });

  it('submits the selectable child, preserving the article binding', async function () {
    const source = record(['40', '4099', '409999']);
    const article = await syncMetadataPhase(client, config, source, {
      action: 'update', articleId: '34989604', sameJob: true, syncState: { status: 'syncing' },
    });
    assert.deepEqual((client.updateArticle as sinon.SinonStub).firstCall.args[1].categories, [26860]);
    assert.equal((client.updateArticle as sinon.SinonStub).firstCall.args[0], '34989604');
    assert.equal(article.id, '34989604');
    assert.equal(source.metadata.figshare_article_id, '34989604');
    sinon.assert.notCalled(client.createArticle as sinon.SinonStub);
  });

  for (const allowUnmapped of [false, true]) {
    for (const codes of [['40', '4099'], ['unknown']]) {
      it(`requires selectable targets for ${codes.join(',')} (allowUnmapped=${allowUnmapped})`, async function () {
        config.categories.allowUnmapped = allowUnmapped;
        await assert.rejects(buildMetadataPayload(config, record(codes), client), (error: unknown) =>
          error instanceof RBValidationError && /Choose at least one selectable category/.test(error.displayErrors[0].detail ?? ''));
      });
    }
    it(`retains empty selections without fetching a catalogue (allowUnmapped=${allowUnmapped})`, async function () {
      config.categories.allowUnmapped = allowUnmapped;
      for (const codes of [[], undefined, null, '']) {
        assert.deepEqual((await buildMetadataPayload(config, record(codes), client)).categories, []);
      }
      sinon.assert.notCalled(catalogue);
    });
  }

  it('uses flags rather than source code length and retains mapping-table ordering and duplicates', async function () {
    catalogue.resolves(categories.map(category => ({ ...category, is_selectable: category.id !== 26860 })));
    const payload = await buildMetadataPayload(config, record(['4099', '409999', '40', '4099']), client);
    assert.deepEqual(payload.categories, [26848, 26212, 26848]);
  });

  it('keeps selectable matches alongside unmapped selections under either existing policy', async function () {
    for (const allowUnmapped of [false, true]) {
      config.categories.allowUnmapped = allowUnmapped;
      assert.deepEqual((await buildMetadataPayload(config, record(['unknown', '409999']), client)).categories, [26860]);
    }
  });

  it('treats missing flags and unlisted IDs as selectable, matching the normalizer default', async function () {
    catalogue.resolves([{ id: 26212, title: 'Engineering' }] satisfies FigshareCategory[]);
    assert.deepEqual((await buildMetadataPayload(config, record(['40', '4099']), client)).categories, [26212, 26848]);
  });

  it('propagates catalogue failures and sends no article mutation', async function () {
    catalogue.rejects(new Error('Category catalogue unavailable'));
    await assert.rejects(syncMetadataPhase(client, config, record(['40']), {
      action: 'update', articleId: '34989604', sameJob: true, syncState: { status: 'syncing' },
    }), /Category catalogue unavailable/);
    sinon.assert.notCalled(client.updateArticle as sinon.SinonStub);
    sinon.assert.notCalled(client.createArticle as sinon.SinonStub);
  });

  it('documents the local-preview limitation: without a client, legacy IDs have no selectability metadata', async function () {
    assert.deepEqual((await buildMetadataPayload(config, record(['40', '4099', '409999']))).categories, [26212, 26848, 26860]);
    sinon.assert.notCalled(catalogue);
  });
});
