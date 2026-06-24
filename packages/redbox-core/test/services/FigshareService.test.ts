import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareService';
import { ServiceExports } from '../../src/services';
import { agendaQueue } from '../../src/config/agendaQueue.config';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from '../../src/configmodels/FigsharePublishing';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';
import { resolveFigsharePublishingConfig } from '../../src/services/figshare-v2/config';
import { mapCreateArticleResponse } from '../../src/services/figshare-v2/http';
import { buildMetadataPayload } from '../../src/services/figshare-v2/metadata';
import { getRecordField, setRecordField } from '../../src/services/figshare-v2/types';
import type { RecordModel } from '../../src/services/figshare-v2/types';
import type { FigshareClient } from '../../src/services/figshare-v2/http';
import type { FigsharePublishingConfigData } from '../../src/configmodels/FigsharePublishing';

let expect!: Chai.ExpectStatic;

before(async function () {
  ({ expect } = await import('chai'));
});

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
    (global as any).TranslationService = {
      t: sinon.stub().returnsArg(0)
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
    delete (global as any).TranslationService;
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

  it('honours triggerCondition before Figshare lifecycle sync', async function () {
    const options = {
      triggerCondition:
        '<%= _.isEqual(record.workflow.stage, "queued") && _.isEqual(_.get(record, "metadata.dataset-will-be-published"), "yes") %>'
    };
    const draftRecord = {
      redboxOid: 'oid-draft',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-draft', attachmentFields: [] },
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      metadata: {
        title: 'Draft dataset',
        'dataset-will-be-published': 'yes'
      },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    const queuedRecord = {
      redboxOid: 'oid-queued',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      metadata: {
        title: 'Queued dataset',
        'dataset-will-be-published': 'yes'
      },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    const user = { id: 'user-1', username: 'user-1', type: 'admin', name: 'User One', email: 'user-1@example.org', lastLogin: new Date(), additionalAttributes: {}, loginDisabled: false, workspaceApps: [], roles: [] };
    const syncStub = sinon.stub(service, 'syncRecordWithFigshare').resolves(queuedRecord);

    const skipped = service.createUpdateFigshareArticle('oid-draft', draftRecord, options, user);
    expect(skipped).to.equal(draftRecord);
    expect(syncStub.called).to.equal(false);

    const uploadSkipped = service.uploadFilesToFigshareArticle('oid-draft', draftRecord, options, user);
    expect(uploadSkipped).to.equal(draftRecord);
    expect(syncStub.called).to.equal(false);

    const synced = await service.createUpdateFigshareArticle('oid-queued', queuedRecord, options, user);
    expect(synced).to.equal(queuedRecord);
    expect(syncStub.calledOnceWithExactly(queuedRecord, 'oid-queued:pre', 'pre-save')).to.equal(true);
  });

  it('runs Figshare lifecycle sync when no triggerCondition is configured', async function () {
    const record = {
      redboxOid: 'oid-no-condition',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      metadata: {
        title: 'Queued dataset',
        'dataset-will-be-published': 'yes'
      },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    const user = { id: 'user-1', username: 'user-1', type: 'admin', name: 'User One', email: 'user-1@example.org', lastLogin: new Date(), additionalAttributes: {}, loginDisabled: false, workspaceApps: [], roles: [] };
    const syncStub = sinon.stub(service, 'syncRecordWithFigshare').resolves(record);

    const synced = await service.createUpdateFigshareArticle('oid-no-condition', record, {}, user);
    expect(synced).to.equal(record);
    expect(syncStub.calledOnceWithExactly(record, 'oid-no-condition:pre', 'pre-save')).to.equal(true);

    service.uploadFilesToFigshareArticle('oid-no-condition', record, {}, user);
    expect(syncStub.calledWithExactly(record, 'oid-no-condition:post', 'post-save')).to.equal(true);
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

  it('uses path binding defaults when metadata values are null', async function () {
    const config = buildFigsharePublishingConfig({
      metadata: {
        customFields: [
          {
            figshareField: 'Number and size of Dataset',
            value: { kind: 'path', path: 'metadata.dataset-size', defaultValue: '' }
          },
          {
            figshareField: 'Author Research Institute',
            value: { kind: 'path', path: 'metadata.research-centres', defaultValue: [] }
          }
        ]
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
        'dataset-size': null,
        'research-centres': null
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };

    const payload = await buildMetadataPayload(config, record);

    expect(payload.custom_fields).to.deep.equal({
      'Number and size of Dataset': '',
      'Author Research Institute': []
    });
  });

  it('maps Figshare categories from URI-based source notations', async function () {
    const config = buildFigsharePublishingConfig({
      metadata: {
        categories: {
          source: { kind: 'path', path: 'metadata.anzsrcFor', defaultValue: [] },
          mappingStrategy: 'for2020Mapping'
        }
      },
      categories: {
        mappingTable: [
          { sourceCode: '300201', figshareCategoryId: 25508 },
          { sourceCode: '300202', figshareCategoryId: 25509 }
        ]
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        anzsrcFor: [
          {
            notation: 'https://linked.data.gov.au/def/anzsrc-for/2020/300201',
            label: '300201 - Agricultural hydrology'
          },
          {
            notation: 'https://linked.data.gov.au/def/anzsrc-for/2020#300202',
            label: '300202 - Agronomy'
          }
        ],
        license: 'CC-BY'
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };

    const payload = await buildMetadataPayload(config, record);

    expect(payload.categories).to.deep.equal([25508, 25509]);
  });

  it('maps multiple related data publications into Figshare related materials', async function () {
    const config = buildFigsharePublishingConfig({
      metadata: {
        relatedResource: {
          title: { kind: 'path', path: 'metadata.related_data', defaultValue: [] },
          doi: { kind: 'path', path: 'metadata.related_data', defaultValue: [] }
        }
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
        related_data: [
          {
            related_title: 'Related dataset one',
            related_url: 'https://doi.org/10.1234/related-one',
            related_notes: 'First related data publication'
          },
          {
            related_title: 'Related dataset two',
            related_url: 'https://doi.org/10.1234/related-two',
            related_notes: 'Second related data publication'
          },
          {
            related_title: 'Missing identifier',
            related_url: ''
          }
        ]
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };

    const payload = await buildMetadataPayload(config, record);

    expect(payload.related_materials).to.deep.equal([
      {
        title: 'Related dataset one',
        identifier: 'https://doi.org/10.1234/related-one'
      },
      {
        title: 'Related dataset two',
        identifier: 'https://doi.org/10.1234/related-two'
      }
    ]);
  });

  it('maps related data publications when only the identifier binding resolves to repeater objects', async function () {
    const config = buildFigsharePublishingConfig({
      metadata: {
        relatedResource: {
          title: { kind: 'path', path: 'metadata.related_titles', defaultValue: [] },
          doi: { kind: 'path', path: 'metadata.related_data', defaultValue: [] }
        }
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
        related_data: [
          {
            related_title: 'Related dataset one',
            related_url: 'https://doi.org/10.1234/related-one'
          },
          {
            related_title: 'Related dataset two',
            related_url: 'https://doi.org/10.1234/related-two'
          }
        ]
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };

    const payload = await buildMetadataPayload(config, record);

    expect(payload.related_materials).to.deep.equal([
      {
        title: 'Related dataset one',
        identifier: 'https://doi.org/10.1234/related-one'
      },
      {
        title: 'Related dataset two',
        identifier: 'https://doi.org/10.1234/related-two'
      }
    ]);
  });

  it('does not cross-fill scalar related material title and identifier sources', async function () {
    const config = buildFigsharePublishingConfig({
      metadata: {
        relatedResource: {
          title: { kind: 'path', path: 'metadata.related_titles', defaultValue: [] },
          doi: { kind: 'path', path: 'metadata.related_identifiers', defaultValue: [] }
        }
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
        related_titles: ['Title only', '', 'Related dataset'],
        related_identifiers: ['', 'https://doi.org/10.1234/identifier-only', 'https://doi.org/10.1234/related']
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };

    const payload = await buildMetadataPayload(config, record);

    expect(payload.related_materials).to.deep.equal([
      {
        title: 'Related dataset',
        identifier: 'https://doi.org/10.1234/related'
      }
    ]);
  });

  it('uses institution account user_id values for resolved Figshare authors', async function () {
    const config = buildFigsharePublishingConfig({
      authors: {
        lookup: [
          { matchBy: 'email', value: { kind: 'path', path: 'email' } }
        ]
      },
      metadata: {
        license: {
          source: { kind: 'path', path: 'metadata.license' },
          matchBy: 'valueExact',
          required: true
        }
      }
    }) as unknown as FigsharePublishingConfigData;
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: '1',
        contributor_ci: {
          name: 'Patricia Hayman',
          email: 'p.hayman@cqu.edu.au'
        },
        contributors: [
          {
            name: 'Mark Cottman-Fields',
            email: 'm.cottmanfields@cqu.edu.au'
          },
          {
            name: 'External Author',
            email: 'external@example.org'
          }
        ]
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    const searchInstitutionAccounts: FigshareClient['searchInstitutionAccounts'] = async (payload) => {
      if (payload.email === 'p.hayman@cqu.edu.au') {
        return [{ id: 1897685, user_id: 2544547, email: 'p.hayman@cqu.edu.au', first_name: 'Patricia', last_name: 'Hayman' }];
      }
      if (payload.email === 'm.cottmanfields@cqu.edu.au') {
        return [{ id: 3015702, user_id: 4402702, email: 'm.cottmanfields@cqu.edu.au', first_name: 'Mark', last_name: 'Cottman-Fields' }];
      }
      return [];
    };
    const client: FigshareClient = {
      createArticle: async () => ({ id: 'unused' }),
      updateArticle: async () => ({ id: 'unused' }),
      getArticle: async () => ({ id: 'unused' }),
      listArticleFiles: async () => [],
      createArticleFile: async () => ({ location: '' }),
      getLocation: async () => ({ id: '', upload_url: '' }),
      uploadFilePart: async () => ({}),
      completeFileUpload: async () => ({ id: '', name: '' }),
      deleteArticleFile: async () => ({}),
      setEmbargo: async () => ({}),
      clearEmbargo: async () => ({}),
      publishArticle: async () => ({}),
      listLicenses: async () => [{ value: 1, name: 'CC-BY' }],
      searchInstitutionAccounts
    };

    const payload = await buildMetadataPayload(config, record, client);

    expect(payload.authors).to.deep.equal([
      { id: 2544547 },
      { id: 4402702 },
      { name: 'External Author' }
    ]);
  });

  it('writes a failed integration audit when syncRecordWithFigshare throws', async function () {
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    sinon.stub(service, 'syncMetadata').rejects(new Error('sync exploded'));

    try {
      await service.syncRecordWithFigshare(record, 'job-1');
      expect.fail('Expected syncRecordWithFigshare to throw');
    } catch (error) {
      // Wrapped Doi-style: translated RBValidationError with the original error as cause.
      expect((error as Error).message).to.equal('Figshare API error Error syncing record with Figshare');
      expect(((error as Error).cause as Error)?.message).to.equal('sync exploded');
      expect((error as { displayErrors?: Array<{ code?: string }> }).displayErrors?.[0]?.code).to.equal('server-error');
    }
    expect((global as any).IntegrationAuditService.startAudit.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
    expect((global as any).IntegrationAuditService.failAudit.firstCall.args[1].message).to.equal('sync exploded');
  });

  it('surfaces Figshare response messages for 4xx sync failures', async function () {
    const record: RecordModel = {
      redboxOid: 'oid-1',
      harvestId: '',
      metaMetadata: { brandId: 'default', createdBy: 'admin', type: 'dataPublication', searchCore: 'default', form: 'dataPublication-1.0-review', attachmentFields: [] },
      metadata: {
        title: 'Dataset title',
        description: 'Dataset description',
        keywords: ['one'],
        forCodes: ['0101'],
        license: 'CC-BY',
      },
      workflow: { stage: 'queued', stageLabel: 'Queued For Review' },
      authorization: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [], stored: { view: [], edit: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] } },
      dateCreated: '',
      lastSaveDate: '',
      id: ''
    };
    const httpError = Object.assign(new Error('Figshare HTTP request failed for post /account/articles'), {
      statusCode: 400,
      responseBody: {
        message: 'Invalid identifier format',
        code: 'BadRequest'
      }
    });
    sinon.stub(service, 'syncMetadata').rejects(httpError);

    try {
      await service.syncRecordWithFigshare(record, 'job-1');
      expect.fail('Expected syncRecordWithFigshare to throw');
    } catch (error) {
      expect((error as { displayErrors?: Array<{ detail?: string }> }).displayErrors?.[0]?.detail)
        .to.equal('Invalid identifier format');
    }
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
      // Wrapped Doi-style: translated RBValidationError with the original error as cause.
      expect((error as Error).message).to.equal('Figshare API error Error publishing Figshare article');
      expect(((error as Error).cause as Error)?.message).to.equal('publish failed');
    }
    expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
  });

  it('includes non-object HTTP response bodies in error summaries', function () {
    const error = Object.assign(new Error('Figshare HTTP request failed'), {
      statusCode: 401,
      responseBody: 'Unauthorized'
    });

    const summary = (service as any).summarizeError(error);

    expect(summary.statusCode).to.equal(401);
    expect(summary.responseSummary.rawResponseBody).to.equal('Unauthorized');
    expect(summary.responseSummary.message).to.equal('Figshare HTTP request failed');

    const objectBodySummary = (service as any).summarizeError(Object.assign(new Error('boom'), {
      statusCode: 422,
      responseBody: { message: 'Invalid embargo' }
    }));
    expect(objectBodySummary.responseSummary).to.deep.equal({ message: 'Invalid embargo' });
  });

  it('extracts created article id from the Figshare Location header', async function () {
    const article = mapCreateArticleResponse<{ id?: string; location?: string }>({
      data: {},
      headers: {
        location: 'https://api.figsh.com/v2/account/articles/123456'
      }
    });

    expect(article.id).to.equal('123456');
    expect(article.location).to.equal('https://api.figsh.com/v2/account/articles/123456');
  });

  it('does not throw from getConfig when the record brand cannot be resolved', function () {
    (global as any).BrandingService.getBrand = sinon.stub().returns(undefined);
    (global as any).BrandingService.getBrandById = sinon.stub().returns(undefined);

    const resolved = service.getConfig({
      metaMetadata: { brandId: 'ghost-brand' }
    } as any);

    // Unknown brands keep the graceful fallback contract: config still resolves via the
    // branding configuration defaults path instead of throwing before the enabled check.
    expect(resolved).to.not.equal(null);
    expect(appConfigByBrandStub.calledWith('ghost-brand')).to.be.true;
    expect(((global as any).sails.log.warn as sinon.SinonStub).called).to.be.true;
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
