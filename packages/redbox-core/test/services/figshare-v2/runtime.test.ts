import * as sinon from 'sinon';
import { Layer } from 'effect';
import { runSyncMetadataProgram } from '../../../src/services/figshare-v2/runtime';
import { FigshareClientTag, FigshareHttpError } from '../../../src/services/figshare-v2/http';
import * as httpModule from '../../../src/services/figshare-v2/http';

let expect: Chai.ExpectStatic;

describe('figshare-v2 runtime', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  afterEach(function () {
    sinon.restore();
  });

  it('rethrows the original FigshareHttpError instead of the FiberFailure wrapper', async function () {
    const httpError = new FigshareHttpError('Figshare HTTP request failed for post /account/articles', {
      statusCode: 422,
      responseBody: { message: 'Invalid field: group_id' }
    });
    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(FigshareClientTag, {
        getArticle: sinon.stub().rejects(httpError)
      } as any)
    );

    const config = { article: {} } as any;
    const runContext = {
      recordOid: 'oid-1',
      brandId: 'default',
      brandName: 'default',
      correlationId: 'corr-1',
      triggerSource: 'test'
    } as any;

    try {
      await runSyncMetadataProgram(config, runContext, {} as any, { articleId: '123' } as any);
      expect.fail('Expected runSyncMetadataProgram to throw');
    } catch (error) {
      // Effect.runPromise would reject with a FiberFailure that hides these properties;
      // the audit summary depends on them surviving the runtime boundary.
      expect(error).to.be.instanceOf(FigshareHttpError);
      expect((error as FigshareHttpError).statusCode).to.equal(422);
      expect((error as FigshareHttpError).responseBody).to.deep.equal({ message: 'Invalid field: group_id' });
    }
  });

  it('returns program results unchanged on success', async function () {
    const article = { id: '123', status: 'draft' };
    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(FigshareClientTag, {
        getArticle: sinon.stub().resolves(article),
        listArticleFiles: sinon.stub().resolves([])
      } as any)
    );

    const config = {
      article: { curationLock: { enabled: true, statusField: 'status', targetValue: 'draft' } }
    } as any;
    const runContext = {
      recordOid: 'oid-1',
      brandId: 'default',
      brandName: 'default',
      correlationId: 'corr-1',
      triggerSource: 'test'
    } as any;

    const result = await runSyncMetadataProgram(config, runContext, {} as any, { articleId: '123' } as any);
    expect(result).to.deep.equal(article);
  });

  it('loads the created article from the location returned by Figshare', async function () {
    const article = { id: '456', status: 'draft' };
    const client = {
      createArticle: sinon.stub().resolves({ location: 'https://api.figsh.com/v2/account/articles/456' }),
      getArticle: sinon.stub().resolves(article),
      listLicenses: sinon.stub().resolves([{ value: 1, name: 'CC-BY' }]),
      searchInstitutionAccounts: sinon.stub().resolves([])
    };
    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(FigshareClientTag, client as any)
    );

    const config = {
      article: { itemType: 'dataset' },
      authors: { contributorPaths: [], uniqueBy: 'none', maxInlineAuthors: 0, lookup: [] },
      metadata: {
        title: { kind: 'path', path: 'metadata.title' },
        description: { kind: 'path', path: 'metadata.description' },
        keywords: { kind: 'path', path: 'metadata.keywords' },
        categories: { source: { kind: 'path', path: 'metadata.categories' } },
        license: { source: { kind: 'path', path: 'metadata.license' }, matchBy: 'valueExact', required: true },
        customFields: []
      },
      categories: { mappingTable: [], allowUnmapped: true },
      connection: { baseUrl: 'https://api.figsh.com/v2', token: 'token' }
    } as any;
    const record = {
      metadata: {
        title: 'Title',
        description: 'Description',
        keywords: [],
        categories: [],
        license: '1'
      }
    } as any;
    const runContext = {
      recordOid: 'oid-1',
      brandId: 'default',
      brandName: 'default',
      correlationId: 'corr-1',
      triggerSource: 'test'
    } as any;

    const result = await runSyncMetadataProgram(config, runContext, record, { action: 'create' } as any);

    expect(result).to.deep.equal(article);
    expect(client.getArticle.calledOnceWithExactly('456')).to.equal(true);
  });
});
