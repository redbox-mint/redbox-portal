import * as sinon from 'sinon';
import { Layer } from 'effect';
import { FigsharePublishing } from '../../../src/configmodels/FigsharePublishing';
import type { AxiosError } from 'axios';
import { describeFigshareHttpFailure, FigshareClientTag, FigshareHttpError } from '../../../src/services/figshare-v2/http';
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

  it('logs Figshare validation details without Axios request headers or tokens', function () {
    const token = 'test-private-figshare-token';
    const error = {
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      config: { headers: { Authorization: `token ${token}` } },
      request: { headers: { Authorization: `token ${token}` } },
      response: { data: { code: 'BadRequest', message: `Missing mandatory value: ${token}` } }
    } as unknown as AxiosError;
    const details = describeFigshareHttpFailure(error, token);

    expect(details).to.deep.equal({
      errorName: 'AxiosError',
      errorCode: 'ERR_BAD_REQUEST',
      responseCode: 'BadRequest',
      responseMessage: 'Missing mandatory value: [REDACTED]'
    });
    expect(JSON.stringify(details)).not.to.include(token);
    expect(JSON.stringify(details)).not.to.include('Authorization');
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
