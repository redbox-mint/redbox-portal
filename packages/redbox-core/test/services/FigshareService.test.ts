import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareService';
import { ServiceExports } from '../../src/services';
import { agendaQueue } from '../../src/config/agendaQueue.config';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from '../../src/configmodels/FigsharePublishing';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';
import { resolveFigsharePublishingConfig } from '../../src/services/figshare-v2/config';
import { getRecordField, setRecordField } from '../../src/services/figshare-v2/types';

function buildFigsharePublishingConfig(overrides: Record<string, unknown> = {}) {
  const config = new FigsharePublishing() as unknown as Record<string, unknown>;
  return {
    ...config,
    ...overrides,
    enabled: overrides.enabled ?? true,
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
    writeBack: {
      ...(config.writeBack as Record<string, unknown>),
      articleId: 'metadata.figshare_article_id',
      articleUrls: ['metadata.figshare_article_location'],
      extraFields: [],
      ...(overrides.writeBack as Record<string, unknown> | undefined)
    }
  };
}

function buildFigshareDevConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    mode: 'fixture',
    fixtures: {
      article: {
        id: 'fixture-123',
        url: 'https://figshare.com/articles/fixture-123'
      },
      licenses: [{ value: 1, name: 'CC-BY', url: 'https://license.test/cc-by' }],
      categories: [{ id: 10, title: 'Category 10' }],
      articleFiles: []
    },
    ...overrides
  };
}

