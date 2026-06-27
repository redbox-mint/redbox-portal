let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Services } from '../../src/services/OniService';
import { OniPublishing } from '../../src/configmodels/OniPublishing';
import { IntegrationAuditAction, IntegrationAuditName } from '../../src/model/storage/IntegrationAuditModel';
import { buildOniRoCrate, getSelectedAttachments } from '../../src/services/oni-v2/crate';
import { validateHandlebarsTemplate } from '../../src/services/oni-v2/bindings';
import { mapDatasetFields, validateMappedDataset } from '../../src/services/oni-v2/mapping';
import { resolveOniPublishingConfig, resolveOniSite } from '../../src/services/oni-v2/config';
import { createStorageManagerOcflStoreClass } from '../../src/services/oni-v2/flydriveOcflStore';
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
    oniPublishing.metadata.subjects = ['anzsrc_for'];
    oniPublishing.metadata.funders = ['foaf_fundedBy'];
    oniPublishing.metadata.defaultIriPrefs.about = {
      anzsrc_for: 'https://linked.data.gov.au/def/anzsrc-for/2020/',
    };
    oniPublishing.metadata.defaultIriPrefs.funder = 'https://ror.org/';

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
      updateMeta: sinon.stub().resolves({ success: true }),
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
        anzsrc_for: [{ notation: '0601', name: 'Biochemistry' }],
        foaf_fundedBy: [{ dc_identifier: ['03yrm5c26'], dc_title: 'Example Funder' }],
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
    expect(record.metadata.citation_url).to.equal(undefined);
    expect(record.metadata.citation_doi).to.equal('https://doi.org/10.1234/{ID_WILL_BE_HERE}');
    expect(result.attachments).to.have.lengthOf(1);
    expect(result.attachments[0].logicalPath).to.equal('files/file-1/data.csv');
    expect(result.crateJson['@graph']).to.be.an('array');
    expect(JSON.stringify(result.crateJson)).to.include('Dataset Title');
    expect(JSON.stringify(result.crateJson)).to.include('Example Funder');
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

    await service.exportDataset(
      'pub-1',
      publicationRecord(),
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
    expect(updateMeta.firstCall.args[4]).to.equal(false);
    expect(updateMeta.firstCall.args[5]).to.equal(false);
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
});
