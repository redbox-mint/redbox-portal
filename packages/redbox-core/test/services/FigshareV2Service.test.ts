import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareV2Service';
import { agendaQueue } from '../../src/config/agendaQueue.config';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('FigshareV2Service', function () {
  let service: any;

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

    setupServiceTestGlobals(mockSails);
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({
        figsharePublishing: {
          enabled: true,
          connection: {
            baseUrl: 'https://api.figshare.com',
            frontEndUrl: 'https://figshare.com',
            token: 'token',
            timeoutMs: 1000,
            operationTimeouts: { metadataMs: 1000, uploadInitMs: 1000, uploadPartMs: 1000, publishMs: 1000 },
            retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, retryOnStatusCodes: [], retryOnMethods: ['get', 'put', 'delete'] }
          },
          article: {
            itemType: 'dataset',
            publishMode: 'manual',
            republishOnMetadataChange: true,
            republishOnAssetChange: true
          },
          record: {
            articleIdPath: 'metadata.figshare_article_id',
            articleUrlPaths: ['metadata.figshare_article_location'],
            dataLocationsPath: 'metadata.dataLocations',
            statusPath: 'metadata.figshareStatus',
            errorPath: 'metadata.figshareError',
            syncStatePath: 'metadata.figshareSyncState'
          },
          selection: { attachmentMode: 'selectedOnly', urlMode: 'selectedOnly', selectedFlagPath: 'selected' },
          authors: {
            source: 'defaultRedboxContributors',
            contributorPaths: ['metadata.contributor_ci', 'metadata.contributors'],
            uniqueBy: 'email',
            externalNameField: 'text_full_name',
            maxInlineAuthors: 10,
            emailTransform: { prefix: '', domainOverride: '' },
            lookup: []
          },
          metadata: {
            title: { kind: 'path', path: 'metadata.title' },
            description: { kind: 'path', path: 'metadata.description' },
            keywords: { kind: 'path', path: 'metadata.keywords' },
            license: { source: { kind: 'path', path: 'metadata.license' }, matchBy: 'urlContains', required: true },
            categories: { source: { kind: 'path', path: 'metadata.forCodes' }, mappingStrategy: 'for2020Mapping' },
            customFields: []
          },
          categories: { strategy: 'for2020Mapping', mappingTable: [{ sourceCode: '0101', figshareCategoryId: 10 }], allowUnmapped: true },
          assets: {
            enableHostedFiles: true,
            enableLinkFiles: true,
            dedupeStrategy: 'sourceId',
            staging: { cleanupPolicy: 'deleteAfterSuccess', diskSpaceThresholdBytes: 1000 }
          },
          embargo: {
            mode: 'recordDriven',
            forceSync: true,
            accessRights: { accessRights: { kind: 'path', path: 'metadata.accessRights' } }
          },
          workflow: { transitionRules: [] },
          testing: { mode: 'fixture', fixtures: { article: { id: 'fixture-123' } } },
          writeBack: {
            articleId: 'metadata.figshare_article_id',
            articleUrls: ['metadata.figshare_article_location'],
            extraFields: []
          }
        }
      })
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

    service = new Services.FigshareV2Service();
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
    const exports = service.exports();
    expect(exports).to.have.property('createUpdateFigshareArticle');
    expect(exports).to.have.property('uploadFilesToFigshareArticle');
    expect(exports).to.have.property('publishAfterUploadFilesJob');
    expect(exports).to.have.property('transitionRecordWorkflowFromFigshareArticlePropertiesJob');
  });

  it('uses fixture mode to build metadata and write back article identifiers', async function () {
    const record: any = {
      metaMetadata: { branding: 'default' },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY'
      }
    };

    const result = await service.syncRecordWithFigshareV2(record, 'job-1');
    expect(result.metadata.figshare_article_id).to.equal('fixture-123');
    expect(result.metadata.figshare_article_location).to.equal('https://figshare.com/articles/fixture-123');
  });

  it('agenda queue targets figsharev2service jobs', function () {
    const publishJob = agendaQueue.jobs.find((job) => job.name === 'Figshare-PublishAfterUpload-Service');
    const cleanupJob = agendaQueue.jobs.find((job) => job.name === 'Figshare-UploadedFilesCleanup-Service');

    expect(publishJob?.fnName).to.equal('figsharev2service.publishAfterUploadFilesJob');
    expect(cleanupJob?.fnName).to.equal('figsharev2service.deleteFilesFromRedbox');
  });

  it('uses V2 cleanup for deleteFilesFromRedboxTrigger', async function () {
    sinon.stub(service as any, 'metTriggerCondition').returns('true');
    const cleanupStub = sinon.stub(service as any, 'cleanupUploadedFiles').resolves({ metadata: { done: true } });

    const record = { metadata: { figshare_article_id: 'fixture-123' } };
    const result = await service.deleteFilesFromRedboxTrigger('oid-1', record, {}, {});

    expect(cleanupStub.calledOnceWith(record, 'fixture-123')).to.be.true;
    expect(result).to.deep.equal({ metadata: { done: true } });
  });

  it('uses the V2 articleIdPath when running the workflow transition job', async function () {
    (global as any).AppConfigService.getAppConfigurationForBrand = sinon.stub().returns({
      figsharePublishing: {
        enabled: true,
        connection: {
          baseUrl: 'https://api.figshare.com',
          frontEndUrl: 'https://figshare.com',
          token: 'token',
          timeoutMs: 1000,
          operationTimeouts: { metadataMs: 1000, uploadInitMs: 1000, uploadPartMs: 1000, publishMs: 1000 },
          retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, retryOnStatusCodes: [], retryOnMethods: ['get'] }
        },
        article: { itemType: 'dataset', publishMode: 'manual', republishOnMetadataChange: true, republishOnAssetChange: true },
        record: {
          articleIdPath: 'metadata.v2.articleId',
          articleUrlPaths: ['metadata.figshare_article_location'],
          dataLocationsPath: 'metadata.dataLocations',
          statusPath: 'metadata.figshareStatus',
          errorPath: 'metadata.figshareError',
          syncStatePath: 'metadata.figshareSyncState'
        },
        selection: { attachmentMode: 'selectedOnly', urlMode: 'selectedOnly', selectedFlagPath: 'selected' },
        authors: {
          source: 'defaultRedboxContributors',
          contributorPaths: ['metadata.contributors'],
          uniqueBy: 'email',
          externalNameField: 'text_full_name',
          maxInlineAuthors: 10,
          emailTransform: { prefix: '', domainOverride: '' },
          lookup: []
        },
        metadata: {
          title: { kind: 'path', path: 'metadata.title' },
          description: { kind: 'path', path: 'metadata.description' },
          keywords: { kind: 'path', path: 'metadata.keywords' },
          license: { source: { kind: 'path', path: 'metadata.license' }, matchBy: 'urlContains', required: true },
          categories: { source: { kind: 'path', path: 'metadata.forCodes' }, mappingStrategy: 'for2020Mapping' },
          customFields: []
        },
        categories: { strategy: 'for2020Mapping', mappingTable: [], allowUnmapped: true },
        assets: {
          enableHostedFiles: true,
          enableLinkFiles: true,
          dedupeStrategy: 'sourceId',
          staging: { cleanupPolicy: 'deleteAfterSuccess', diskSpaceThresholdBytes: 1000 }
        },
        embargo: { mode: 'none', forceSync: false, accessRights: { accessRights: { kind: 'path', path: 'metadata.accessRights' } } },
        workflow: { transitionRules: [] },
        testing: { mode: 'fixture', fixtures: { article: { id: 'fixture-123' } } },
        writeBack: { articleId: 'metadata.v2.articleId', articleUrls: ['metadata.figshare_article_location'], extraFields: [] }
      }
    });
    (global as any).sails.config.figshareAPI = {
      mapping: {
        figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob: {
          enabled: 'true',
          namedQuery: 'v2-transition',
          targetStep: 'published',
          paramMap: {},
          figshareTargetFieldKey: 'status',
          figshareTargetFieldValue: 'public',
          username: 'figshare-job-user',
          userType: 'admin'
        }
      }
    };
    (global as any).NamedQueryService.performNamedQueryFromConfigResults.resolves([{ oid: 'oid-1', metadata: { figshare_article_id: 'legacy-path-id' } }]);
    (global as any).RecordsService.getMeta.resolves({
      oid: 'oid-1',
      metadata: { v2: { articleId: 'v2-path-id' } },
      metaMetadata: { branding: 'default', type: 'dataset' }
    });
    const transitionStub = sinon.stub(service as any, 'transitionWorkflowForRecord').resolves();

    await service.transitionRecordWorkflowFromFigshareArticlePropertiesJob({});

    expect(transitionStub.calledOnce).to.be.true;
    expect(transitionStub.firstCall.args[2]).to.equal('oid-1');
    expect(transitionStub.firstCall.args[3]).to.equal('v2-path-id');
  });
});
