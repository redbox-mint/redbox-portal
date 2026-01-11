const { describe, it, beforeEach, before } = require('mocha');

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
  let expect;

  before(async () => {
    // @ts-ignore
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    axiosCalls.length = 0;
    axiosResponses = [];
    service = new FigshareService();
    // Set required properties that are private in TS but accessible at runtime
    (service as any).baseURL = 'https://api.figshare.test.localhost';
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
    const expectedDefault = 20;

    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 'a' }] }
    ];

    const files = await (service as any).getArticleFileList('abc');

    expect(files.map((f) => f.id)).to.deep.equal(['a']);
    expect(axiosCalls).to.have.length(1);
    expect(axiosCalls[0].url).to.contain(`/account/articles/abc/files?page_size=${expectedDefault}&page=1`);
  });

  it('returns an empty list when no files are found', async () => {
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [] }
    ];

    const files = await (service as any).getArticleFileList('empty');

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
    service = new FigshareService();
    (service as any).baseURL = 'https://api.figshare.test.localhost';
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

describe('FigshareService - getAuthorUserIDs author ordering', () => {
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
    service = new FigshareService();
    (service as any).baseURL = 'https://api.figshare.test.localhost';
    (service as any).APIToken = 'test-token';
    (service as any).recordAuthorExternalName = 'name';
    (service as any).recordAuthorUniqueBy = '';
    (service as any).createUpdateFigshareArticleLogLevel = 'verbose';
    
    // Setup the figshareAPI config for author lookup
    (global as any).sails.config.figshareAPI.mapping.templates = {
      getAuthor: [
        { template: '<%= field.email %>', email: '' }
      ]
    };
    (global as any).sails.config.figshareAPI.mapping.figshareAuthorUserId = 'id';
  });

  it('maintains original order when all authors are matched to Figshare accounts', async () => {
    const authors = [
      { name: 'Author One', email: 'author1@test.com' },
      { name: 'Author Two', email: 'author2@test.com' },
      { name: 'Author Three', email: 'author3@test.com' }
    ];

    // All authors found in Figshare
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 101 }] },
      { status: 200, statusText: 'OK', data: [{ id: 102 }] },
      { status: 200, statusText: 'OK', data: [{ id: 103 }] }
    ];

    const result = await (service as any).getAuthorUserIDs(authors);

    expect(result).to.have.length(3);
    expect(result[0]).to.deep.equal({ id: 101 });
    expect(result[1]).to.deep.equal({ id: 102 });
    expect(result[2]).to.deep.equal({ id: 103 });
  });

  it('maintains original order when all authors are external (not matched)', async () => {
    const authors = [
      { name: 'External One', email: 'ext1@test.com' },
      { name: 'External Two', email: 'ext2@test.com' },
      { name: 'External Three', email: 'ext3@test.com' }
    ];

    // No authors found in Figshare
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [] },
      { status: 200, statusText: 'OK', data: [] },
      { status: 200, statusText: 'OK', data: [] }
    ];

    const result = await (service as any).getAuthorUserIDs(authors);

    expect(result).to.have.length(3);
    expect(result[0]).to.deep.equal({ name: 'External One' });
    expect(result[1]).to.deep.equal({ name: 'External Two' });
    expect(result[2]).to.deep.equal({ name: 'External Three' });
  });

  it('maintains original order with mixed matched and external authors', async () => {
    const authors = [
      { name: 'Matched Author', email: 'matched1@test.com' },
      { name: 'External Author', email: 'external@test.com' },
      { name: 'Another Matched', email: 'matched2@test.com' },
      { name: 'Another External', email: 'external2@test.com' }
    ];

    // First and third authors found, second and fourth not found
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [{ id: 201 }] },  // matched1
      { status: 200, statusText: 'OK', data: [] },             // external - not found
      { status: 200, statusText: 'OK', data: [{ id: 203 }] },  // matched2
      { status: 200, statusText: 'OK', data: [] }              // external2 - not found
    ];

    const result = await (service as any).getAuthorUserIDs(authors);

    expect(result).to.have.length(4);
    // Order should be preserved: matched, external, matched, external
    expect(result[0]).to.deep.equal({ id: 201 });
    expect(result[1]).to.deep.equal({ name: 'External Author' });
    expect(result[2]).to.deep.equal({ id: 203 });
    expect(result[3]).to.deep.equal({ name: 'Another External' });
  });

  it('maintains original order when external authors are interspersed between matched authors', async () => {
    const authors = [
      { name: 'External First', email: 'ext1@test.com' },
      { name: 'Matched Middle', email: 'matched@test.com' },
      { name: 'External Last', email: 'ext2@test.com' }
    ];

    // Only middle author found
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [] },             // ext1 - not found
      { status: 200, statusText: 'OK', data: [{ id: 999 }] },  // matched
      { status: 200, statusText: 'OK', data: [] }              // ext2 - not found
    ];

    const result = await (service as any).getAuthorUserIDs(authors);

    expect(result).to.have.length(3);
    // Order should be: external, matched, external (original order preserved)
    expect(result[0]).to.deep.equal({ name: 'External First' });
    expect(result[1]).to.deep.equal({ id: 999 });
    expect(result[2]).to.deep.equal({ name: 'External Last' });
  });

  it('handles API errors gracefully and adds author as external', async () => {
    const authors = [
      { name: 'Error Author', email: 'error@test.com' },
      { name: 'Success Author', email: 'success@test.com' }
    ];

    // First call throws error, second succeeds
    axiosResponses = [
      null, // Will cause rejection
      { status: 200, statusText: 'OK', data: [{ id: 500 }] }
    ];

    // Override axios to throw on null response
    const originalShift = axiosResponses.shift.bind(axiosResponses);
    axiosResponses.shift = () => {
      const resp = originalShift();
      if (resp === null) {
        throw new Error('API Error');
      }
      return resp;
    };

    const result = await (service as any).getAuthorUserIDs(authors);

    expect(result).to.have.length(2);
    // First author should be added as external due to error, second matched
    expect(result[0]).to.deep.equal({ name: 'Error Author' });
    expect(result[1]).to.deep.equal({ id: 500 });
  });

  it('skips authors with undefined name when adding as external', async () => {
    const authors = [
      { name: 'Valid Name', email: 'valid@test.com' },
      { email: 'noname@test.com' },  // No name property
      { name: 'Another Valid', email: 'another@test.com' }
    ];

    // None found in Figshare
    axiosResponses = [
      { status: 200, statusText: 'OK', data: [] },
      { status: 200, statusText: 'OK', data: [] },
      { status: 200, statusText: 'OK', data: [] }
    ];

    const result = await (service as any).getAuthorUserIDs(authors);

    // Only authors with valid names should be added
    expect(result).to.have.length(2);
    expect(result[0]).to.deep.equal({ name: 'Valid Name' });
    expect(result[1]).to.deep.equal({ name: 'Another Valid' });
  });
});
