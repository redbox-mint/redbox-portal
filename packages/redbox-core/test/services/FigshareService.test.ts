import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareService';
import { agendaQueue } from '../../src/config/agendaQueue.config';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from '../../src/configmodels/FigsharePublishing';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

function buildFigsharePublishingConfig(overrides: Record<string, unknown> = {}) {
  const config = new FigsharePublishing() as unknown as Record<string, unknown>;
  return {
    ...config,
    ...overrides,
    connection: {
      ...config.connection as Record<string, unknown>,
      baseUrl: 'https://api.figshare.com',
      frontEndUrl: 'https://figshare.com',
      token: 'token',
      timeoutMs: 1000,
      operationTimeouts: { metadataMs: 1000, uploadInitMs: 1000, uploadPartMs: 1000, publishMs: 1000 },
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, retryOnStatusCodes: [], retryOnMethods: ['get', 'put', 'delete'] },
      ...(overrides.connection as Record<string, unknown> | undefined)
    },
    article: {
      ...(config.article as Record<string, unknown>),
      itemType: 'dataset',
      publishMode: 'manual',
      republishOnMetadataChange: true,
      republishOnAssetChange: true,
      ...(overrides.article as Record<string, unknown> | undefined)
    },
    record: {
      ...(config.record as Record<string, unknown>),
      articleIdPath: 'metadata.figshare_article_id',
      articleUrlPaths: ['metadata.figshare_article_location'],
      dataLocationsPath: 'metadata.dataLocations',
      statusPath: 'metadata.figshareStatus',
      errorPath: 'metadata.figshareError',
      syncStatePath: 'metadata.figshareSyncState',
      allFilesUploadedPath: '',
      ...(overrides.record as Record<string, unknown> | undefined)
    },
    selection: {
      ...(config.selection as Record<string, unknown>),
      attachmentMode: 'selectedOnly',
      urlMode: 'selectedOnly',
      selectedFlagPath: 'selected',
      ...(overrides.selection as Record<string, unknown> | undefined)
    },
    authors: {
      ...(config.authors as Record<string, unknown>),
      contributorPaths: ['metadata.contributor_ci', 'metadata.contributors'],
      uniqueBy: 'email',
      externalNameField: 'text_full_name',
      maxInlineAuthors: 10,
      lookup: [],
      ...(overrides.authors as Record<string, unknown> | undefined)
    },
    metadata: {
      ...(config.metadata as Record<string, unknown>),
      title: { kind: 'path', path: 'metadata.title' },
      description: { kind: 'path', path: 'metadata.description' },
      keywords: { kind: 'path', path: 'metadata.keywords' },
      license: { source: { kind: 'path', path: 'metadata.license' }, matchBy: 'urlContains', required: true },
      categories: { source: { kind: 'path', path: 'metadata.forCodes' }, mappingStrategy: 'for2020Mapping' },
      customFields: [],
      ...(overrides.metadata as Record<string, unknown> | undefined)
    },
    categories: {
      ...(config.categories as Record<string, unknown>),
      strategy: 'for2020Mapping',
      mappingTable: [{ sourceCode: '0101', figshareCategoryId: 10 }],
      allowUnmapped: true,
      ...(overrides.categories as Record<string, unknown> | undefined)
    },
    assets: {
      ...(config.assets as Record<string, unknown>),
      enableHostedFiles: true,
      enableLinkFiles: true,
      dedupeStrategy: 'sourceId',
      staging: { cleanupPolicy: 'deleteAfterSuccess', diskSpaceThresholdBytes: 1000, ...(overrides.assets as Record<string, unknown> | undefined)?.staging as Record<string, unknown> | undefined },
      ...(overrides.assets as Record<string, unknown> | undefined)
    },
    embargo: {
      ...(config.embargo as Record<string, unknown>),
      mode: 'recordDriven',
      forceSync: true,
      accessRights: { accessRights: { kind: 'path', path: 'metadata.accessRights' } },
      ...(overrides.embargo as Record<string, unknown> | undefined)
    },
    queue: {
      ...(config.queue as Record<string, unknown>),
      publishAfterUploadDelay: 'in 2 minutes',
      uploadedFilesCleanupDelay: 'in 5 minutes',
      ...(overrides.queue as Record<string, unknown> | undefined)
    },
    workflow: {
      ...(config.workflow as Record<string, unknown>),
      transitionRules: [],
      transitionJob: {
        enabled: false,
        namedQuery: '',
        targetStep: '',
        paramMap: {},
        figshareTargetFieldKey: '',
        figshareTargetFieldValue: '',
        username: '',
        userType: '',
        ...((overrides.workflow as Record<string, unknown> | undefined)?.transitionJob as Record<string, unknown> | undefined)
      },
      ...(overrides.workflow as Record<string, unknown> | undefined)
    },
    testing: {
      ...(config.testing as Record<string, unknown>),
      mode: 'fixture',
      fixtures: {
        article: { id: 'fixture-123' },
        licenses: [{ value: 1, name: 'CC-BY', url: 'https://license.test/cc-by' }],
        categories: [{ id: 10, title: 'Category 10' }],
        articleFiles: []
      },
      ...(overrides.testing as Record<string, unknown> | undefined)
    },
    writeBack: {
      ...(config.writeBack as Record<string, unknown>),
      articleId: 'metadata.figshare_article_id',
      articleUrls: ['metadata.figshare_article_location'],
      extraFields: [],
      ...(overrides.writeBack as Record<string, unknown> | undefined)
    }
  };
}

