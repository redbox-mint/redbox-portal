let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';
import { DateTime } from 'luxon';

describe('ReportsService', function() {
  let mockSails: any;
  let ReportsService: any;
  let mockReport: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        reports: {
          'test-report': {
            title: 'Test Report',
            reportSource: 'database',
            databaseQuery: { queryName: 'testQuery' },
            solrQuery: { baseQuery: 'q=*:*', searchCore: 'core1' },
            columns: [
              { label: 'Title', property: 'title' },
              { label: 'ID', property: 'id' }
            ],
            filter: []
          }
        },
        search: {
          serviceName: 'solrsearchservice'
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      },
      services: {
        solrsearchservice: {
          searchAdvanced: sinon.stub().resolves({ response: { docs: [] } })
        }
      }
    });

    mockReport = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      create: sinon.stub().returns(createQueryObject({ id: 'report-1' })),
      updateOne: sinon.stub().returns({
        set: sinon.stub().resolves({
          id: 'report-1',
          name: 'database-report',
          title: 'Updated Database Report',
          reportSource: 'database',
          databaseQuery: { queryName: 'testQuery' },
          solrQuery: null,
          filter: [],
          columns: [{ label: 'Title', property: 'title' }]
        })
      }),
      destroyOne: sinon.stub().resolves({ id: 'report-1' })
    };

    setupServiceTestGlobals(mockSails);
    (global as any).RBReport = mockReport;
    (global as any).BrandingService = {
      getFullPath: sinon.stub().returns('http://portal')
    };
    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves({}),
      performNamedQueryFromConfig: sinon.stub().resolves({ 
        summary: { numFound: 1, start: 0, page: 1 },
        records: [{ title: 'Record 1', id: '1' }]
      })
    };

    const { Services } = require('../../src/services/ReportsService');
    ReportsService = new Services.Reports();
    ReportsService.searchService = mockSails.services.solrsearchservice;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RBReport;
    delete (global as any).BrandingService;
    delete (global as any).NamedQueryService;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should create reports if not exist', function(done) {
      mockReport.find.returns(createQueryObject([])); // no existing reports
      
      const createSpy = sinon.spy(ReportsService, 'create');
      const defBrand = { id: 'brand-1' };
      
      ReportsService.bootstrap(defBrand).subscribe({
        next: (res: any) => {},
        complete: () => {
          expect(createSpy.called).to.be.true;
          expect(createSpy.calledWith(defBrand, 'test-report')).to.be.true;
          done();
        }
      });
    });

    it('should skip creation if reports exist', function(done) {
      mockReport.find.returns(createQueryObject([{ id: 'existing-report' }]));
      
      const createSpy = sinon.spy(ReportsService, 'create');
      const defBrand = { id: 'brand-1' };
      
      ReportsService.bootstrap(defBrand).subscribe({
        next: (res: any) => {},
        complete: () => {
          expect(createSpy.called).to.be.false;
          done();
        }
      });
    });
  });

  describe('create', function() {
    it('should create report model', function(done) {
      const brand = { id: 'brand-1' };
      const config = {
        title: 'New Report',
        reportSource: 'solr',
        solrQuery: {},
        databaseQuery: {},
        columns: [],
        filter: []
      };
      
      ReportsService.create(brand, 'new-report', config).subscribe({
        next: (res: any) => {
          expect(mockReport.create.called).to.be.true;
          done();
        },
        error: done
      });
    });
  });

  describe('report config management', function() {
    const brand = { id: 'brand-1' };
    const databaseConfig = {
      name: 'database-report',
      title: 'Database Report',
      reportSource: 'database',
      databaseQuery: { queryName: 'testQuery' },
      solrQuery: null,
      filter: [
        {
          type: 'date-range',
          paramName: 'dateRange',
          message: 'Date range',
          property: '',
          database: { fromProperty: 'dateFrom', toProperty: 'dateTo' }
        },
        {
          type: 'text',
          paramName: 'title',
          message: 'Title',
          property: 'title'
        }
      ],
      columns: [{ label: 'Title', property: 'title' }]
    };

    it('should list normalized report configurations with read-only flags', async function() {
      mockReport.find.returns(createQueryObject([
        {
          name: 'database-report',
          title: 'Database Report',
          reportSource: 'database',
          databaseQuery: { queryName: 'testQuery' },
          filter: [],
          columns: []
        },
        {
          name: 'solr-report',
          title: 'Solr Report',
          reportSource: 'solr',
          solrQuery: { baseQuery: 'q=*:*', searchCore: 'core1' },
          filter: [],
          columns: []
        }
      ]));

      const result = await ReportsService.listConfigs(brand);

      expect(result).to.have.length(2);
      expect(result[0]).to.include({ name: 'database-report', readOnly: false, canEdit: true, canDelete: true, canPreview: true });
      expect(result[1]).to.include({ name: 'solr-report', readOnly: true, canEdit: false, canDelete: false, canPreview: false });
      expect(result[1].readOnlyReason).to.equal('Solr reports are read-only in this version');
    });

    it('should create a database report configuration after validating the named query', async function() {
      mockReport.findOne.returns(createQueryObject(null));
      mockReport.create.returns(createQueryObject({
        id: 'report-1',
        ...databaseConfig
      }));

      const result = await ReportsService.createConfig(brand, databaseConfig);

      expect((global as any).NamedQueryService.getNamedQueryConfig.calledWith(brand, 'testQuery')).to.be.true;
      expect(mockReport.create.calledOnce).to.be.true;
      expect(mockReport.create.firstCall.args[0]).to.deep.include({
        name: 'database-report',
        branding: 'brand-1',
        title: 'Database Report',
        reportSource: 'database'
      });
      expect(result).to.include({ name: 'database-report', title: 'Database Report', readOnly: false });
    });

    it('should reject duplicate report configuration names', async function() {
      mockReport.findOne.returns(createQueryObject({ id: 'existing-report', ...databaseConfig }));

      try {
        await ReportsService.createConfig(brand, databaseConfig);
        expect.fail('Expected duplicate create to throw');
      } catch (error: any) {
        expect(error.status).to.equal(409);
      }
    });

    it('should validate required fields and named query existence before persisting', async function() {
      (global as any).NamedQueryService.getNamedQueryConfig.resolves(null);

      try {
        await ReportsService.createConfig(brand, { ...databaseConfig, databaseQuery: { queryName: 'missingQuery' } });
        expect.fail('Expected missing named query to throw');
      } catch (error: any) {
        expect(error.status).to.equal(400);
        expect(error.message).to.include("Named query 'missingQuery' not found");
      }

      expect(mockReport.create.called).to.be.false;
    });

    it('should update an existing database report and preserve the route name', async function() {
      mockReport.findOne.returns(createQueryObject({
        id: 'report-1',
        ...databaseConfig
      }));

      const result = await ReportsService.updateConfig(brand, 'database-report', {
        ...databaseConfig,
        title: 'Updated Database Report'
      });

      expect(mockReport.updateOne.calledWith({ key: 'brand-1_database-report' })).to.be.true;
      expect(mockReport.updateOne.firstCall.returnValue.set.calledOnce).to.be.true;
      expect(result).to.include({ name: 'database-report', title: 'Updated Database Report', readOnly: false });
    });

    it('should reject attempts to rename an existing report', async function() {
      mockReport.findOne.returns(createQueryObject({
        id: 'report-1',
        ...databaseConfig
      }));

      try {
        await ReportsService.updateConfig(brand, 'database-report', { ...databaseConfig, name: 'renamed-report' });
        expect.fail('Expected rename to throw');
      } catch (error: any) {
        expect(error.status).to.equal(400);
        expect(error.message).to.equal('Report name cannot be changed');
      }
    });

    it('should reject modification and deletion of solr reports', async function() {
      mockReport.findOne.returns(createQueryObject({
        id: 'report-1',
        name: 'solr-report',
        title: 'Solr Report',
        reportSource: 'solr',
        solrQuery: { baseQuery: 'q=*:*', searchCore: 'core1' },
        filter: [],
        columns: []
      }));

      try {
        await ReportsService.updateConfig(brand, 'solr-report', { ...databaseConfig, name: 'solr-report' });
        expect.fail('Expected solr update to throw');
      } catch (error: any) {
        expect(error.status).to.equal(403);
      }

      try {
        await ReportsService.deleteConfig(brand, 'solr-report');
        expect.fail('Expected solr delete to throw');
      } catch (error: any) {
        expect(error.status).to.equal(403);
      }
    });

    it('should delete an existing mutable report', async function() {
      mockReport.findOne.returns(createQueryObject({
        id: 'report-1',
        ...databaseConfig
      }));

      const result = await ReportsService.deleteConfig(brand, 'database-report');

      expect(mockReport.destroyOne.calledWith({ key: 'brand-1_database-report' })).to.be.true;
      expect(result).to.deep.equal({ deleted: true });
    });

    it('should preview a draft database report using mapped filter parameters', async function() {
      const req = {
        param: sinon.stub()
      };
      req.param.withArgs('dateRange_fromDate').returns('2024-01-01T00:00:00.000Z');
      req.param.withArgs('dateRange_toDate').returns('2024-01-31T23:59:59.999Z');
      req.param.withArgs('title').returns('Test title');

      const result = await ReportsService.previewConfig(brand, databaseConfig, req);

      expect((global as any).NamedQueryService.performNamedQueryFromConfig.calledOnce).to.be.true;
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.firstCall.args[1]).to.deep.equal({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        title: 'Test title'
      });
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.firstCall.args[3]).to.equal(0);
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.firstCall.args[4]).to.equal(100);
      expect(result.success).to.equal(true);
      expect(result.records).to.deep.equal([{ title: 'Record 1', id: '1' }]);
    });
  });

  describe('get', function() {
    it('should find report by key', async function() {
      const brand = { id: 'brand-1' };
      mockReport.findOne.returns(createQueryObject({ id: 'report-1' }));
      
      const result = await ReportsService.get(brand, 'report-name');
      
      expect(mockReport.findOne.calledWith({ key: 'brand-1_report-name' })).to.be.true;
      expect(result).to.deep.equal({ id: 'report-1' });
    });
  });

  describe('getResults', function() {
    it('should get results from database', async function() {
      const brand = { id: 'brand-1' };
      const req = { param: sinon.stub() };
      
      const reportModel = {
        reportSource: 'database',
        databaseQuery: { queryName: 'testQuery' },
        columns: []
      };
      mockReport.findOne.returns(createQueryObject(reportModel));
      
      const result = await ReportsService.getResults(brand, 'report-1', req);
      
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.called).to.be.true;
      expect(result.total).to.equal(1);
      expect(result.records).to.have.length(1);
    });

    it('should get results from solr', async function() {
      const brand = { id: 'brand-1' };
      const req = { param: sinon.stub() };
      
      const reportModel = {
        reportSource: 'solr',
        solrQuery: { baseQuery: 'q=*:*', searchCore: 'core1' },
        columns: []
      };
      mockReport.findOne.returns(createQueryObject(reportModel));
      
      mockSails.services.solrsearchservice.searchAdvanced.resolves({
        response: { numFound: 5, start: 0, docs: [{}, {}, {}, {}, {}] }
      });
      
      const result = await ReportsService.getResults(brand, 'report-1', req);
      
      expect(mockSails.services.solrsearchservice.searchAdvanced.called).to.be.true;
      expect(result.total).to.equal(5);
      expect(result.records).to.have.length(5);
    });
  });

  describe('getCSVResult', function() {
    it('should return CSV string', async function() {
      const brand = { id: 'brand-1' };
      const req = { param: sinon.stub() };
      
      const reportModel = {
        reportSource: 'database',
        databaseQuery: { queryName: 'testQuery' },
        columns: [
          { label: 'Title', property: 'title' },
          { label: 'ID', property: 'id' }
        ]
      };
      mockReport.findOne.returns(createQueryObject(reportModel));
      
      const result = await ReportsService.getCSVResult(brand, 'report-1', req);
      
      expect(result).to.be.a('string');
      expect(result).to.include('Title,ID');
      expect(result).to.include('Record 1,1');
    });
  });

  describe('runTemplate', function() {
    it('should run handlebars template', function() {
      const data = { name: 'World' };
      const config = { template: 'Hello {{name}}' };
      
      const result = ReportsService.runTemplate(data, config);
      
      expect(result).to.equal('Hello World');
    });

    it('should return JSON object if json=true', function() {
      const data = { name: 'World' };
      const config = { template: '{"message": "Hello {{name}}"}', json: true };
      
      const result = ReportsService.runTemplate(data, config);
      
      expect(result).to.deep.equal({ message: 'Hello World' });
    });
  });

  describe('getDataRows', function() {
    it('should extract data rows based on columns', function() {
      const report = {
        columns: [
          { label: 'Title', property: 'title' },
          { label: 'Count', property: 'stats.count' }
        ]
      };
      const data = [
        { title: 'A', stats: { count: 1 } },
        { title: 'B', stats: { count: 2 } }
      ];
      
      const result = ReportsService.getDataRows(report, data, {});
      
      expect(result).to.have.length(2);
      expect(result[0]).to.deep.equal(['A', 1]);
      expect(result[1]).to.deep.equal(['B', 2]);
    });
  });

  describe('extractReportTemplates', function() {
    it('should extract templates from report columns', async function() {
      const brand = { id: 'brand-1', name: 'default' };
      const reportData = {
        name: 'testReport',
        columns: [
          { label: 'Name', property: 'name', template: '{{name}}' },
          { label: 'Link', property: 'url', template: '<a href="{{url}}">Link</a>', exportTemplate: '{{url}}' }
        ]
      };
      
      mockReport.findOne.resolves(reportData);
      
      const result = await ReportsService.extractReportTemplates(brand, 'testReport');
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should return empty array for non-existent report', async function() {
      const brand = { id: 'brand-1', name: 'default' };
      
      mockReport.findOne.resolves(null);
      
      const result = await ReportsService.extractReportTemplates(brand, 'nonexistent');
      
      expect(result).to.be.an('array').that.is.empty;
    });
  });

  describe('Handlebars Helpers', function() {
    it('should support shared helpers like formatDate', function() {
      const report = {
        columns: [
          { 
            label: 'Date Modified', 
            property: 'date_object_modified',
            template: '{{formatDate date_object_modified "dd/MM/yyyy hh:mm a"}}'
          }
        ]
      };
      
      const data = [
        { 
          id: 1, 
          date_object_modified: "2023-05-18T01:30:00+10:00"
        }
      ];

      const result = ReportsService.getDataRows(report, data, {});
      
      const expectedModified = DateTime.fromISO("2023-05-18T01:30:00+10:00").toFormat("dd/MM/yyyy hh:mm a");
      expect(result[0][0]).to.equal(expectedModified);
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = ReportsService.exports();
      
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('findAllReportsForBrand');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getResults');
      expect(exported).to.have.property('getCSVResult');
      expect(exported).to.have.property('getReportDto');
      expect(exported).to.have.property('listConfigs');
      expect(exported).to.have.property('getConfig');
      expect(exported).to.have.property('createConfig');
      expect(exported).to.have.property('updateConfig');
      expect(exported).to.have.property('deleteConfig');
      expect(exported).to.have.property('previewConfig');
      expect(exported).to.have.property('extractReportTemplates');
    });
  });
});