describe('FigshareService', function () {
  let service: InstanceType<typeof Services.FigshareService>;
  let getConfigStub: sinon.SinonStub;
  let appConfigByBrandStub: sinon.SinonStub;

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
    mockSails.config.figshareDev = buildFigshareDevConfig();
    const mockQueueService = {
      now: sinon.stub(),
      schedule: sinon.stub()
    };
    mockSails.services.queueservice = mockQueueService;

    setupServiceTestGlobals(mockSails);
    (global as any).AgendaQueueService = mockQueueService;

    appConfigByBrandStub = sinon.stub().callsFake((brand: string) => ({
      figsharePublishing: buildFigsharePublishingConfig({
        queue: {
          publishAfterUploadDelay: brand === 'brand-immediate' ? 'immediate' : 'in 2 minutes',
          uploadedFilesCleanupDelay: brand === 'brand-immediate' ? 'immediate' : 'in 5 minutes'
        }
      })
    }));
    sinon.stub(ServiceExports, 'AppConfigService').get(() => ({
      getAppConfigurationForBrand: appConfigByBrandStub
    }));
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
    (global as any).IntegrationAuditService = {
      startAudit: sinon.stub().callsFake((_oid: string, _action: string, opts: Record<string, unknown>) => ({ startedAt: '2025-01-01T00:00:00.000Z', ...opts })),
      completeAudit: sinon.stub(),
      failAudit: sinon.stub(),
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
    getConfigStub = sinon.stub(service, 'getConfig').callsFake((record?: any) => resolveFigsharePublishingConfig(record));
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).RecordsService;
    delete (global as any).UsersService;
    delete (global as any).AgendaQueueService;
    delete (global as any).IntegrationAuditService;
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
    expect((global as any).IntegrationAuditService.startAudit.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.completeAudit.calledOnce).to.be.true;
  });

  it('writes a failed integration audit when syncRecordWithFigshare throws', async function () {
    const record = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'default' },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
      },
    } as any;
    sinon.stub(service, 'syncMetadata').rejects(new Error('sync exploded'));

    try {
      await service.syncRecordWithFigshare(record, 'job-1');
      expect.fail('Expected syncRecordWithFigshare to throw');
    } catch (error) {
      expect((error as Error).message).to.equal('sync exploded');
    }
    expect((global as any).IntegrationAuditService.startAudit.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
  });

  it('audits publishAfterUploadFilesJob success and failure paths', async function () {
    (global as any).RecordsService.getMeta.resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'default' },
      metadata: {},
    });
    const client = {
      publishArticle: sinon.stub().resolves({ status: 'published' }),
      getArticle: sinon.stub().resolves({ id: 'article-1', status: 'public' }),
    };
    sinon.stub(service, 'makeClient').returns(client as any);
    sinon.stub(service as any, 'ensureNoFileUploadInProgress').resolves();
    sinon.stub(service, 'writeBack').returns({ redboxOid: 'oid-1', metaMetadata: { brandId: 'default' }, metadata: {} } as any);
    sinon.stub(service, 'persistSyncRecord').resolves();
    sinon.stub(service, 'queueDeleteFiles');

    await service.publishAfterUploadFilesJob({
      attrs: { data: { oid: 'oid-1', articleId: 'article-1', brandId: 'default', user: { username: 'user-1' } } },
    } as any);

    expect((global as any).IntegrationAuditService.startAudit.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.completeAudit.calledOnce).to.be.true;

    client.publishArticle.rejects(new Error('publish failed'));
    try {
      await service.publishAfterUploadFilesJob({
      attrs: { data: { oid: 'oid-1', articleId: 'article-1', brandId: 'default', user: { username: 'user-1' } } },
      } as any);
      expect.fail('Expected publishAfterUploadFilesJob to throw');
    } catch (error) {
      expect((error as Error).message).to.equal('publish failed');
    }
    expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
  });

  it('resolves live mode when figshareDev is disabled', function () {
    (global as any).sails.config.figshareDev = { enabled: false, mode: 'fixture' };
    const resolved = service.getConfig({
      metaMetadata: { brandId: 'default' }
    } as any);

    expect(resolved?.runtime.mode).to.equal('live');
  });

  it('resolves fixture mode from figshareDev in non-production environments', function () {
    (global as any).sails.config.environment = 'development';
    (global as any).sails.config.figshareDev = buildFigshareDevConfig({
      fixtures: {
        article: { id: 'fixture-dev' }
      }
    });

    const resolved = service.getConfig({
      metaMetadata: { brandId: 'default' }
    } as any);

    expect(resolved?.runtime.mode).to.equal('fixture');
    expect(resolved?.runtime.fixtures?.article?.id).to.equal('fixture-dev');
  });

  it('ignores figshareDev fixture mode in production', function () {
    (global as any).sails.config.environment = 'production';
    (global as any).sails.config.figshareDev = buildFigshareDevConfig();

    const resolved = service.getConfig({
      metaMetadata: { brandId: 'default' }
    } as any);

    expect(resolved?.runtime.mode).to.equal('live');
  });

  it('ignores legacy testing data in stored figsharePublishing config', function () {
    appConfigByBrandStub.callsFake(() => ({
      figsharePublishing: {
        ...buildFigsharePublishingConfig(),
        testing: {
          mode: 'fixture',
          fixtures: {
            article: { id: 'legacy-fixture' }
          }
        }
      }
    }));
    (global as any).sails.config.figshareDev = { enabled: false, mode: 'live' };

    const resolved = service.getConfig({
      metaMetadata: { brandId: 'default' }
    } as any);

    expect(resolved?.runtime.mode).to.equal('live');
    expect(resolved?.runtime.fixtures).to.equal(undefined);
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
    expect(schema.properties.testing).to.equal(undefined);
  });
});

describe('Figshare record field helpers', function () {
  it('should get and set normal nested record fields', function () {
    const record: Record<string, unknown> = { metadata: { title: 'Initial' } };

    expect(getRecordField(record as any, 'metadata.title')).to.equal('Initial');
    setRecordField(record as any, 'metadata.description.text', 'Description');

    expect(getRecordField(record as any, 'metadata.description.text')).to.equal('Description');
  });

  it('should reject empty path segments when writing and return undefined when reading', function () {
    const record: Record<string, unknown> = {};

    expect(getRecordField(record as any, 'metadata..title')).to.equal(undefined);
    expect(() => setRecordField(record as any, 'metadata..title', 'Title')).to.throw("Invalid record field path");
  });

  it('should reject prototype-polluting path segments', function () {
    const record: Record<string, unknown> = {};

    expect(getRecordField(record as any, '__proto__.polluted')).to.equal(undefined);
    expect(() => setRecordField(record as any, '__proto__.polluted', true)).to.throw("Invalid record field path");
    expect(() => setRecordField(record as any, 'constructor.prototype.polluted', true)).to.throw("Invalid record field path");
    expect(() => setRecordField(record as any, 'metadata.prototype.polluted', true)).to.throw("Invalid record field path");
    expect(({} as Record<string, unknown>).polluted).to.equal(undefined);
  });
});
