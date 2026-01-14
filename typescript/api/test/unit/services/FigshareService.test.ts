const { describe, it, beforeEach, before } = require('mocha');

// Minimal sails stub required by FigshareService
const baseConfig = {
  figshareAPIEnv: {
    overrideArtifacts: {
      mapping: {
        artifacts: {}
      }
    }
  },
  figshareAPI: {
    APIToken: 'test-token',
    baseURL: 'https://api.figshare.test.localhost',
    frontEndURL: 'https://figshare.test.localhost',
    mapping: {
      upload: {
        fileListPageSize: 2,
        override: {}
      },
      figshareOnlyPublishSelectedAttachmentFiles: false,
      recordAllFilesUploaded: false,
      targetState: {},
      response: {
        article: {}
      }
    },
    diskSpaceThreshold: 0
  },
  figshareReDBoxFORMapping: {
    FORMapping: []
  },
  record: {
    createUpdateFigshareArticleLogLevel: 'verbose'
  },
  queue: {
    serviceName: ''
  }
};

(global as any).sails = {
  config: JSON.parse(JSON.stringify(baseConfig)),
  log: {
    verbose: () => {},
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  },
  services: {},
  on: () => {}
};

// axios is required at module load in FigshareService, so we must set the stub before importing it
const axiosCalls: any[] = [];
let axiosResponses: any[] = [];
const axiosStub = (config) => {
  axiosCalls.push(config);
  if (!axiosResponses.length) {
    return Promise.reject(new Error('No axios mock response available'));
  }
  const next = axiosResponses.shift();
  if (next instanceof Error) {
    return Promise.reject(next);
  }
  if (next && next.__error) {
    return Promise.reject(next.__error);
  }
  return Promise.resolve(next);
};
(require as any).cache[require.resolve('axios')] = { exports: axiosStub as any };

const { Services } = require('../../../services/FigshareService');
const FigshareService = Services.FigshareService;

describe('FigshareService - getArticleFileList pagination', () => {
  let service;
  let expect;

  before(async () => {
    // @ts-ignore
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    axiosCalls.length = 0;
    axiosResponses = [];
    (global as any).sails.config = JSON.parse(JSON.stringify(baseConfig));
    service = new FigshareService();
    (global as any).sails.config.figshareAPI.mapping.upload.fileListPageSize = 2;
  });

  it('aggregates multiple pages until a partial page is returned', async () => {
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 1 }, { id: 2 }] },
      { status: 200, statusText: 'OK', data: [{ id: 3 }] }
    ];

    const config = (service as any).getRuntimeConfig();
    const files = await (service as any).getArticleFileList(config, '123');

    expect(files.map((f) => f.id)).to.deep.equal([1, 2, 3]);
    expect(axiosCalls).to.have.length(2);
    expect(axiosCalls[0].url).to.contain('/account/articles/123/files?page_size=2&page=1');
    expect(axiosCalls[1].url).to.contain('/account/articles/123/files?page_size=2&page=2');
  });

  it('falls back to the default page size when the config value is invalid', async () => {
    (global as any).sails.config.figshareAPI.mapping.upload.fileListPageSize = 'invalid';
    const expectedDefault = 20;

    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 'a' }] }
    ];

    const config = (service as any).getRuntimeConfig();
    const files = await (service as any).getArticleFileList(config, 'abc');

    expect(files.map((f) => f.id)).to.deep.equal(['a']);
    expect(axiosCalls).to.have.length(1);
    expect(axiosCalls[0].url).to.contain(`/account/articles/abc/files?page_size=${expectedDefault}&page=1`);
  });

  it('returns an empty list when no files are found', async () => {
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [] }
    ];

    const config = (service as any).getRuntimeConfig();
    const files = await (service as any).getArticleFileList(config, 'empty');

    expect(files).to.deep.equal([]);
    expect(axiosCalls).to.have.length(1);
    expect(axiosCalls[0].url).to.contain('/account/articles/empty/files?page_size=2&page=1');
  });
});

describe('FigshareService - isFileUploadInProgress', () => {
  let service;
  let expect;

  before(async () => {
    // @ts-ignore
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    (global as any).sails.config = JSON.parse(JSON.stringify(baseConfig));
    service = new FigshareService();
  });

  it('returns true when any file has status "created"', async () => {
    const mockFileList = [{ id: 1, status: 'available' }, { id: 2, status: 'created' }];

    const config = (service as any).getRuntimeConfig();
    const inProgress = await (service as any).isFileUploadInProgress(config, 'article-1', mockFileList);

    expect(inProgress).to.equal(true);
  });

  it('returns false when no files are in progress', async () => {
    const mockFileList = [{ id: 1, status: 'available' }];

    const config = (service as any).getRuntimeConfig();
    const inProgress = await (service as any).isFileUploadInProgress(config, 'article-2', mockFileList);

    expect(inProgress).to.equal(false);
  });
});

describe('FigshareService - runtime config + retries', () => {
  let service;
  let expect;

  before(async () => {
    // @ts-ignore
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    axiosCalls.length = 0;
    axiosResponses = [];
    (global as any).sails.config = JSON.parse(JSON.stringify(baseConfig));
    service = new FigshareService();
  });

  it('uses override artifacts and normalizes record URL paths', () => {
    (global as any).sails.config.figshareAPIEnv.overrideArtifacts.APIToken = 'override-token';
    (global as any).sails.config.figshareAPIEnv.overrideArtifacts.baseURL = 'https://override.localhost';
    (global as any).sails.config.figshareAPI.mapping.recordFigArticleURL = 'metadata.figshare_url';

    const config = (service as any).getRuntimeConfig();

    expect(config.apiToken).to.equal('override-token');
    expect(config.baseURL).to.equal('https://override.localhost');
    expect(config.figArticleURLPathInRecordList).to.deep.equal(['metadata.figshare_url']);
  });

  it('retries transient failures and succeeds', async () => {
    const config = (service as any).getRuntimeConfig();
    (service as any).sleep = async () => {};

    const retryableError: any = new Error('transient');
    retryableError.response = { status: 503, statusText: 'Service Unavailable', data: {} };
    axiosResponses = [
      retryableError,
      { status: 200, statusText: 'OK', data: { ok: true } }
    ];

    const response = await (service as any).requestWithRetry(
      config,
      { method: 'get', url: 'https://example.test' },
      { retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } }
    );

    expect(response.status).to.equal(200);
    expect(axiosCalls).to.have.length(2);
  });

  it('does not retry non-retryable errors', async () => {
    const config = (service as any).getRuntimeConfig();
    (service as any).sleep = async () => {};

    const nonRetryableError: any = new Error('bad request');
    nonRetryableError.response = { status: 400, statusText: 'Bad Request', data: {} };
    axiosResponses = [
      nonRetryableError
    ];

    let caught = false;
    try {
      await (service as any).requestWithRetry(
        config,
        { method: 'get', url: 'https://example.test' },
        { retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } }
      );
    } catch (err) {
      caught = true;
    }

    expect(caught).to.equal(true);
    expect(axiosCalls).to.have.length(1);
  });
});
