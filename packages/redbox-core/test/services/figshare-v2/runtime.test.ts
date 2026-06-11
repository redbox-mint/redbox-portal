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
});
