const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');

// Minimal sails stub required by FigshareService
(global as any).sails = {
  config: {
    figshareAPIEnv: {
      overrideArtifacts: {
        mapping: {
          artifacts: {}
        }
      }
    },
    figshareAPI: {
      APIToken: 'test-token',
      baseURL: 'https://api.figshare.test',
      frontEndURL: 'https://figshare.example',
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
  },
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
  return Promise.resolve(axiosResponses.shift());
};
(require as any).cache[require.resolve('axios')] = { exports: axiosStub as any };

const { Services } = require('../../../services/FigshareService');
const FigshareService = Services.FigshareService;

describe('FigshareService - getArticleFileList pagination', () => {
  let service;

  beforeEach(() => {
    axiosCalls.length = 0;
    axiosResponses = [];
    service = new FigshareService();
    // Set required properties that are private in TS but accessible at runtime
    (service as any).baseURL = 'https://api.figshare.test';
    (service as any).APIToken = 'test-token';
    (global as any).sails.config.figshareAPI.mapping.upload.fileListPageSize = 2;
  });

  it('aggregates multiple pages until a partial page is returned', async () => {
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 1 }, { id: 2 }] },
      { status: 200, statusText: 'OK', data: [{ id: 3 }] }
    ];

    const files = await (service as any).getArticleFileList('123');

    expect(files.map((f) => f.id)).to.deep.equal([1, 2, 3]);
    expect(axiosCalls).to.have.length(2);
    expect(axiosCalls[0].url).to.contain('/account/articles/123/files?page_size=2&page=1');
    expect(axiosCalls[1].url).to.contain('/account/articles/123/files?page_size=2&page=2');
  });

  it('falls back to the default page size when the config value is invalid', async () => {
    (global as any).sails.config.figshareAPI.mapping.upload.fileListPageSize = 'invalid';
    const expectedDefault = 100;

    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 'a' }] }
    ];

    const files = await (service as any).getArticleFileList('abc');

    expect(files.map((f) => f.id)).to.deep.equal(['a']);
    expect(axiosCalls).to.have.length(1);
    expect(axiosCalls[0].url).to.contain(`/account/articles/abc/files?page_size=${expectedDefault}&page=1`);
  });
});

describe('FigshareService - isFileUploadInProgress', () => {
  let service;

  beforeEach(() => {
    service = new FigshareService();
    (service as any).baseURL = 'https://api.figshare.test';
    (service as any).APIToken = 'test-token';
  });

  it('returns true when any file has status "created"', async () => {
    const mockFileList = [{ id: 1, status: 'available' }, { id: 2, status: 'created' }];

    const inProgress = await (service as any).isFileUploadInProgress('article-1', mockFileList);

    expect(inProgress).to.equal(true);
  });

  it('returns false when no files are in progress', async () => {
    const mockFileList = [{ id: 1, status: 'available' }];

    const inProgress = await (service as any).isFileUploadInProgress('article-2', mockFileList);

    expect(inProgress).to.equal(false);
  });
});