describe('FigshareService', function () {
  let service: InstanceType<typeof Services.FigshareService>;
  let getConfigStub: sinon.SinonStub;

  beforeEach(function () {
    const mockSails = createMockSails({
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
        crit: sinon.stub(),
        fatal: sinon.stub(),
        silly: sinon.stub(),
        blank: sinon.stub(),
        log: sinon.stub(),
        silent: sinon.stub()
      }
    });
    mockSails.config.queue = { serviceName: 'queueservice' };
    mockSails.services.queueservice = {
      now: sinon.stub(),
      schedule: sinon.stub()
    };

    setupServiceTestGlobals(mockSails);

    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().callsFake((brand: string) => ({
        figsharePublishing: buildFigsharePublishingConfig({
          queue: {
            publishAfterUploadDelay: brand === 'brand-immediate' ? 'immediate' : 'in 2 minutes',
            uploadedFilesCleanupDelay: brand === 'brand-immediate' ? 'immediate' : 'in 5 minutes'
          }
        })
      }))
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'default-id', name: 'default' })
    };
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      hasEditAccess: sinon.stub().resolves(true),
      updateMeta: sinon.stub().resolves({ success: true })
    };
    (global as any).UsersService = {
      getUserWithUsername: sinon.stub().returns({ toPromise: sinon.stub().resolves({ username: 'figshare-job-user', type: 'admin', roles: [] }) })
    };
    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves({}),
      performNamedQueryFromConfigResults: sinon.stub().resolves([])
    };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns({ toPromise: sinon.stub().resolves({}) })
    };
    (global as any).WorkflowStepsService = {
      get: sinon.stub().returns({ toPromise: sinon.stub().resolves({}) })
    };

    service = new Services.FigshareService();
    getConfigStub = sinon.stub(service, 'getConfig').callsFake((record?: any) => buildFigsharePublishingConfig({
      queue: {
        publishAfterUploadDelay: record?.metaMetadata?.brandId === 'brand-immediate' ? 'immediate' : 'in 2 minutes',
        uploadedFilesCleanupDelay: record?.metaMetadata?.brandId === 'brand-immediate' ? 'immediate' : 'in 5 minutes'
      }
    }) as any);
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfigService;
    delete (global as any).BrandingService;
    delete (global as any).RecordsService;
    delete (global as any).UsersService;
    delete (global as any).NamedQueryService;
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    sinon.restore();
  });

  it('exports the canonical figshare lifecycle methods', function () {
    const exports = service.exports() as Record<string, unknown>;
    expect(exports).to.have.property('createUpdateFigshareArticle');
    expect(exports).to.have.property('uploadFilesToFigshareArticle');
    expect(exports).to.have.property('publishAfterUploadFilesJob');
    expect(exports).to.have.property('transitionRecordWorkflowFromFigshareArticlePropertiesJob');
    expect(exports).to.have.property('syncRecordWithFigshare');
  });

  it('uses fixture mode to build metadata and write back article identifiers', async function () {
    const record = {
      metaMetadata: { brandId: 'default' },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY'
      }
    } as any;

    const result = await service.syncRecordWithFigshare(record, 'job-1');
    expect(result.metadata.figshare_article_id).to.equal('fixture-123');
    expect(result.metadata.figshare_article_location).to.equal('https://figshare.com/articles/fixture-123');
  });

  it('agenda queue targets figshareservice jobs', function () {
    const publishJob = agendaQueue.jobs.find((job) => job.name === 'Figshare-PublishAfterUpload-Service');
    const cleanupJob = agendaQueue.jobs.find((job) => job.name === 'Figshare-UploadedFilesCleanup-Service');

    expect(publishJob?.fnName).to.equal('figshareservice.publishAfterUploadFilesJob');
    expect(cleanupJob?.fnName).to.equal('figshareservice.deleteFilesFromRedbox');
  });

  it('uses figsharePublishing queue delays when scheduling jobs', function () {
    const scheduleStub = ((global as any).sails.services.queueservice.schedule as sinon.SinonStub);

    service.queuePublishAfterUploadFiles('oid-1', 'article-1', {} as any, 'default');
    service.queueDeleteFiles('oid-1', {} as any, 'default', 'article-1');

    expect(scheduleStub.firstCall.args[1]).to.equal('in 2 minutes');
    expect(scheduleStub.secondCall.args[1]).to.equal('in 5 minutes');
  });

  it('uses immediate queue execution when configured', function () {
    const nowStub = ((global as any).sails.services.queueservice.now as sinon.SinonStub);

    service.queuePublishAfterUploadFiles('oid-1', 'article-1', {} as any, 'brand-immediate');
    service.queueDeleteFiles('oid-1', {} as any, 'brand-immediate', 'article-1');

    expect(nowStub.calledTwice).to.be.true;
  });

  it('writes the all-files-uploaded flag from figsharePublishing record config', async function () {
    getConfigStub.callsFake(() => buildFigsharePublishingConfig({
      record: {
        articleIdPath: 'metadata.figshare_article_id',
        articleUrlPaths: ['metadata.figshare_article_location'],
        dataLocationsPath: 'metadata.dataLocations',
        statusPath: 'metadata.figshareStatus',
        errorPath: 'metadata.figshareError',
        syncStatePath: 'metadata.figshareSyncState',
        allFilesUploadedPath: 'metadata.figshare_all_files_uploaded'
      }
    }) as any);

    sinon.stub(service as any, 'getArticleFiles').resolves([{ name: 'file-1.txt', download_url: 'https://files.example/file-1.txt' }]);
    sinon.stub(service as any, 'makeClient').returns({});

    const record: any = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'default' },
      metadata: {
        dataLocations: [{ type: 'attachment', fileId: 'file-1', name: 'file-1.txt', selected: true }]
      }
    };

    const result = await (service as any).cleanupUploadedFiles(record, 'article-1');
    expect(result.metadata.figshare_all_files_uploaded).to.equal('yes');
  });

  it('uses only article.curationLock when checking curation lock state', function () {
    const record: any = {
      metaMetadata: { brandId: 'default' }
    };
    getConfigStub.callsFake(() => buildFigsharePublishingConfig({
      article: {
        itemType: 'dataset',
        publishMode: 'manual',
        republishOnMetadataChange: true,
        republishOnAssetChange: true,
        curationLock: {
          enabled: true,
          statusField: 'status',
          targetValue: 'public'
        }
      }
    }) as any);

    expect((service as any).isCurationLocked(record, { status: 'public' })).to.equal(true);
    expect((service as any).isCurationLocked(record, { status: 'draft' })).to.equal(false);
  });

  it('uses figsharePublishing transitionJob config when running the workflow transition job', async function () {
    getConfigStub.callsFake(() => buildFigsharePublishingConfig({
      record: {
        articleIdPath: 'metadata.v2.articleId',
        articleUrlPaths: ['metadata.figshare_article_location'],
        dataLocationsPath: 'metadata.dataLocations',
        statusPath: 'metadata.figshareStatus',
        errorPath: 'metadata.figshareError',
        syncStatePath: 'metadata.figshareSyncState',
        allFilesUploadedPath: ''
      },
      workflow: {
        transitionRules: [],
        transitionJob: {
          enabled: true,
          namedQuery: 'v2-transition',
          targetStep: 'published',
          paramMap: {},
          figshareTargetFieldKey: 'status',
          figshareTargetFieldValue: 'public',
          username: 'figshare-job-user',
          userType: 'admin'
        }
      }
    }) as any);
    (global as any).NamedQueryService.performNamedQueryFromConfigResults.resolves([{ oid: 'oid-1' }]);
    (global as any).RecordsService.getMeta.resolves({
      oid: 'oid-1',
      metadata: { v2: { articleId: 'v2-path-id' } },
      metaMetadata: { brandId: 'default', type: 'dataset' }
    });
    const transitionStub = sinon.stub(service as any, 'transitionWorkflowForRecord').resolves();

    await service.transitionRecordWorkflowFromFigshareArticlePropertiesJob({});

    expect(transitionStub.calledOnce).to.be.true;
    expect(transitionStub.firstCall.args[2]).to.equal('oid-1');
    expect(transitionStub.firstCall.args[3]).to.equal('v2-path-id');
  });

  it('figsharePublishing defaults include queue and transition job fields', function () {
    const config = new FigsharePublishing();
    expect(config.queue.publishAfterUploadDelay).to.equal('in 2 minutes');
    expect(config.queue.uploadedFilesCleanupDelay).to.equal('in 5 minutes');
    expect(config.record.allFilesUploadedPath).to.equal('');
    expect(config.workflow.transitionJob.enabled).to.equal(false);
    expect(config.workflow.transitionJob.namedQuery).to.equal('');

    const schema = FIGSHARE_PUBLISHING_SCHEMA as Record<string, any>;
    expect(schema.properties.queue.properties.publishAfterUploadDelay.default).to.equal('in 2 minutes');
    expect(schema.properties.workflow.properties.transitionJob.properties.username.default).to.equal('');
  });
});
