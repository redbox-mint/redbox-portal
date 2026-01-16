import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('ReportsService', function() {
  let mockSails: any;
  let ReportsService: any;
  let mockReport: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        reports: {
          testReport: {
            title: 'Test Report',
            reportSource: 'solr',
            solrQuery: {
              baseQuery: 'q=*:*',
              searchCore: 'records'
            },
            columns: [
              { label: 'Name', property: 'name' },
              { label: 'Date', property: 'date_created' }
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
          searchAdvanced: sinon.stub().resolves({
            response: {
              numFound: 0,
              start: 0,
              docs: []
            }
          })
        }
      }
    });

    mockReport = {
      find: sinon.stub().resolves([]),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({})
    };

    setupServiceTestGlobals(mockSails);
    (global as any).Report = mockReport;
    (global as any).BrandingService = {
      getFullPath: sinon.stub().returns('http://localhost:1500/default/portal')
    };
    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves({}),
      performNamedQueryFromConfig: sinon.stub().resolves({
        records: [],
        summary: { numFound: 0, start: 0, page: 1 }
      })
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/ReportsService');
    ReportsService = new Services.Reports();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Report;
    delete (global as any).BrandingService;
    delete (global as any).NamedQueryService;
    sinon.restore();
  });

  describe('get', function() {
    it('should get a specific report by brand and name', async function() {
      const brand = { id: 'brand-1', name: 'default' };
      const reportData = { id: 'report-1', name: 'testReport', key: 'brand-1_testReport' };
      
      mockReport.findOne.resolves(reportData);
      
      const result = await ReportsService.get(brand, 'testReport');
      
      expect(mockReport.findOne.calledWith({ key: 'brand-1_testReport' })).to.be.true;
      expect(result).to.deep.equal(reportData);
    });

    it('should return null for non-existent report', async function() {
      const brand = { id: 'brand-1', name: 'default' };
      
      mockReport.findOne.resolves(null);
      
      const result = await ReportsService.get(brand, 'nonexistent');
      
      expect(result).to.be.null;
    });
  });

  describe('getCSVHeaderRow', function() {
    it('should return column labels as header row', function() {
      const report = {
        columns: [
          { label: 'Name', property: 'name' },
          { label: 'Date Created', property: 'date_created' },
          { label: 'Status', property: 'status' }
        ]
      };
      
      const result = ReportsService.getCSVHeaderRow(report);
      
      expect(result).to.deep.equal(['Name', 'Date Created', 'Status']);
    });

    it('should handle empty columns', function() {
      const report = { columns: [] };
      
      const result = ReportsService.getCSVHeaderRow(report);
      
      expect(result).to.be.an('array').that.is.empty;
    });
  });

  describe('getDataRows', function() {
    it('should extract data rows from records', function() {
      const report = {
        columns: [
          { label: 'Name', property: 'name' },
          { label: 'Status', property: 'status' }
        ]
      };
      const data = [
        { name: 'Record 1', status: 'active' },
        { name: 'Record 2', status: 'draft' }
      ];
      
      const result = ReportsService.getDataRows(report, data, {});
      
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.deep.equal(['Record 1', 'active']);
      expect(result[1]).to.deep.equal(['Record 2', 'draft']);
    });

    it('should handle missing properties', function() {
      const report = {
        columns: [
          { label: 'Name', property: 'name' },
          { label: 'Missing', property: 'nonexistent' }
        ]
      };
      const data = [{ name: 'Record 1' }];
      
      const result = ReportsService.getDataRows(report, data, {});
      
      expect(result).to.have.lengthOf(1);
      expect(result[0][0]).to.equal('Record 1');
      expect(result[0][1]).to.be.undefined;
    });

    it('should handle column templates', function() {
      const report = {
        columns: [
          { label: 'Name', property: 'name', template: '{{name}} (formatted)' }
        ]
      };
      const data = [{ name: 'Record 1' }];
      
      const result = ReportsService.getDataRows(report, data, {});
      
      expect(result).to.have.lengthOf(1);
      expect(result[0][0]).to.include('Record 1');
    });
  });

  describe('getReportDto', function() {
    it('should convert report model to DTO', function() {
      const reportModel = {
        id: 'report-1',
        name: 'testReport',
        title: 'Test Report',
        columns: [],
        filter: [],
        solr_query: { baseQuery: 'q=*:*' }
      };
      
      const result = ReportsService.getReportDto(reportModel);
      
      expect(result).to.be.an('object');
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
      expect(exported).to.have.property('extractReportTemplates');
    });
  });
});
