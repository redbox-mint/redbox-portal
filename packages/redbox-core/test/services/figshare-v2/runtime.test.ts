import * as sinon from 'sinon';
import { Layer } from 'effect';
import { FigsharePublishing } from '../../../src/configmodels/FigsharePublishing';
import { FigshareClientTag, FigshareHttpError } from '../../../src/services/figshare-v2/http';
import * as httpModule from '../../../src/services/figshare-v2/http';
import { runBuildMetadataPayload } from '../../../src/services/figshare-v2/runtime';

let expect: Chai.ExpectStatic;

describe('figshare-v2 runtime', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  afterEach(function () {
    sinon.restore();
  });

  it('rethrows HTTP failures with status and response details instead of a FiberFailure wrapper', async function () {
    const httpError = new FigshareHttpError('Figshare HTTP request failed for post /account/articles', {
      statusCode: 400,
      responseBody: {
        message: 'Invalid identifier format',
        code: 'BadRequest',
      },
    });
    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(FigshareClientTag, {
        listLicenses: sinon.stub().rejects(httpError),
      } as any)
    );

    const defaults = new FigsharePublishing();
    const config = {
      ...defaults,
      runtime: { mode: 'live' },
      metadata: {
        ...defaults.metadata,
        title: { kind: 'path', path: 'metadata.title', defaultValue: '' },
        description: { kind: 'path', path: 'metadata.description', defaultValue: '' },
        keywords: { kind: 'path', path: 'metadata.keywords', defaultValue: [] },
        license: {
          source: { kind: 'path', path: 'metadata.license', defaultValue: '' },
          matchBy: 'valueExact',
          required: true,
        },
        categories: {
          source: { kind: 'path', path: 'metadata.categories', defaultValue: [] },
        },
        relatedResource: undefined,
      },
      categories: {
        ...defaults.categories,
        allowUnmapped: true,
      },
    } as any;

    let thrown: unknown;
    try {
      await runBuildMetadataPayload(config, {
        redboxOid: 'oid-1',
        metaMetadata: { brandId: 'default' },
        metadata: {
          title: 'Dataset title',
          description: 'Dataset description',
          keywords: ['one'],
          license: '52',
          categories: [],
        },
      } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.equal(httpError);
    expect(thrown).to.be.instanceOf(FigshareHttpError);
    expect((thrown as FigshareHttpError).name).to.equal('FigshareHttpError');
    expect((thrown as FigshareHttpError).statusCode).to.equal(400);
    expect((thrown as FigshareHttpError).responseBody).to.deep.equal({
      message: 'Invalid identifier format',
      code: 'BadRequest',
    });
  });
});
