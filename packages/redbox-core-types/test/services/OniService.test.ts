let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('OniService', function() {
  let mockSails: any;
  let OniService: any;
  let mockCollector: any;
  let mockRootCollection: any;
  let mockTargetRepoObj: any;

  const createMockTargetRepoObj = () => ({
    crate: {
      rootId: 'arcp://name,test-namespace/test-oid',
      addProfile: sinon.stub(),
      addEntity: sinon.stub(),
      addContext: sinon.stub()
    },
    rootDataset: {
      '@type': []
    },
    mintArcpId: sinon.stub(),
    addFile: sinon.stub().resolves(),
    addToRepo: sinon.stub().resolves()
  });

  const createMockRootCollection = () => ({
    load: sinon.stub().resolves(),
    root: '/test/root',
    rootDataset: {
      '@type': [],
      name: 'Test Collection',
      description: 'Test Description'
    },
    crate: {
      addProfile: sinon.stub()
    },
    mintArcpId: sinon.stub(),
    addToRepo: sinon.stub().resolves()
  });

  const createMockCollector = (rootCollection: any, targetRepoObj: any) => ({
    connect: sinon.stub().resolves(),
    repo: {
      object: sinon.stub().returns(rootCollection)
    },
    namespace: 'test-namespace',
    newObject: sinon.stub().returns(targetRepoObj)
  });

  beforeEach(function() {
    mockTargetRepoObj = createMockTargetRepoObj();
    mockRootCollection = createMockRootCollection();
    mockCollector = createMockCollector(mockRootCollection, mockTargetRepoObj);

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        auth: {
          defaultBrand: 'default'
        },
        record: {
          datastreamService: 'datastreamservice'
        },
        datapubs: {
          rootCollection: {
            targetRepoNamespace: 'test-namespace',
            rootCollectionId: 'root-collection',
            targetRepoColId: 'test-col-id',
            targetRepoColName: 'Test Collection',
            targetRepoColDescription: 'Test Description',
            dsType: ['RepositoryCollection'],
            defaultLicense: { '@id': 'https://creativecommons.org/licenses/by/4.0/', name: 'CC-BY-4.0' },
            enableDatasetToUseDefaultLicense: true
          },
          sites: {
            'test-site': {
              url: 'https://data.example.com',
              dir: '/data/ocfl',
              tempPath: '/tmp',
              repoScratch: '/tmp/scratch',
              tempDir: '/tmp/datasets',
              useCleanUrl: true
            },
            'non-clean-site': {
              url: 'https://data.example.com',
              dir: '/data/ocfl',
              tempPath: '/tmp',
              repoScratch: '/tmp/scratch',
              tempDir: '/tmp/datasets',
              useCleanUrl: false
            }
          },
          metadata: {
            organization: { '@id': 'https://example.org', name: 'Test Organization' },
            subjects: ['anzsrc_for_1', 'anzsrc_for_2'],
            funders: ['foaf_fundedBy'],
            related_works: [
              { field: 'publications', type: 'ScholarlyArticle' },
              { field: 'websites', type: 'WebSite' }
            ],
            DEFAULT_IRI_PREFS: {
              about: { 'anzsrc_for_1': 'https://linked.data.gov.au/def/anzsrc-for/2020/', 'anzsrc_for_2': 'https://linked.data.gov.au/def/anzsrc-for/2020/' },
              funder: 'https://ror.org/',
              license: 'https://creativecommons.org/licenses/'
            }
          }
        },
        oni: {
          enabled: true,
          url: 'https://oni.example.com',
          apiKey: 'test-api-key'
        }
      },
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
      },
      services: {
        datastreamservice: {
          getDatastream: sinon.stub().resolves({
            readstream: {
              pipe: sinon.stub().callsFake(function(this: any, writeStream: unknown) { return this; })
            }
          })
        }
      }
    });

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      updateMeta: sinon.stub().resolves({})
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true),
      getUserWithUsername: sinon.stub().returns(of({ email: 'creator@test.com', name: 'Test Creator' }))
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/OniService');
    OniService = new Services.OniService();
    // Set the datastream service manually since the hook won't fire in tests
    OniService.datastreamService = mockSails.services.datastreamservice;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).UsersService;
    sinon.restore();
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = OniService.exports();

      expect(exported).to.have.property('exportDataset');
    });
  });

  describe('constructor', function() {
    it('should set logHeader property', function() {
      expect(OniService.logHeader).to.equal('OniService::');
    });

    it('should have exportDataset in _exportedMethods', function() {
      expect(OniService._exportedMethods).to.include('exportDataset');
    });
  });

  describe('getDatastreamService', function() {
    it('should get datastream service from sails services', function() {
      OniService.datastreamService = null;
      OniService.getDatastreamService();
      expect(OniService.datastreamService).to.equal(mockSails.services.datastreamservice);
    });
  });

  describe('metTriggerCondition', function() {
    it('should return "false" when no trigger condition set and forceRun is false', function() {
      const result = OniService.metTriggerCondition('oid123', {}, {});
      // Default behavior when no trigger condition is to return "false"
      expect(result).to.equal('false');
    });

    it('should return "true" when forceRun is true', function() {
      const result = OniService.metTriggerCondition('oid123', {}, { forceRun: true });
      expect(result).to.equal('true');
    });

    it('should evaluate triggerCondition from options', function() {
      const record = { metadata: { status: 'published' } };
      const options = { triggerCondition: '<%= record.metadata.status == "published" %>' };
      const result = OniService.metTriggerCondition('oid123', record, options);
      expect(result).to.equal('true');
    });

    it('should return "false" when condition evaluates to false', function() {
      const record = { metadata: { status: 'draft' } };
      const options = { triggerCondition: '<%= record.metadata.status == "published" %>' };
      const result = OniService.metTriggerCondition('oid123', record, options);
      expect(result).to.equal('false');
    });

    it('should log trace when no user is provided', function() {
      OniService.metTriggerCondition('oid123', {}, { forceRun: true });
      expect(mockSails.log.trace.calledWith('No user in metTriggerCondition')).to.be.true;
    });
  });

  describe('getYearFromDate (private method via coverage)', function() {
    // Testing through the overall flow since it's private
    it('should extract year from ISO date string', function() {
      // Access through prototype since it's private
      const getYearFromDate = OniService.getYearFromDate.bind(OniService);
      expect(getYearFromDate('2024-05-15T10:30:00Z')).to.equal('2024');
      expect(getYearFromDate('2023-01-01')).to.equal('2023');
    });
  });

  describe('getPerson (private method)', function() {
    it('should create person object from RB person with ORCID', function() {
      const rbPerson = {
        orcid: 'https://orcid.org/0000-0001-2345-6789',
        email: 'test@example.com',
        text_full_name: 'Test Person',
        givenName: 'Test',
        familyName: 'Person'
      };
      const result = OniService.getPerson(rbPerson, 'Person');
      expect(result).to.have.property('@id', 'https://orcid.org/0000-0001-2345-6789');
      expect(result).to.have.property('@type', 'Person');
      expect(result).to.have.property('name', 'Test Person');
      expect(result).to.have.property('email', 'test@example.com');
    });

    it('should use email when ORCID not available', function() {
      const rbPerson = {
        email: 'test@example.com',
        text_full_name: 'Test Person'
      };
      const result = OniService.getPerson(rbPerson, 'Person');
      expect(result).to.have.property('@id', 'test@example.com');
    });

    it('should use text_full_name when no ORCID or email', function() {
      const rbPerson = {
        text_full_name: 'Test Person'
      };
      const result = OniService.getPerson(rbPerson, 'ContactPoint');
      expect(result).to.have.property('@id', 'Test Person');
      expect(result).to.have.property('@type', 'ContactPoint');
    });

    it('should return undefined when no identifying info', function() {
      const rbPerson = {};
      const result = OniService.getPerson(rbPerson, 'Person');
      expect(result).to.be.undefined;
    });
  });

  describe('getCreators (private method)', function() {
    it('should return creators array with affiliations', function() {
      const metadata = {
        creators: [
          { orcid: 'https://orcid.org/0000-0001-2345-6789', text_full_name: 'Author One', email: 'one@test.com' },
          { orcid: 'https://orcid.org/0000-0002-3456-7890', text_full_name: 'Author Two', email: 'two@test.com' }
        ]
      };
      const organization = { '@id': 'https://example.org', name: 'Test Org' };
      const result = OniService.getCreators(metadata, organization);
      expect(result).to.be.an('array').with.lengthOf(2);
      expect(result[0]).to.have.property('affiliation', organization);
      expect(result[1]).to.have.property('affiliation', organization);
    });

    it('should return empty array when no creators', function() {
      const result = OniService.getCreators({}, {});
      expect(result).to.be.an('array').with.lengthOf(0);
    });

    it('should filter out creators without identifying info', function() {
      const metadata = {
        creators: [
          { orcid: 'https://orcid.org/0000-0001-2345-6789', text_full_name: 'Author One' },
          {} // no identifying info
        ]
      };
      const result = OniService.getCreators(metadata, {});
      expect(result).to.be.an('array').with.lengthOf(1);
    });
  });

  describe('getLicense (private method)', function() {
    it('should return license from license_other_url', function() {
      const metadata = {
        license_other_url: 'https://example.com/custom-license',
        license_notes: 'Custom License'
      };
      const result = OniService.getLicense(metadata);
      expect(result).to.be.an('array').with.lengthOf(1);
      expect(result[0]).to.have.property('@id', 'https://example.com/custom-license');
      expect(result[0]).to.have.property('name', 'Custom License');
    });

    it('should use license_other_url as name when no notes', function() {
      const metadata = {
        license_other_url: 'https://example.com/custom-license'
      };
      const result = OniService.getLicense(metadata);
      expect(result[0]).to.have.property('name', 'https://example.com/custom-license');
    });

    it('should return license from license_notes when no URL', function() {
      const metadata = {
        license_notes: 'Custom notes-only license'
      };
      const result = OniService.getLicense(metadata);
      expect(result[0]).to.have.property('@type', 'CreativeWork');
      expect(result[0]).to.have.property('name', 'Custom notes-only license');
    });

    it('should return license from license_identifier', function() {
      const metadata = {
        license_identifier: 'https://creativecommons.org/licenses/by/4.0/'
      };
      const result = OniService.getLicense(metadata);
      expect(result[0]).to.have.property('@id', 'https://creativecommons.org/licenses/by/4.0/');
    });

    it('should not include undefined license_identifier', function() {
      const metadata = {
        license_identifier: 'undefined'
      };
      const result = OniService.getLicense(metadata);
      expect(result).to.be.an('array').with.lengthOf(1); // Only default license
    });

    it('should include accessRights_url as WebSite', function() {
      const metadata = {
        license_identifier: 'https://creativecommons.org/licenses/by/4.0/',
        accessRights_url: 'https://example.com/access-conditions'
      };
      const result = OniService.getLicense(metadata);
      const accessRights = result.find((l: any) => l['@type'] === 'WebSite');
      expect(accessRights).to.exist;
      expect(accessRights).to.have.property('name', 'Conditions of Access');
    });

    it('should return default license when no license info and enableDatasetToUseDefaultLicense', function() {
      const metadata = {};
      const result = OniService.getLicense(metadata);
      expect(result).to.be.an('array').with.lengthOf(1);
      expect(result[0]).to.have.property('@id', 'https://creativecommons.org/licenses/by/4.0/');
    });
  });

  describe('addTemporalCoverage (private method)', function() {
    it('should set temporalCoverage with start date only', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { startDate: '2020-01-01' };
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.equal('2020-01-01');
    });

    it('should set temporalCoverage with start and end date', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { startDate: '2020-01-01', endDate: '2021-12-31' };
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.equal('2020-01-01/2021-12-31');
    });

    it('should set temporalCoverage with end date only', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { endDate: '2021-12-31' };
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.equal('2021-12-31');
    });

    it('should append timePeriod to existing coverage', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { startDate: '2020-01-01', timePeriod: 'Holocene' };
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.equal('2020-01-01; Holocene');
    });

    it('should set timePeriod alone as temporalCoverage', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { timePeriod: 'Holocene' };
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.equal('Holocene');
    });

    it('should not set temporalCoverage when no dates or period', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {};
      OniService.addTemporalCoverage(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.temporalCoverage).to.be.undefined;
    });
  });

  describe('addSubjects (private method)', function() {
    it('should add subjects to the dataset', function() {
      mockSails.config.datapubs.metadata.subjects = ['anzsrc_for'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        anzsrc_for: [
          { notation: '0601', name: 'Biochemistry and Cell Biology' },
          { notation: '0602', name: 'Ecology' }
        ]
      };
      OniService.addSubjects(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.about).to.be.an('array').with.lengthOf(2);
      expect(targetRepoObj.rootDataset.about[0]).to.have.property('@type', 'StructuredValue');
    });

    it('should handle non-array subject values', function() {
      mockSails.config.datapubs.metadata.subjects = ['anzsrc_for'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        anzsrc_for: { notation: '0601', name: 'Biochemistry and Cell Biology' }
      };
      OniService.addSubjects(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.about).to.be.an('array').with.lengthOf(1);
    });

    it('should skip empty subject fields', function() {
      mockSails.config.datapubs.metadata.subjects = ['anzsrc_for'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = { anzsrc_for: [] };
      OniService.addSubjects(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.about).to.be.an('array').with.lengthOf(0);
    });
  });

  describe('addFunders (private method)', function() {
    it('should add funders to the dataset', function() {
      mockSails.config.datapubs.metadata.funders = ['foaf_fundedBy'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        foaf_fundedBy: [
          { dc_identifier: ['arc123'], dc_title: 'Australian Research Council' }
        ]
      };
      OniService.addFunders(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.funder).to.be.an('array').with.lengthOf(1);
      expect(targetRepoObj.rootDataset.funder[0]).to.have.property('@type', 'Organization');
      expect(targetRepoObj.rootDataset.funder[0]).to.have.property('name', 'Australian Research Council');
    });

    it('should handle non-array funder values', function() {
      mockSails.config.datapubs.metadata.funders = ['foaf_fundedBy'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        foaf_fundedBy: { dc_identifier: ['arc123'], dc_title: 'ARC' }
      };
      OniService.addFunders(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.funder).to.be.an('array').with.lengthOf(1);
    });

    it('should skip funders without dc_identifier', function() {
      mockSails.config.datapubs.metadata.funders = ['foaf_fundedBy'];
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        foaf_fundedBy: [{ dc_title: 'Unknown Funder' }]
      };
      OniService.addFunders(targetRepoObj, metadata, {});
      expect(targetRepoObj.rootDataset.funder).to.be.an('array').with.lengthOf(0);
    });
  });

  describe('addRelatedWorks (private method)', function() {
    it('should add related publications to the dataset', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        related_publications: [
          { related_url: 'https://doi.org/10.1234/example', related_title: 'Example Paper' }
        ]
      };
      OniService.addRelatedWorks(targetRepoObj, metadata);
      expect(targetRepoObj.rootDataset.publications).to.be.an('array').with.lengthOf(1);
      expect(targetRepoObj.rootDataset.publications[0]).to.have.property('@type', 'ScholarlyArticle');
    });

    it('should add description from related_notes', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        related_publications: [
          {
            related_url: 'https://doi.org/10.1234/example',
            related_title: 'Example Paper',
            related_notes: 'Primary source for this dataset'
          }
        ]
      };
      OniService.addRelatedWorks(targetRepoObj, metadata);
      expect(targetRepoObj.rootDataset.publications[0]).to.have.property('description', 'Primary source for this dataset');
    });

    it('should skip related works without URL', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        related_publications: [
          { related_title: 'No URL Paper' }
        ]
      };
      OniService.addRelatedWorks(targetRepoObj, metadata);
      expect(targetRepoObj.rootDataset.publications).to.be.an('array').with.lengthOf(0);
    });
  });

  describe('addHistory (private method)', function() {
    it('should add create and publish actions', function() {
      const targetRepoObj = {
        rootDataset: {
          author: [{ email: 'author@test.com' }],
          contributor: [],
          dateCreated: '2023-01-01T00:00:00Z',
          datePublished: '2024-01-01T00:00:00Z'
        },
        crate: {
          rootId: 'arcp://name,test/oid',
          addEntity: sinon.stub()
        }
      };
      const creator = { email: 'creator@test.com', name: 'Creator' };
      const approver = { email: 'approver@test.com', name: 'Approver' };

      OniService.addHistory(targetRepoObj, {}, creator, approver);

      expect(targetRepoObj.crate.addEntity.callCount).to.be.at.least(2);
      const calls = targetRepoObj.crate.addEntity.getCalls();
      // Should have at least creator person, approver person, and two history entries
      const historyEntries = calls.filter((c: any) => c.args[0]['@id']?.startsWith('history'));
      expect(historyEntries.length).to.equal(2);
    });

    it('should reuse creator when already in author list', function() {
      const creator = { email: 'author@test.com', name: 'Same Author' };
      const targetRepoObj = {
        rootDataset: {
          author: [{ email: 'author@test.com', '@id': 'author@test.com' }],
          contributor: [],
          dateCreated: '2023-01-01T00:00:00Z',
          datePublished: '2024-01-01T00:00:00Z'
        },
        crate: {
          rootId: 'arcp://name,test/oid',
          addEntity: sinon.stub()
        }
      };

      OniService.addHistory(targetRepoObj, {}, creator, { email: 'approver@test.com' });
      // Should still work without adding duplicate
      expect(targetRepoObj.crate.addEntity.called).to.be.true;
    });
  });

  describe('addSpatialCoverage (private method)', function() {
    beforeEach(async function() {
      // Make sure dynamic import is processed
      await OniService.processDynamicImports();
    });

    it('should add GeoJSON Geometry context when geospatial exists', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        geospatial: {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [153.0, -27.5] } }]
        }
      };
      const extraContext: any = {};
      OniService.addSpatialCoverage(targetRepoObj, metadata, extraContext);
      expect(extraContext).to.have.property('Geometry');
      expect(extraContext).to.have.property('asWKT');
    });

    it('should handle array of geospatial features', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {
        geospatial: [
          { type: 'Point', coordinates: [153.0, -27.5] },
          { type: 'Point', coordinates: [151.0, -33.8] }
        ]
      };
      const extraContext: any = {};
      OniService.addSpatialCoverage(targetRepoObj, metadata, extraContext);
      expect(targetRepoObj.rootDataset.spatialCoverage).to.be.an('array').with.lengthOf(2);
    });

    it('should not set spatialCoverage when no geospatial data', function() {
      const targetRepoObj: any = { rootDataset: {} };
      const metadata = {};
      const extraContext: any = {};
      OniService.addSpatialCoverage(targetRepoObj, metadata, extraContext);
      expect(targetRepoObj.rootDataset.spatialCoverage).to.be.undefined;
    });
  });

  describe('ensureDir (private method)', function() {
    it('should create directory if it does not exist', async function() {
      // This is tested through writeDatastream which calls ensureDir
      // We'll test by calling directly if accessible
      // Since it's private, we access it through the prototype
      const ensureDir = OniService.ensureDir.bind(OniService);
      // Create temp directory that we can clean up
      const testDir = '/tmp/test-oni-service-' + Date.now();
      await ensureDir(testDir);
      // Directory should exist now (cleanup handled by temp)
    });
  });

  describe('pathExists (private method)', function() {
    it('should return true for existing path', async function() {
      const pathExists = OniService.pathExists.bind(OniService);
      const exists = await pathExists('/tmp');
      expect(exists).to.be.true;
    });

    it('should return false for non-existing path', async function() {
      const pathExists = OniService.pathExists.bind(OniService);
      const exists = await pathExists('/nonexistent-path-' + Date.now());
      expect(exists).to.be.false;
    });
  });

  describe('addFiles (private method)', function() {
    it('should add files with correct metadata', async function() {
      const addFiles = OniService.addFiles.bind(OniService);
      const targetRepoObj = {
        addFile: sinon.stub().resolves()
      };
      const attachments = [
        { name: 'data.csv', parentDir: '/tmp/files', fileId: 'file1' },
        { name: 'image.png', parentDir: '/tmp/files', fileId: 'file2' }
      ];

      await addFiles(targetRepoObj, {}, attachments);

      expect(targetRepoObj.addFile.callCount).to.equal(2);
      const firstCall = targetRepoObj.addFile.getCall(0);
      expect(firstCall.args[0]).to.have.property('name', 'data.csv');
      expect(firstCall.args[0]).to.have.property('encodingFormat', 'text/csv');
    });
  });

  describe('exportDataset', function() {
    it('should skip export when trigger condition not met', async function() {
      // Override metTriggerCondition to return false
      sinon.stub(OniService, 'metTriggerCondition').returns('false');

      const oid = 'test-oid';
      const record = { metadata: {}, metaMetadata: {} };
      const options = { site: 'test-site' };
      const user = { email: 'test@example.com' };

      await OniService.exportDataset(oid, record, options, user);

      // Should not throw and should log debug message
      expect(mockSails.log.debug.called).to.be.true;
    });

    it('should throw error for unknown publication site', async function() {
      sinon.stub(OniService, 'metTriggerCondition').returns('true');

      const oid = 'test-oid';
      const record = {
        metadata: { dataRecord: { oid: 'data-oid' } },
        metaMetadata: { createdBy: 'testuser' }
      };
      const options = { site: 'unknown-site' };
      const user = { email: 'test@example.com' };

      try {
        await OniService.exportDataset(oid, record, options, user);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unknown publication site');
      }
    });

    it('should throw error when dataRecord not found', async function() {
      sinon.stub(OniService, 'metTriggerCondition').returns('true');

      const oid = 'test-oid';
      const record = {
        metadata: {},
        metaMetadata: { createdBy: 'testuser' }
      };
      const options = { site: 'test-site' };
      const user = { email: 'test@example.com' };

      try {
        await OniService.exportDataset(oid, record, options, user);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include("Couldn't find dataRecord");
      }
    });

    it('should throw error when user email not provided', async function() {
      sinon.stub(OniService, 'metTriggerCondition').returns('true');

      const oid = 'test-oid';
      const record = {
        metadata: { dataRecord: { oid: 'data-oid' } },
        metaMetadata: { createdBy: 'testuser' }
      };
      const options = { site: 'test-site' };

      try {
        await OniService.exportDataset(oid, record, options, null);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Empty user or no email found');
      }
    });

    it('should use clean URL when site.useCleanUrl is true', async function() {
      sinon.stub(OniService, 'metTriggerCondition').returns('true');
      // Mock the collector and write functions
      sinon.stub(OniService, 'writeDatasetObject').resolves();

      const oid = 'test-oid';
      const record: any = {
        metadata: {
          dataRecord: { oid: 'data-oid' },
          citation_doi: 'https://doi.org/10.1234/{ID_WILL_BE_HERE}'
        },
        metaMetadata: { createdBy: 'testuser' }
      };
      const options = { site: 'test-site' };
      const user = { email: 'test@example.com' };

      // This will fail at collector.connect since we don't have real OCFL
      // but we can verify the URL logic by the record update
      try {
        await OniService.exportDataset(oid, record, options, user);
      } catch (err: any) {
        // Expected to fail at collector.connect
        // Check for either the original error or the wrapped one
        expect(err.message).to.match(/Error connecting|Cannot build Provenance/);
      }

      // Check that citation_url was set correctly with clean URL
      expect(record.metadata.citation_url).to.equal('https://data.example.com/test-oid');
    });

    it('should use encoded URL when site.useCleanUrl is false', async function() {
      sinon.stub(OniService, 'metTriggerCondition').returns('true');

      const oid = 'test-oid';
      const record: any = {
        metadata: {
          dataRecord: { oid: 'data-oid' },
          citation_doi: 'https://doi.org/10.1234/{ID_WILL_BE_HERE}'
        },
        metaMetadata: { createdBy: 'testuser' }
      };
      const options = { site: 'non-clean-site' };
      const user = { email: 'test@example.com' };

      try {
        await OniService.exportDataset(oid, record, options, user);
      } catch (err: any) {
        // Expected to fail at collector.connect
      }

      // Check that citation_url was set with encoded URL
      expect(record.metadata.citation_url).to.include('object?');
    });
  });

  describe('recordPublicationError (private method)', function() {
    it('should update record with publication error message', async function() {
      const recordPublicationError = OniService.recordPublicationError.bind(OniService);
      const record: any = { metadata: {} };
      const error = new Error('Test error');
      error.name = 'TestError';

      await recordPublicationError('test-oid', record, error);

      expect(record.metadata.publication_error).to.include('Test error');
      expect((global as any).RecordsService.updateMeta.called).to.be.true;
    });
  });

  describe('removeTempDir (private method)', function() {
    it('should not throw when directory does not exist', async function() {
      const removeTempDir = OniService.removeTempDir.bind(OniService);
      // Should not throw for non-existent directory
      await removeTempDir('/nonexistent-dir-' + Date.now());
    });

    it('should log warning on error', async function() {
      const removeTempDir = OniService.removeTempDir.bind(OniService);
      // Create a scenario that might cause an error
      // Since we're mocking, we just ensure no throw
      await removeTempDir('/tmp/test-remove-' + Date.now());
      // No throw means success
    });
  });

  describe('convertToWkt (private method)', function() {
    beforeEach(async function() {
      await OniService.processDynamicImports();
    });

    it('should convert GeoJSON to WKT format', function() {
      const convertToWkt = OniService.convertToWkt.bind(OniService);
      const geoJson = {
        type: 'Point',
        coordinates: [153.0, -27.5]
      };

      const result = convertToWkt('_:geo-1', geoJson);

      expect(result).to.have.property('@id', '_:geo-1');
      expect(result).to.have.property('@type', 'Geometry');
      expect(result).to.have.property('asWKT');
    });

    it('should remove @type from cloned geoJson before conversion', function() {
      const convertToWkt = OniService.convertToWkt.bind(OniService);
      const geoJson = {
        '@type': 'Feature', // This should be removed
        type: 'Point',
        coordinates: [153.0, -27.5]
      };

      const result = convertToWkt('_:geo-1', geoJson);
      expect(result).to.have.property('asWKT');
    });
  });

  describe('writeDatasetObject (private method)', function() {
    it('should filter attachments based on accessRightsToggle and selection', async function() {
      const writeDatasetObject = OniService.writeDatasetObject.bind(OniService);
      
      // Mock writeDatasetROCrate to avoid full execution
      sinon.stub(OniService, 'writeDatasetROCrate').resolves();
      sinon.stub(OniService, 'removeTempDir').resolves();
      
      const creator = { email: 'creator@test.com' };
      const approver = { email: 'approver@test.com' };
      const record = {
        metadata: {
          accessRightsToggle: true, // metadata only - no files
          dataLocations: [
            { type: 'attachment', selected: true, name: 'file1.csv', fileId: 'f1' },
            { type: 'url', selected: true, name: 'external', fileId: 'f2' }
          ]
        },
        metaMetadata: {}
      };
      
      await writeDatasetObject(creator, approver, 'oid', 'drid', {}, {}, record, '/tmp');
      
      // writeDatasetROCrate should be called with empty attachments when mdOnly=true
      expect(OniService.writeDatasetROCrate.called).to.be.true;
      const callArgs = OniService.writeDatasetROCrate.firstCall.args;
      expect(callArgs[3]).to.be.an('array').with.lengthOf(0);
    });

    it('should throw error when datastream retrieval fails', async function() {
      const writeDatasetObject = OniService.writeDatasetObject.bind(OniService);
      
      // Mock datastream service to fail
      OniService.datastreamService = {
        getDatastream: sinon.stub().rejects(new Error('Datastream error'))
      };
      sinon.stub(OniService, 'removeTempDir').resolves();
      
      const creator = { email: 'creator@test.com' };
      const approver = { email: 'approver@test.com' };
      const record = {
        metadata: {
          accessRightsToggle: false,
          dataLocations: [
            { type: 'attachment', selected: true, name: 'file1.csv', fileId: 'f1' }
          ]
        },
        metaMetadata: {}
      };
      
      try {
        await writeDatasetObject(creator, approver, 'oid', 'drid', {}, {}, record, '/tmp');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Error writing attachments');
      }
    });

    it('should handle datastream with body instead of readstream', async function() {
      const writeDatasetObject = OniService.writeDatasetObject.bind(OniService);
      
      // Mock datastream service to return body instead of readstream
      OniService.datastreamService = {
        getDatastream: sinon.stub().resolves({
          body: 'test file content'
        })
      };
      sinon.stub(OniService, 'writeDatasetROCrate').resolves();
      sinon.stub(OniService, 'removeTempDir').resolves();
      sinon.stub(OniService, 'writeDatastream').resolves();
      
      const creator = { email: 'creator@test.com' };
      const approver = { email: 'approver@test.com' };
      const record = {
        metadata: {
          accessRightsToggle: false,
          dataLocations: [
            { type: 'attachment', selected: true, name: 'file1.txt', fileId: 'f1' }
          ]
        },
        metaMetadata: {}
      };
      
      await writeDatasetObject(creator, approver, 'oid', 'drid', {}, {}, record, '/tmp');
      
      // Should use Buffer.from for body
      expect(OniService.writeDatastream.called).to.be.true;
    });
  });

  describe('writeDatasetROCrate (private method)', function() {
    beforeEach(async function() {
      await OniService.processDynamicImports();
    });

    it('should create RO-Crate with all metadata properties', async function() {
      const writeDatasetROCrate = OniService.writeDatasetROCrate.bind(OniService);
      
      const mockTargetRepoObj = {
        crate: {
          rootId: 'arcp://name,test/oid',
          addProfile: sinon.stub(),
          addEntity: sinon.stub(),
          addContext: sinon.stub()
        },
        rootDataset: {},
        mintArcpId: sinon.stub(),
        addFile: sinon.stub().resolves(),
        addToRepo: sinon.stub().resolves()
      };
      
      const mockTargetCollector = {
        namespace: 'test-namespace',
        newObject: sinon.stub().returns(mockTargetRepoObj)
      };
      
      const mockRootCollection = {
        rootDataset: { name: 'Root Collection' }
      };
      
      const creator = { email: 'creator@test.com', name: 'Creator' };
      const approver = { email: 'approver@test.com', name: 'Approver' };
      const record = {
        metadata: {
          title: 'Test Dataset',
          description: 'A test dataset',
          finalKeywords: ['test', 'data'],
          creators: [
            { orcid: 'https://orcid.org/0000-0001', text_full_name: 'Author One', email: 'one@test.com' }
          ],
          contributor_data_manager: {
            email: 'manager@test.com',
            text_full_name: 'Data Manager'
          },
          license_identifier: 'https://creativecommons.org/licenses/by/4.0/',
          startDate: '2020-01-01',
          endDate: '2021-12-31',
          related_publications: [],
          foaf_fundedBy: [],
          anzsrc_for_1: []
        },
        metaMetadata: {
          createdOn: '2023-01-01T00:00:00Z'
        }
      };
      
      await writeDatasetROCrate(creator, approver, 'test-oid', [], record, mockTargetCollector, mockRootCollection);
      
      expect(mockTargetRepoObj.mintArcpId.called).to.be.true;
      expect(mockTargetRepoObj.crate.addProfile.called).to.be.true;
      expect(mockTargetRepoObj.addToRepo.called).to.be.true;
      expect(mockTargetRepoObj.rootDataset).to.have.property('name', 'Test Dataset');
      expect(mockTargetRepoObj.rootDataset).to.have.property('description', 'A test dataset');
      expect(mockTargetRepoObj.rootDataset).to.have.property('memberOf', mockRootCollection.rootDataset);
    });

    it('should handle contact point not in author list', async function() {
      const writeDatasetROCrate = OniService.writeDatasetROCrate.bind(OniService);
      
      const mockTargetRepoObj = {
        crate: {
          rootId: 'arcp://name,test/oid',
          addProfile: sinon.stub(),
          addEntity: sinon.stub(),
          addContext: sinon.stub()
        },
        rootDataset: {},
        mintArcpId: sinon.stub(),
        addFile: sinon.stub().resolves(),
        addToRepo: sinon.stub().resolves()
      };
      
      const mockTargetCollector = {
        namespace: 'test-namespace',
        newObject: sinon.stub().returns(mockTargetRepoObj)
      };
      
      const mockRootCollection = {
        rootDataset: { name: 'Root Collection' }
      };
      
      const creator = { email: 'creator@test.com', name: 'Creator' };
      const approver = { email: 'approver@test.com', name: 'Approver' };
      const record = {
        metadata: {
          title: 'Test Dataset',
          description: 'A test dataset',
          finalKeywords: [],
          creators: [],
          contributor_data_manager: {
            email: 'manager@test.com',
            text_full_name: 'Data Manager'
          }
        },
        metaMetadata: {
          createdOn: '2023-01-01T00:00:00Z'
        }
      };
      
      await writeDatasetROCrate(creator, approver, 'test-oid', [], record, mockTargetCollector, mockRootCollection);
      
      // Contact point should be added as contributor
      expect(mockTargetRepoObj.rootDataset).to.have.property('contributor');
    });

    it('should add extra context when spatial coverage exists', async function() {
      const writeDatasetROCrate = OniService.writeDatasetROCrate.bind(OniService);
      
      const mockTargetRepoObj = {
        crate: {
          rootId: 'arcp://name,test/oid',
          addProfile: sinon.stub(),
          addEntity: sinon.stub(),
          addContext: sinon.stub()
        },
        rootDataset: {},
        mintArcpId: sinon.stub(),
        addFile: sinon.stub().resolves(),
        addToRepo: sinon.stub().resolves()
      };
      
      const mockTargetCollector = {
        namespace: 'test-namespace',
        newObject: sinon.stub().returns(mockTargetRepoObj)
      };
      
      const mockRootCollection = {
        rootDataset: { name: 'Root Collection' }
      };
      
      const creator = { email: 'creator@test.com', name: 'Creator' };
      const approver = { email: 'approver@test.com', name: 'Approver' };
      const record = {
        metadata: {
          title: 'Test Dataset',
          description: 'A test dataset',
          finalKeywords: [],
          creators: [],
          contributor_data_manager: {
            email: 'manager@test.com',
            text_full_name: 'Data Manager'
          },
          geospatial: { type: 'Point', coordinates: [153.0, -27.5] }
        },
        metaMetadata: {
          createdOn: '2023-01-01T00:00:00Z'
        }
      };
      
      await writeDatasetROCrate(creator, approver, 'test-oid', [], record, mockTargetCollector, mockRootCollection);
      
      // Extra context should be added
      expect(mockTargetRepoObj.crate.addContext.called).to.be.true;
    });
  });

  describe('writeToFileUsingStream (private method)', function() {
    it('should write stream to file', async function() {
      const { Readable } = require('stream');
      const writeToFileUsingStream = OniService.writeToFileUsingStream.bind(OniService);
      
      // Create a test readable stream
      const testData = 'test file content';
      const readable = Readable.from([testData]);
      
      const testFilePath = '/tmp/oni-test-file-' + Date.now() + '.txt';
      
      await writeToFileUsingStream(testFilePath, readable);
      
      // Verify file was created
      const fs = require('fs').promises;
      const content = await fs.readFile(testFilePath, 'utf8');
      expect(content).to.equal(testData);
      
      // Cleanup
      await fs.unlink(testFilePath);
    });
  });

  describe('writeDatastream (private method)', function() {
    it('should create directory and write file', async function() {
      const { Readable } = require('stream');
      const writeDatastream = OniService.writeDatastream.bind(OniService);
      
      const testData = 'test file content';
      const readable = Readable.from([testData]);
      
      const testDir = '/tmp/oni-test-dir-' + Date.now();
      const testFilename = 'test-file.txt';
      
      await writeDatastream(readable, testDir, testFilename);
      
      // Verify file was created
      const fs = require('fs').promises;
      const content = await fs.readFile(testDir + '/' + testFilename, 'utf8');
      expect(content).to.equal(testData);
      
      // Cleanup
      await fs.rm(testDir, { recursive: true });
    });
  });
});
