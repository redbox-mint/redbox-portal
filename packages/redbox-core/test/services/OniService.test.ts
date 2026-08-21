let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import axios from 'axios';
import { of } from 'rxjs';
import { finished } from 'node:stream/promises';
import { Services } from '../../src/services/OniService';
import { OniPublishing } from '../../src/configmodels/OniPublishing';
import { IntegrationAuditAction, IntegrationAuditName } from '../../src/model/storage/IntegrationAuditModel';
import { buildOniRoCrate, getPerson, getSelectedAttachments } from '../../src/services/oni-v2/crate';
import { validateHandlebarsTemplate } from '../../src/services/oni-v2/bindings';
import { mapDatasetFields, mapGraphEntities, validateMappedDataset } from '../../src/services/oni-v2/mapping';
import { getBrandName, resolveOniPublishingConfig, resolveOniSite } from '../../src/services/oni-v2/config';
import { createStorageManagerOcflStoreClass } from '../../src/services/oni-v2/flydriveOcflStore';
import { runPublishDatasetProgram } from '../../src/services/oni-v2/runtime';
import * as ingestionModule from '../../src/services/oni-v2/ingestion';
import { ingestOniRepository } from '../../src/services/oni-v2/ingestion';
import type { Services as StorageManagerServices } from '../../src/services/StorageManagerService';
import { RBValidationError } from '../../src/model/RBValidationError';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('OniService', function () {
  let service: InstanceType<typeof Services.OniService>;
  let oniPublishing: OniPublishing;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    oniPublishing = new OniPublishing();
    oniPublishing.defaultSite = 'test-site';
    oniPublishing.sites = {
      'test-site': {
        enabled: true,
        label: 'Test Site',
        publicUrl: 'https://data.example.edu',
        useCleanUrl: true,
        storage: {
          driver: 'flydrive',
          diskName: 'oni-test',
          prefix: 'ocfl/test',
          rootPath: '/ocfl/test',
          workspacePath: '/ocfl-work/test',
          tempDir: '/tmp/oni-test',
        },
      },
    };
    const mockSails = createMockSails();
    mockSails.config.brandingConfigurationDefaults = { oniPublishing };
    mockSails.config.brandingAware = sinon.stub().withArgs('default').returns({ oniPublishing });
    mockSails.config.record = { datastreamService: 'datastreamservice' };
    setupServiceTestGlobals(mockSails);

    (global as unknown as { BrandingService: unknown }).BrandingService = {
      getBrandById: sinon.stub().withArgs('brand-1').returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().withArgs('default').returns({ id: 'brand-1', name: 'default' }),
    };
    (global as unknown as { UsersService: unknown }).UsersService = {
      getUserWithUsername: sinon.stub().returns(of({ email: 'creator@example.edu', text_full_name: 'Creator User' })),
    };
    (global as unknown as { RecordsService: unknown }).RecordsService = {
      updateMeta: sinon.stub().resolves({ success: true, wasPersisted: () => true, isComplete: () => true }),
    };
    (global as unknown as { IntegrationAuditService: unknown }).IntegrationAuditService = {
      startAudit: sinon.stub().returns({
        redboxOid: 'pub-1',
        brandId: 'brand-1',
        integrationName: IntegrationAuditName.oni,
        integrationAction: IntegrationAuditAction.publishOniDataset,
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: new Date().toISOString(),
      }),
      completeAudit: sinon.stub(),
      failAudit: sinon.stub(),
    };

    service = new Services.OniService();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as unknown as { AppConfigService?: unknown }).AppConfigService;
    delete (global as unknown as { BrandingService?: unknown }).BrandingService;
    delete (global as unknown as { UsersService?: unknown }).UsersService;
    delete (global as unknown as { RecordsService?: unknown }).RecordsService;
    delete (global as unknown as { IntegrationAuditService?: unknown }).IntegrationAuditService;
    sinon.restore();
  });

  function publicationRecord(): any {
    return {
      metadata: {
        title: 'Dataset Title',
        description: 'Dataset Description',
        finalKeywords: ['keyword'],
        citation_doi: 'https://doi.org/10.1234/{ID_WILL_BE_HERE}',
        dataRecord: { oid: 'data-1' },
        creators: [
          {
            orcid: 'https://orcid.org/0000-0001-2345-6789',
            email: 'creator@example.edu',
            text_full_name: 'Creator User',
          },
        ],
        contributor_data_manager: {
          email: 'manager@example.edu',
          text_full_name: 'Data Manager',
        },
        license_identifier: 'https://creativecommons.org/licenses/by/4.0/',
        dataLocations: [
          { type: 'attachment', selected: true, fileId: 'file-1', name: 'data.csv' },
          { type: 'attachment', selected: false, fileId: 'file-2', name: 'skip.csv' },
        ],
        related_publications: [
          {
            related_title: 'Related Publication',
            related_url: 'https://doi.org/10.1234/related-publication',
            related_notes: 'Publication note',
          },
        ],
        related_data: [
          {
            related_title: 'Related Dataset',
            related_url: 'https://doi.org/10.1234/related-dataset',
            related_notes: '',
          },
          { related_title: '', related_url: '', related_notes: '' },
        ],
        'dc:subject_anzsrc:for': [{ notation: '0601', name: 'Biochemistry' }, {}],
        'dc:subject_anzsrc:seo': [{ notation: '9608', name: 'Flora, Fauna and Biodiversity' }, {}],
        'foaf:fundedBy_foaf:Agent': [{ dc_identifier: ['03yrm5c26'], dc_title: 'Example Funder' }, {}],
        'foaf:fundedBy_vivo:Grant': [{ dc_identifier: ['grant-1'], dc_title: 'Example Grant' }, {}],
      },
      metaMetadata: {
        brandId: 'brand-1',
        createdBy: 'creator',
        createdOn: '2024-05-01T00:00:00.000Z',
      },
    };
  }

  it('exports the canonical trigger method', function () {
    const exported = service.exports();
    expect(exported).to.have.property('exportDataset');
  });

  it('resolves Oni publishing config from branding-aware app-config', function () {
    const config = resolveOniPublishingConfig(publicationRecord());
    expect(config).to.not.equal(null);
    expect(config?.defaultSite).to.equal('test-site');
    expect(config?.sites['test-site'].storage.driver).to.equal('flydrive');
  });

  it('defaults Oni ingestion to non-forced index rebuilds', function () {
    const defaults = new OniPublishing();
    expect(defaults.sites.staging.ingestion?.forceReindex).to.equal(false);
    expect(defaults.sites.public.ingestion?.forceReindex).to.equal(false);
  });

  it('ignores synthesized non-default oniPublishing config when merging default-brand overrides', function () {
    const defaultOniPublishing = { ...oniPublishing, enabled: false };
    const generatedBrandConfig = { oniPublishing: new OniPublishing() };
    Object.defineProperty(generatedBrandConfig, Symbol.for('redbox.appConfig.presentKeys'), {
      value: new Set<string>(),
      enumerable: false,
    });

    (global as unknown as { BrandingService: unknown }).BrandingService = {
      getBrandById: sinon.stub().withArgs('brand-2').returns({ id: 'brand-2', name: 'faculty' }),
      getBrand: sinon.stub().callsFake((name: string) => ({ id: name === 'faculty' ? 'brand-2' : 'brand-1', name })),
    };
    (global as unknown as { AppConfigService: unknown }).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().callsFake((name: string) => {
        if (name === 'default') {
          return { oniPublishing: defaultOniPublishing };
        }
        if (name === 'faculty') {
          return generatedBrandConfig;
        }
        return undefined;
      }),
    };

    const record = publicationRecord();
    record.metaMetadata.brandId = 'brand-2';

    expect(resolveOniPublishingConfig(record)).to.equal(null);
  });

  it('throws when oniPublishing app-config is missing', function () {
    (sails.config.brandingAware as sinon.SinonStub).withArgs('default').returns({});
    sails.config.brandingConfigurationDefaults = {} as typeof sails.config.brandingConfigurationDefaults;
    expect(() => resolveOniPublishingConfig(publicationRecord())).to.throw('oniPublishing app-config is missing');
  });

  it('resolves and validates the configured publishing site', function () {
    const config = resolveOniPublishingConfig(publicationRecord());
    const resolved = resolveOniSite(config!, { site: 'test-site' });
    expect(resolved.siteName).to.equal('test-site');
    expect(resolved.site.publicUrl).to.equal('https://data.example.edu');
  });

  it('rejects missing, unknown, and disabled Oni publishing sites', function () {
    const config = resolveOniPublishingConfig(publicationRecord())!;

    expect(() => resolveOniSite({ ...config, defaultSite: '' }))
      .to.throw('options.site and oniPublishing.defaultSite are both empty');
    expect(() => resolveOniSite(config, { site: 'missing-site' }))
      .to.throw("Unknown Oni publishing site 'missing-site'");
    expect(() => resolveOniSite({
      ...config,
      sites: {
        ...config.sites,
        disabled: { ...config.sites['test-site'], enabled: false },
      },
    }, { site: 'disabled' }))
      .to.throw("Oni publishing site 'disabled' is disabled");
  });

  it('builds RO-Crate JSON-LD and selected attachment plan from oniPublishing', async function () {
    const record = publicationRecord();
    const result = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-1',
      record,
      creator: { email: 'creator@example.edu', text_full_name: 'Creator User' },
      approver: { email: 'approver@example.edu', text_full_name: 'Approver User' },
    });

    expect(result.datasetUrl).to.equal('https://data.example.edu/pub-1');
    expect(oniPublishing.metadata.jsonldFilename).to.equal('ro-crate-metadata.json');
    expect(record.metadata.citation_url).to.equal(undefined);
    expect(record.metadata.citation_doi).to.equal('https://doi.org/10.1234/{ID_WILL_BE_HERE}');
    expect(result.attachments).to.have.lengthOf(1);
    expect(result.attachments[0].logicalPath).to.equal('files/file-1/data.csv');
    expect(result.crateJson['@graph']).to.be.an('array');
    expect(JSON.stringify(result.crateJson)).to.include('Dataset Title');
    expect(JSON.stringify(result.crateJson)).to.include('Example Funder');
    const graph = result.crateJson['@graph'] as Array<Record<string, unknown>>;
    const graphIds = graph.map(entry => entry['@id']);
    const root = graph.find(entry => entry['@id'] === result.rootId)!;
    const expectedLicense = {
      '@id': 'https://creativecommons.org/licenses/by/4.0/',
      '@type': 'CreativeWork',
      name: 'https://creativecommons.org/licenses/by/4.0/',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    };
    const descriptor = graph.find(entry => entry['@id'] === 'ro-crate-metadata.json')!;
    const historyCreate = graph.find(entry => entry['@id'] === 'history1')!;
    const creatorPeople = graph.filter(entry => entry.email === 'creator@example.edu');
    expect(descriptor.about).to.deep.equal({ '@id': result.rootId });
    expect(historyCreate.agent).to.deep.equal({ '@id': 'https://orcid.org/0000-0001-2345-6789' });
    expect(creatorPeople).to.have.lengthOf(1);
    expect(root.funder).to.deep.equal([{ '@id': '_:funder/03yrm5c26' }, { '@id': '_:funder/grant-1' }]);
    expect(root.conformsTo).to.deep.equal({ '@id': 'https://w3id.org/ldac/profile#Object' });
    expect(root.license).to.deep.equal([expectedLicense]);
    expect(graph.find(entry => entry['@id'] === expectedLicense['@id'])).to.deep.include(expectedLicense);
    expect(root.about).to.deep.equal([{ '@id': '_:FOR/0601' }, { '@id': '_:SEO/9608' }]);
    expect(root.publications).to.deep.equal([{ '@id': 'https://doi.org/10.1234/related-publication' }]);
    expect(root.data).to.deep.equal([{ '@id': 'https://doi.org/10.1234/related-dataset' }]);
    expect(root.contributor).to.deep.equal([{ '@id': 'manager@example.edu' }]);
    const dataManager = graph.find(entry => entry['@id'] === 'manager@example.edu')!;
    const contactPoint = graph.find(entry => entry['@id'] === 'mailto:manager@example.edu')!;
    expect(dataManager.contactPoint).to.deep.equal({ '@id': 'mailto:manager@example.edu' });
    expect(contactPoint).to.deep.include({
      '@type': 'ContactPoint',
      contactType: 'Data Manager',
      identifier: 'manager@example.edu',
      email: 'manager@example.edu',
    });
    expect(graph.some(entry => entry['@id'] === '_:FOR/0601' && entry.url === '_:FOR/0601')).to.equal(true);
    expect(graph.some(entry => entry['@id'] === '_:SEO/9608' && entry.url === '_:SEO/9608')).to.equal(true);
    expect(graph.some(entry => entry['@id'] === 'https://doi.org/10.1234/related-publication')).to.equal(true);
    expect(graphIds).to.not.include('_:funder/');
    expect(graphIds).to.not.include('_:FOR/');
    expect(graphIds).to.not.include('_:SEO/');
  });

  it('attaches contributor contact points to graph entities instead of dataset references', async function () {
    const record = publicationRecord();
    record.metadata.contributor_data_manager = record.metadata.creators[0];
    const result = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-1',
      record,
      creator: { email: 'creator@example.edu', text_full_name: 'Creator User' },
      approver: { email: 'approver@example.edu', text_full_name: 'Approver User' },
    });
    const graph = result.crateJson['@graph'] as Array<Record<string, unknown>>;
    const root = graph.find(entry => entry['@id'] === result.rootId)!;
    const authorEntity = graph.find(entry => entry['@id'] === 'https://orcid.org/0000-0001-2345-6789')!;

    expect(root.author).to.deep.equal([{ '@id': 'https://orcid.org/0000-0001-2345-6789' }]);
    expect((root.author as Array<Record<string, unknown>>)[0].contactPoint).to.equal(undefined);
    expect(authorEntity.contactPoint).to.deep.equal({ '@id': 'mailto:creator@example.edu' });
    expect(
      graph.some(entry => entry['@id'] === 'mailto:creator@example.edu' && entry['@type'] === 'ContactPoint')
    ).to.equal(true);
  });

  it('honours mapping context overrides for configured IRI prefixes', async function () {
    oniPublishing.mapping.context = { funderIriPrefix: 'https://funders.example/' };
    const result = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-1',
      record: publicationRecord(),
      creator: { email: 'creator@example.edu', text_full_name: 'Creator User' },
      approver: { email: 'approver@example.edu', text_full_name: 'Approver User' },
    });
    const graph = result.crateJson['@graph'] as Array<Record<string, unknown>>;
    const root = graph.find(entry => entry['@id'] === result.rootId)!;

    expect(root.funder).to.deep.equal([
      { '@id': 'https://funders.example/03yrm5c26' },
      { '@id': 'https://funders.example/grant-1' },
    ]);
    expect(graph.some(entry => entry['@id'] === 'https://funders.example/03yrm5c26')).to.equal(true);
  });

  it('maps path, handlebars and jsonata root dataset fields', async function () {
    const mapped = await mapDatasetFields(
      [
        { property: 'name', value: { kind: 'path', path: 'metadata.title' } },
        { property: 'identifier', value: { kind: 'handlebars', template: '{{oid}}:{{metadata.title}}' } },
        { property: 'keywords', value: { kind: 'jsonata', expression: 'metadata.finalKeywords' } },
      ],
      { oid: 'pub-1', metadata: publicationRecord().metadata }
    );

    expect(mapped).to.deep.equal({
      name: 'Dataset Title',
      identifier: 'pub-1:Dataset Title',
      keywords: ['keyword'],
    });
  });

  it('rejects unsupported handlebars helpers in Oni bindings', function () {
    expect(() => validateHandlebarsTemplate('{{#each metadata.creators}}{{text_full_name}}{{/each}}')).to.throw(
      "Unsupported Handlebars block helper 'each' in Oni binding"
    );
  });

  it('preserves RBValidationError identity from Oni Effect runtime failures', async function () {
    const record = publicationRecord();
    delete record.metadata.dataRecord;
    const repository = {
      ensureStorageRoot: sinon.stub().resolves(),
      ensureRootCollection: sinon.stub().resolves(),
      writeDatasetObject: sinon.stub().resolves(),
    };

    try {
      await runPublishDatasetProgram(
        {
          oid: 'pub-1',
          record,
          options: { site: 'test-site' },
          user: { email: 'approver@example.edu' },
          creator: { email: 'creator@example.edu' },
        },
        oniPublishing,
        {
          recordOid: 'pub-1',
          brandId: 'brand-1',
          brandName: 'default',
          siteName: 'test-site',
          correlationId: 'corr-1',
          triggerSource: 'test',
        },
        repository
      );
      expect.fail('Expected runPublishDatasetProgram to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(RBValidationError);
      expect((error as RBValidationError).displayErrors[0].code).to.equal('oni-data-record-oid-missing');
    }
  });

  it('iterates graph entity source arrays and keeps system root fields protected', async function () {
    oniPublishing.mapping.rootDataset.push(
      { property: '@id', value: { kind: 'path', path: 'metadata.title' } },
      { property: 'hasPart', value: { kind: 'path', path: 'metadata.title' }, arrayMode: 'wrap' }
    );
    const result = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-1',
      record: publicationRecord(),
      creator: { email: 'creator@example.edu', text_full_name: 'Creator User' },
      approver: { email: 'approver@example.edu', text_full_name: 'Approver User' },
    });
    const graph = result.crateJson['@graph'] as Array<Record<string, unknown>>;
    const root = graph.find(entry => entry['@id'] === result.rootId)!;

    expect(root['@id']).to.equal('arcp://name,uts_public_data_repo/pub-1');
    expect(root.hasPart).to.deep.equal([{ '@id': 'files/file-1/data.csv' }]);
    expect(graph.some(entry => entry['@id'] === 'https://orcid.org/0000-0001-2345-6789')).to.equal(true);
    expect(root.author).to.deep.equal([{ '@id': 'https://orcid.org/0000-0001-2345-6789' }]);
  });

  it('wraps a single graph entity object when itemMode is array', async function () {
    const rootDataset: Record<string, unknown> = {};
    const entities = await mapGraphEntities(
      [
        {
          sourcePath: 'metadata.creators',
          itemMode: 'array',
          id: { kind: 'path', path: 'item.email' },
          type: { kind: 'path', path: 'context.personType' },
          fields: [{ property: 'name', value: { kind: 'path', path: 'item.text_full_name' } }],
          linkToDataset: { property: 'author' },
        },
      ],
      {
        metadata: {
          creators: {
            email: 'single@example.edu',
            text_full_name: 'Single Creator',
          },
        },
        context: { personType: 'Person' },
      },
      rootDataset
    );

    expect(entities).to.deep.equal([{ '@id': 'single@example.edu', '@type': 'Person', name: 'Single Creator' }]);
    expect(rootDataset.author).to.deep.equal([{ '@id': 'single@example.edu' }]);
  });

  it('maps an array source as one graph entity when itemMode is single', async function () {
    const rootDataset: Record<string, unknown> = {};
    const entities = await mapGraphEntities(
      [
        {
          sourcePath: 'metadata.creators',
          itemMode: 'single',
          id: { kind: 'handlebars', template: 'creator-list' },
          type: { kind: 'path', path: 'context.structuredValueType' },
          fields: [{ property: 'value', value: { kind: 'path', path: 'item' } }],
          linkToDataset: { property: 'creatorSummary', mode: 'set' },
        },
      ],
      {
        metadata: {
          creators: [
            { email: 'first@example.edu', text_full_name: 'First Creator' },
            { email: 'second@example.edu', text_full_name: 'Second Creator' },
          ],
        },
        context: { structuredValueType: 'StructuredValue' },
      },
      rootDataset
    );

    expect(entities).to.deep.equal([
      {
        '@id': 'creator-list',
        '@type': 'StructuredValue',
        value: [
          { email: 'first@example.edu', text_full_name: 'First Creator' },
          { email: 'second@example.edu', text_full_name: 'Second Creator' },
        ],
      },
    ]);
    expect(rootDataset.creatorSummary).to.deep.equal({ '@id': 'creator-list' });
  });

  it('falls back past empty person identifiers', function () {
    expect(
      getPerson({ orcid: '', email: 'fallback@example.edu', text_full_name: 'Fallback Person' }, 'Person')
    ).to.deep.include({
      '@id': 'fallback@example.edu',
      '@type': 'Person',
      name: 'Fallback Person',
      email: 'fallback@example.edu',
    });
  });

  it('omits empty mapped values by default and supports array modes explicitly', async function () {
    const mapped = await mapDatasetFields(
      [
        { property: 'missing', value: { kind: 'path', path: 'metadata.missing' } },
        { property: 'wrapped', value: { kind: 'path', path: 'metadata.title' }, arrayMode: 'wrap' },
        { property: 'first', value: { kind: 'path', path: 'metadata.finalKeywords' }, arrayMode: 'first' },
        { property: 'preserved', value: { kind: 'path', path: 'metadata.finalKeywords' }, arrayMode: 'preserve' },
      ],
      { metadata: publicationRecord().metadata }
    );

    expect(mapped).to.deep.equal({
      wrapped: ['Dataset Title'],
      first: 'keyword',
      preserved: ['keyword'],
    });
  });

  it('fails validation when configured required mapped root fields are absent', function () {
    expect(() => validateMappedDataset({ name: 'Dataset Title' }, { requiredRootFields: ['description'] })).to.throw(
      RBValidationError
    );
  });

  it('does not include attachments for metadata-only records', function () {
    const record = publicationRecord();
    record.metadata.accessRightsToggle = true;
    expect(getSelectedAttachments(record, oniPublishing)).to.deep.equal([]);
  });

  it('omits empty GeoJSON coverage and emits linked entities for real geometry', async function () {
    const emptyRecord = publicationRecord();
    emptyRecord.metadata.geospatial = { type: 'FeatureCollection', features: [] };
    const emptyResult = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-empty-geo',
      record: emptyRecord,
      creator: { email: 'creator@example.edu' },
      approver: { email: 'approver@example.edu' },
    });
    const emptyGraph = emptyResult.crateJson['@graph'] as Array<Record<string, unknown>>;
    const emptyRoot = emptyGraph.find(entry => entry['@id'] === emptyResult.rootId)!;
    expect(emptyRoot).not.to.have.property('spatialCoverage');

    const pointRecord = publicationRecord();
    pointRecord.metadata.geospatial = { type: 'Point', coordinates: [138.6, -34.9] };
    const pointResult = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-point-geo',
      record: pointRecord,
      creator: { email: 'creator@example.edu' },
      approver: { email: 'approver@example.edu' },
    });
    const pointGraph = pointResult.crateJson['@graph'] as Array<Record<string, unknown>>;
    const pointRoot = pointGraph.find(entry => entry['@id'] === pointResult.rootId)!;
    expect(pointRoot.spatialCoverage).to.deep.equal([{ '@id': '_:place-0' }]);
    expect(pointGraph.find(entry => entry['@id'] === '_:place-0')).to.deep.include({
      '@type': 'Place',
      geo: { '@id': '_:geo-0' },
    });
    const geometry = pointGraph.find(entry => entry['@id'] === '_:geo-0')!;
    expect(geometry['@type']).to.equal('Geometry');
    expect(String(geometry.asWKT)).to.include('POINT');
    expect(String(geometry.asWKT)).to.include('138.6 -34.9');

    const mixedRecord = publicationRecord();
    mixedRecord.metadata.geospatial = [
      null,
      { type: 'FeatureCollection', features: [] },
      { type: 'GeometryCollection', geometries: [] },
      { type: 'Point', coordinates: [138.6, -34.9] },
    ];
    const mixedResult = await buildOniRoCrate({
      config: oniPublishing,
      site: oniPublishing.sites['test-site'],
      siteName: 'test-site',
      oid: 'pub-mixed-geo',
      record: mixedRecord,
      creator: { email: 'creator@example.edu' },
      approver: { email: 'approver@example.edu' },
    });
    const mixedGraph = mixedResult.crateJson['@graph'] as Array<Record<string, unknown>>;
    expect(mixedGraph.filter(entry => entry['@type'] === 'Place')).to.have.lengthOf(1);
  });

  it('accepts legacy truthy selected attachment flags', function () {
    const record = publicationRecord();
    record.metadata.dataLocations = [
      { type: 'attachment', selected: 'on', fileId: 'file-1', name: 'data.csv' },
      { type: 'attachment', selected: '1', fileId: 'file-2', name: 'other.csv' },
      { type: 'attachment', selected: 'no', fileId: 'file-3', name: 'skip.csv' },
    ];

    expect(getSelectedAttachments(record, oniPublishing).map(attachment => attachment.fileId)).to.deep.equal([
      'file-1',
      'file-2',
    ]);
  });

  it('resolves brand ids to brand names for Oni config lookup', function () {
    (global as unknown as { BrandingService: unknown }).BrandingService = {
      getBrandById: sinon.stub().returns(undefined),
      getBrand: sinon.stub().withArgs('brand-2').returns({ id: 'brand-2', name: 'configured-brand' }),
    };

    expect(getBrandName({ metadata: {}, metaMetadata: { brandId: 'brand-2' } })).to.equal('configured-brand');
  });

  it('skips publishing when trigger condition is not met', async function () {
    const serviceInternals = service as unknown as Record<string, (...args: unknown[]) => unknown>;
    const runStub = sinon.stub(serviceInternals, 'runPublishDataset');
    const result = await service.exportDataset(
      'pub-1',
      publicationRecord(),
      { site: 'test-site' },
      { email: 'approver@example.edu' }
    );
    expect(result.metadata.title).to.equal('Dataset Title');
    expect(runStub.called).to.equal(false);
  });

  it('runs publish workflow, audits it, and persists with the record brand', async function () {
    (global as unknown as { RecordsService: { updateMeta: sinon.SinonStub } }).RecordsService.updateMeta.resolves({
      outcome: 'saved-with-warnings',
      wasPersisted: () => true,
      isComplete: () => false,
    });
    const record = publicationRecord();
    record.metadata.publication_error = 'Data publication failed with error: Error previous failure';
    const repository = {
      ensureStorageRoot: sinon.stub().resolves(),
      ensureRootCollection: sinon.stub().resolves(),
      writeDatasetObject: sinon.stub().resolves(),
    };
    const serviceInternals = service as unknown as Record<string, (...args: unknown[]) => unknown>;
    sinon.stub(serviceInternals, 'createRepository').returns(repository);
    sinon.stub(serviceInternals, 'runPublishDataset').resolves({
      datasetUrl: 'https://data.example.edu/pub-1',
      rootId: 'arcp://name,test/pub-1',
      rootCollectionId: oniPublishing.rootCollection.rootCollectionId,
      dataRecordOid: 'data-1',
      attachments: [],
      crateJson: {},
      siteName: 'test-site',
      storageDriver: 'flydrive',
    });
    const ingestStub = sinon.stub(serviceInternals, 'ingestDataset').resolves({
      structuralObjects: 2,
      searchItems: 1,
    });

    await service.exportDataset(
      'pub-1',
      record,
      { site: 'test-site', forceRun: true },
      { email: 'approver@example.edu' }
    );

    expect(
      (
        global as unknown as { IntegrationAuditService: { startAudit: sinon.SinonStub } }
      ).IntegrationAuditService.startAudit.calledWith(
        'pub-1',
        IntegrationAuditAction.publishOniDataset,
        sinon.match({ integrationName: IntegrationAuditName.oni })
      )
    ).to.equal(true);
    const updateMeta = (global as unknown as { RecordsService: { updateMeta: sinon.SinonStub } }).RecordsService
      .updateMeta;
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[0]).to.deep.equal({ id: 'brand-1', name: 'default' });
    expect(updateMeta.firstCall.args[2].metadata.citation_url).to.equal('https://data.example.edu/pub-1');
    expect(updateMeta.firstCall.args[2].metadata.publication_error).to.equal(undefined);
    expect(updateMeta.firstCall.args[4]).to.equal(true);
    expect(updateMeta.firstCall.args[5]).to.equal(false);
    expect(ingestStub.calledOnce).to.equal(true);
    const completeAudit = (global as unknown as { IntegrationAuditService: { completeAudit: sinon.SinonStub } })
      .IntegrationAuditService.completeAudit;
    expect(completeAudit.firstCall.args[1].responseSummary).to.include({
      structuralObjects: 2,
      searchItems: 1,
    });
  });

  it('omits ingestion counts from the publish audit when ingestion is disabled', async function () {
    const serviceInternals = service as unknown as Record<string, (...args: unknown[]) => unknown>;
    sinon.stub(serviceInternals, 'createRepository').returns({});
    sinon.stub(serviceInternals, 'runPublishDataset').resolves({
      datasetUrl: 'https://data.example.edu/pub-1',
      rootId: 'arcp://name,test/pub-1',
      rootCollectionId: oniPublishing.rootCollection.rootCollectionId,
      dataRecordOid: 'data-1',
      attachments: [],
      crateJson: {},
      siteName: 'test-site',
      storageDriver: 'flydrive',
    });
    sinon.stub(serviceInternals, 'ingestDataset').resolves(undefined);

    await service.exportDataset(
      'pub-1',
      publicationRecord(),
      { site: 'test-site', forceRun: true },
      { email: 'approver@example.edu' }
    );

    const completeAudit = (global as unknown as { IntegrationAuditService: { completeAudit: sinon.SinonStub } })
      .IntegrationAuditService.completeAudit;
    expect(completeAudit.firstCall.args[1].responseSummary).not.to.have.property('structuralObjects');
    expect(completeAudit.firstCall.args[1].responseSummary).not.to.have.property('searchItems');
  });

  it('retains citation write-back and records the completed OCFL write when ingestion fails', async function () {
    const record = publicationRecord();
    const serviceInternals = service as unknown as Record<string, (...args: unknown[]) => unknown>;
    sinon.stub(serviceInternals, 'createRepository').returns({});
    sinon.stub(serviceInternals, 'runPublishDataset').resolves({
      datasetUrl: 'https://data.example.edu/pub-1',
      rootId: 'arcp://name,test/pub-1',
      rootCollectionId: oniPublishing.rootCollection.rootCollectionId,
      dataRecordOid: 'data-1',
      attachments: [],
      crateJson: {},
      siteName: 'test-site',
      storageDriver: 'flydrive',
    });
    sinon.stub(serviceInternals, 'ingestDataset').rejects(new Error('Oni indexing failed'));

    try {
      await service.exportDataset(
        'pub-1',
        record,
        { site: 'test-site', forceRun: true },
        { email: 'approver@example.edu' }
      );
      expect.fail('Expected ingestion failure to be rethrown');
    } catch (error) {
      expect(error).to.be.instanceOf(RBValidationError);
      expect((error as RBValidationError).displayErrors[0].detail).to.equal(
        'Oni OCFL publication completed but repository ingestion failed'
      );
    }

    const updateMeta = (global as unknown as { RecordsService: { updateMeta: sinon.SinonStub } }).RecordsService
      .updateMeta;
    expect(updateMeta.firstCall.args[2].metadata.citation_url).to.equal('https://data.example.edu/pub-1');
    expect(updateMeta.firstCall.args[2].metadata.citation_doi).to.equal(
      'https://doi.org/10.1234/https://data.example.edu/pub-1'
    );
    expect(updateMeta.firstCall.args[2].metadata.publication_error).to.include('Oni indexing failed');

    const failAudit = (global as unknown as { IntegrationAuditService: { failAudit: sinon.SinonStub } })
      .IntegrationAuditService.failAudit;
    expect(failAudit.firstCall.args[2]).to.deep.include({
      message: 'Oni OCFL write completed, but repository ingestion failed.',
      responseSummary: {
        errorType: 'Error',
        message: 'Oni indexing failed',
        ocflWriteCompleted: true,
        storageDriver: 'flydrive',
        rootId: 'arcp://name,test/pub-1',
        datasetUrl: 'https://data.example.edu/pub-1',
      },
    });
  });

  it('skips disabled Oni ingestion without creating an audit', async function () {
    const result = await (
      service as unknown as {
        ingestDataset: (...args: unknown[]) => Promise<unknown>;
      }
    ).ingestDataset('pub-1', oniPublishing.sites['test-site'], { siteName: 'test-site' }, null);

    expect(result).to.equal(undefined);
    expect(
      (global as unknown as { IntegrationAuditService: { startAudit: sinon.SinonStub } }).IntegrationAuditService
        .startAudit.called
    ).to.equal(false);
  });

  it('audits successful and failed Oni ingestion runs', async function () {
    const site = oniPublishing.sites['test-site'];
    site.ingestion = {
      enabled: true,
      apiUrl: 'https://oni.example.test',
      adminToken: 'secret-token',
      forceReindex: true,
      pollIntervalMs: 10,
      timeoutMs: 100,
    };
    const runContext = {
      recordOid: 'pub-1',
      brandId: 'brand-1',
      brandName: 'default',
      siteName: 'test-site',
      correlationId: 'job-1',
      triggerSource: 'test',
    };
    const ingestStub = sinon.stub(ingestionModule, 'ingestOniRepository').resolves({
      structuralObjects: 3,
      searchItems: 4,
    });
    const internals = service as unknown as {
      ingestDataset: (...args: unknown[]) => Promise<unknown>;
    };

    const result = await internals.ingestDataset('pub-1', site, runContext, null);
    expect(result).to.deep.equal({ structuralObjects: 3, searchItems: 4 });
    expect(ingestStub.calledOnceWithExactly(site.ingestion)).to.equal(true);

    const auditService = (
      global as unknown as {
        IntegrationAuditService: {
          startAudit: sinon.SinonStub;
          completeAudit: sinon.SinonStub;
          failAudit: sinon.SinonStub;
        };
      }
    ).IntegrationAuditService;
    expect(auditService.startAudit.firstCall.args[1]).to.equal(IntegrationAuditAction.ingestOniDataset);
    expect(auditService.completeAudit.firstCall.args[1].responseSummary).to.include({
      structuralObjects: 3,
      searchItems: 4,
    });

    ingestStub.rejects(new Error('Oni indexing failed'));
    try {
      await internals.ingestDataset('pub-1', site, runContext, null);
      expect.fail('Expected ingestion to throw');
    } catch (error) {
      expect(error).to.be.an('error').with.property('message', 'Oni indexing failed');
    }
    expect(auditService.failAudit.calledOnce).to.equal(true);
    expect(auditService.failAudit.firstCall.args[2].responseSummary).to.deep.include({
      errorType: 'Error',
      message: 'Oni indexing failed',
    });
  });

  it('rebuilds Oni structural and search indexes and waits for completion', async function () {
    let now = 0;
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub(),
    };
    client.get.onCall(0).resolves({ data: { isDeleting: true, count: 0 }, status: 200 });
    client.get.onCall(1).resolves({ data: { isIndexed: true, count: 2 }, status: 200 });
    client.get.onCall(2).resolves({ data: { isIndexing: true, count: 0 }, status: 200 });
    client.get.onCall(3).resolves({ data: { isIndexed: true, count: 1 }, status: 200 });

    const result = await ingestOniRepository(
      {
        enabled: true,
        apiUrl: 'http://oni-api:8080/',
        adminToken: 'secret-token',
        forceReindex: true,
        pollIntervalMs: 10,
        timeoutMs: 1_000,
      },
      {
        httpClient: client,
        delay: async milliseconds => {
          now += milliseconds;
        },
        now: () => now,
      }
    );

    expect(result).to.deep.equal({ structuralObjects: 2, searchItems: 1 });
    expect(client.post.firstCall.args[0]).to.equal('http://oni-api:8080/admin/index/structural?force=true');
    expect(client.post.secondCall.args[0]).to.equal('http://oni-api:8080/admin/index/search?force=true');
    expect(client.post.firstCall.args[2].headers.Authorization).to.equal('Bearer secret-token');
  });

  it('omits force query parameters when Oni forceReindex is false', async function () {
    let now = 0;
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub(),
    };
    client.get.onCall(0).resolves({ data: { isIndexed: true, count: 2 }, status: 200 });
    client.get.onCall(1).resolves({ data: { isIndexed: true, count: 1 }, status: 200 });

    const result = await ingestOniRepository(
      {
        enabled: true,
        apiUrl: 'http://oni-api:8080/',
        adminToken: 'secret-token',
        forceReindex: false,
        pollIntervalMs: 10,
        timeoutMs: 1_000,
      },
      {
        httpClient: client,
        delay: async milliseconds => {
          now += milliseconds;
        },
        now: () => now,
      }
    );

    expect(result).to.deep.equal({ structuralObjects: 2, searchItems: 1 });
    expect(client.post.firstCall.args[0]).to.equal('http://oni-api:8080/admin/index/structural');
    expect(client.post.secondCall.args[0]).to.equal('http://oni-api:8080/admin/index/search');
  });

  it('continues polling when an Oni index status is initially unavailable', async function () {
    let now = 0;
    const notFoundError = Object.assign(new Error('Index status not found'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    expect(axios.isAxiosError(notFoundError)).to.equal(true);
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub(),
    };
    client.get.onCall(0).rejects(notFoundError);
    client.get.onCall(1).resolves({ data: { isIndexed: true, count: 2 }, status: 200 });
    client.get.onCall(2).resolves({ data: { isIndexed: true, count: 1 }, status: 200 });

    const result = await ingestOniRepository(
      {
        enabled: true,
        apiUrl: 'http://oni-api:8080/',
        adminToken: 'secret-token',
        forceReindex: false,
        pollIntervalMs: 10,
        timeoutMs: 1_000,
      },
      {
        httpClient: client,
        delay: async milliseconds => {
          now += milliseconds;
        },
        now: () => now,
      }
    );

    expect(result).to.deep.equal({ structuralObjects: 2, searchItems: 1 });
    expect(client.get.callCount).to.equal(3);
  });

  it('shares one timeout deadline across Oni structural and search indexing', async function () {
    let now = 0;
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub().resolves({ data: { isIndexed: true, count: 2 }, status: 200 }),
    };

    try {
      await ingestOniRepository(
        {
          enabled: true,
          apiUrl: 'http://oni-api:8080/',
          adminToken: 'secret-token',
          forceReindex: false,
          pollIntervalMs: 10,
          timeoutMs: 20,
        },
        {
          httpClient: client,
          delay: async milliseconds => {
            now += milliseconds;
          },
          now: () => now,
        }
      );
      expect.fail('Expected the shared ingestion deadline to expire');
    } catch (error) {
      expect(error).to.have.property('message', 'Timed out waiting for Oni search index to complete after 20ms');
    }

    expect(client.get.calledOnce).to.equal(true);
    expect(client.post.secondCall.args[2].timeout).to.equal(10);
  });

  it('audits and writes publication errors when the requested Oni site is unknown', async function () {
    const record = publicationRecord();

    try {
      await service.exportDataset(
        'pub-1',
        record,
        { site: 'missing-site', forceRun: true },
        { email: 'approver@example.edu' }
      );
      expect.fail('Expected exportDataset to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(RBValidationError);
      expect((error as RBValidationError).displayErrors[0].code).to.equal('oni-site-unknown');
    }

    const auditService = (
      global as unknown as { IntegrationAuditService: { startAudit: sinon.SinonStub; failAudit: sinon.SinonStub } }
    ).IntegrationAuditService;
    const updateMeta = (global as unknown as { RecordsService: { updateMeta: sinon.SinonStub } }).RecordsService
      .updateMeta;
    expect(auditService.startAudit.calledOnce).to.equal(true);
    expect(auditService.failAudit.calledOnce).to.equal(true);
    expect(auditService.failAudit.firstCall.args[2].responseSummary.displayErrors[0].code).to.equal('oni-site-unknown');
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[2].metadata.publication_error).to.contain(
      "Unknown Oni publishing site 'missing-site'"
    );
  });

  it('maps OCFL paths onto Flydrive disk keys', function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const store = new Store({
      disk: {} as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    expect(store.keyFor('/ocfl')).to.equal('ocfl/test');
    expect(store.keyFor('/ocfl-work')).to.equal('ocfl/test/__workspace__');
    expect(store.keyFor('/ocfl/object/v1/content/file.txt')).to.equal('ocfl/test/object/v1/content/file.txt');
  });

  it('escapes equals characters in Flydrive keys unless raw key encoding is configured', function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const flydriveStore = new Store({
      disk: {} as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });
    const rawStore = new Store({
      disk: {} as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
      keyEncoding: 'raw',
    });

    expect(flydriveStore.keyFor('/ocfl/object/v1/inventory.json.sha512=')).to.equal(
      'ocfl/test/object/v1/inventory.json.sha512%3D'
    );
    expect(flydriveStore.keyFor('/ocfl/object/v1/inventory.json.sha512%3D')).to.equal(
      'ocfl/test/object/v1/inventory.json.sha512%253D'
    );
    expect(rawStore.keyFor('/ocfl/object/v1/inventory.json.sha512=')).to.equal(
      'ocfl/test/object/v1/inventory.json.sha512='
    );
  });

  it('decodes Flydrive keys when listing OCFL paths', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const disk = {
      listAll: sinon.stub().resolves({
        objects: [
          { key: 'ocfl/test/object/v1/inventory.json.sha512%3D', contentLength: 10 },
          { key: 'ocfl/test/object/v1/inventory.json.sha512%253D', contentLength: 20 },
        ],
      }),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    expect(await store.readdir('/ocfl/object/v1')).to.deep.equal([
      'inventory.json.sha512=',
      'inventory.json.sha512%3D',
    ]);
    const entries = [];
    for await (const entry of await store.list('/ocfl/object/v1')) {
      entries.push(entry.path);
    }
    expect(entries).to.deep.equal(['inventory.json.sha512=', 'inventory.json.sha512%3D']);
  });

  it('maps Flydrive missing-file read errors to ENOENT', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const missingError = new Error('Object was not found') as NodeJS.ErrnoException;
    missingError.code = 'E_OBJECT_NOT_FOUND';
    const store = new Store({
      disk: {
        getBytes: sinon.stub().rejects(missingError),
      } as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    try {
      await store.readFile('/ocfl/missing.txt');
      throw new Error('Expected readFile to throw');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).to.equal('ENOENT');
    }
  });

  it('handles primitive and null Flydrive read errors without replacing them with TypeError', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const primitiveStore = new Store({
      disk: {
        getBytes: sinon.stub().callsFake(() => Promise.reject('Object was not found')),
      } as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });
    const nullStore = new Store({
      disk: {
        getBytes: sinon.stub().callsFake(() => Promise.reject(null)),
      } as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    try {
      await primitiveStore.readFile('/ocfl/missing.txt');
      throw new Error('Expected primitiveStore.readFile to throw');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).to.equal('ENOENT');
    }

    let thrown: unknown = undefined;
    try {
      await nullStore.readFile('/ocfl/null-error.txt');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).to.equal(null);
  });

  it('stats Flydrive files with a single metadata lookup', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const disk = {
      exists: sinon.stub().resolves(true),
      getMetaData: sinon.stub().resolves({
        contentLength: 42,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      }),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    const stat = await store.stat('/ocfl/object/file.txt');

    expect(stat.isFile()).to.equal(true);
    expect(stat.size).to.equal(42);
    expect(disk.getMetaData.calledOnceWith('ocfl/test/object/file.txt')).to.equal(true);
    expect(disk.exists.called).to.equal(false);
  });

  it('uses directory listing entry types in opendir without per-entry stats', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const disk = {
      listAll: sinon.stub().resolves({
        objects: [{ key: 'ocfl/test/object/file.txt' }, { key: 'ocfl/test/object/nested/child.txt' }],
      }),
      getMetaData: sinon.stub().resolves({ contentLength: 0 }),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    const dir = await store.opendir('/ocfl/object');
    const fileEntry = await dir.read();
    const directoryEntry = await dir.read();
    const end = await dir.read();

    expect(fileEntry?.name).to.equal('file.txt');
    expect(fileEntry?.isFile()).to.equal(true);
    expect(fileEntry?.isDirectory()).to.equal(false);
    expect(directoryEntry?.name).to.equal('nested');
    expect(directoryEntry?.isFile()).to.equal(false);
    expect(directoryEntry?.isDirectory()).to.equal(true);
    expect(end).to.equal(null);
    expect(disk.getMetaData.called).to.equal(false);
  });

  it('waits for Flydrive write stream uploads before invoking the end callback', function (done) {
    const Store = createStorageManagerOcflStoreClass(class {});
    let finishUpload: (() => void) | undefined;
    const disk = {
      putStream: sinon.stub().returns(
        new Promise<void>(resolve => {
          finishUpload = resolve;
        })
      ),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    store
      .createWriteStream('/ocfl/object/file.txt')
      .then(stream => {
        let callbackCalled = false;
        stream.end('content', () => {
          callbackCalled = true;
          done();
        });
        setImmediate(() => {
          expect(callbackCalled).to.equal(false);
          finishUpload?.();
        });
      })
      .catch(done);
  });

  it('waits for Flydrive write stream uploads before finishing the stream', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    let finishUpload: (() => void) | undefined;
    const disk = {
      putStream: sinon.stub().returns(
        new Promise<void>(resolve => {
          finishUpload = resolve;
        })
      ),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });
    const stream = await store.createWriteStream('/ocfl/object/file.txt');
    let finishedStream = false;

    const finishedPromise = finished(stream).then(() => {
      finishedStream = true;
    });
    stream.end('content');
    await new Promise(resolve => setImmediate(resolve));
    expect(finishedStream).to.equal(false);
    finishUpload?.();
    await finishedPromise;
    expect(finishedStream).to.equal(true);
  });

  it('moves OCFL directories through the Flydrive disk abstraction', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const disk = {
      exists: sinon.stub().resolves(false),
      listAll: sinon.stub().resolves({
        objects: [{ key: 'ocfl/test/object/a.txt' }, { key: 'ocfl/test/object/nested/b.txt' }],
      }),
      move: sinon.stub().resolves(),
    };
    const store = new Store({
      disk: disk as any,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    await store.move('/ocfl/object', '/ocfl/new-object');

    expect(disk.move.callCount).to.equal(2);
    expect(disk.move.firstCall.args).to.deep.equal(['ocfl/test/object/a.txt', 'ocfl/test/new-object/a.txt']);
    expect(disk.move.secondCall.args).to.deep.equal([
      'ocfl/test/object/nested/b.txt',
      'ocfl/test/new-object/nested/b.txt',
    ]);
  });

  it('moves every OCFL directory entry across paginated Flydrive listings', async function () {
    const Store = createStorageManagerOcflStoreClass(class {});
    const disk = {
      exists: sinon.stub().resolves(false),
      listAll: sinon.stub(),
      move: sinon.stub().resolves(),
    };
    disk.listAll.onFirstCall().resolves({
      paginationToken: 'next-page',
      objects: [{ key: 'ocfl/test/object/a.txt' }],
    });
    disk.listAll.onSecondCall().resolves({
      objects: [{ key: 'ocfl/test/object/nested/b.txt' }],
    });
    const store = new Store({
      disk: disk as unknown as StorageManagerServices.IDisk,
      root: '/ocfl',
      workspace: '/ocfl-work',
      prefix: 'ocfl/test',
    });

    await store.move('/ocfl/object', '/ocfl/new-object');

    expect(disk.listAll.callCount).to.equal(2);
    expect(disk.listAll.firstCall.args).to.deep.equal(['ocfl/test/object/', { recursive: true }]);
    expect(disk.listAll.secondCall.args).to.deep.equal([
      'ocfl/test/object/',
      { recursive: true, paginationToken: 'next-page' },
    ]);
    expect(disk.move.callCount).to.equal(2);
    expect(disk.move.firstCall.args).to.deep.equal(['ocfl/test/object/a.txt', 'ocfl/test/new-object/a.txt']);
    expect(disk.move.secondCall.args).to.deep.equal([
      'ocfl/test/object/nested/b.txt',
      'ocfl/test/new-object/nested/b.txt',
    ]);
  });
});
