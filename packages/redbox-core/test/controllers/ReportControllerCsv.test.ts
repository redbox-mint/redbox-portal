import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import csvParser = require('csv-parser');
import { Controllers } from '../../src/controllers/ReportController';
import { Services as BrandingServices } from '../../src/services/BrandingService';
import { Services as ReportServices } from '../../src/services/ReportsService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { ReportModel } from '../../src/model/storage/ReportModel';
import { ReportFilterType, ReportSource } from '../../src/model/config/ReportConfig';
import { createMockSails, createQueryObject } from '../services/testHelper';

class CachedBrandingService extends BrandingServices.Branding {
  constructor(brands: BrandingModel[]) {
    super();
    this.brandings = brands;
  }
}

interface RequestContext {
  session: { branding: string; portal?: string };
  params?: Record<string, string>;
  body?: Record<string, string>;
  rootContext?: string;
  expectedPath: string;
}

describe('ReportController CSV request context', () => {
  const globalNames = ['sails', 'RBReport', 'BrandingService', 'NamedQueryService', 'ReportsService'];
  const defaultBrand = Object.assign(new BrandingModel(), { id: 'brand-default', name: 'default' });
  const secondBrand = Object.assign(new BrandingModel(), { id: 'brand-second', name: 'second-brand' });
  const title = 'Research, "quoted" & <literal>\nsecond line';
  const rawFilters = {
    dateObjectCreatedRange_fromDate: '2028-04-01T13:00:00.000Z',
    dateObjectCreatedRange_toDate: '2028-04-02T13:59:59.999Z',
    dateObjectModifiedRange_fromDate: '2028-06-15T10:15:30+10:00',
    dateObjectModifiedRange_toDate: '2028-06-16T00:00:00.123Z',
    title: 'literal & "quoted", <filter> + value',
  };
  const records = [
    { redboxOid: 'oid-1', metadata: { title }, date_object_created: '2028-06-15T00:00:00.000Z' },
    { redboxOid: 'oid-2', metadata: { title: '=SUM(1,2)' }, date_object_created: '2028-06-16T00:00:00.000Z' },
  ];
  const namedQueryConfig = { name: 'listRDMPRecords', collection: 'record' };
  let originals: Map<string, PropertyDescriptor | undefined>;
  let controller: Controllers.Report;
  let findReport: sinon.SinonStub;
  let getNamedQuery: sinon.SinonStub;
  let runNamedQuery: sinon.SinonStub;
  let reports: ReportServices.Reports;

  function reportFor(brand: BrandingModel): ReportModel & { key: string; branding: string } {
    return {
      id: `${brand.id}-report`,
      key: `${brand.id}_rdmpRecords`,
      branding: brand.id,
      name: 'rdmpRecords',
      title: 'RDMP records',
      reportSource: ReportSource.database,
      databaseQuery: { queryName: 'listRDMPRecords' },
      solrQuery: null,
      filter: [
        {
          type: ReportFilterType.dateRange, paramName: 'dateObjectCreatedRange', property: '', messsage: 'Created',
          database: { fromProperty: 'dateCreatedFrom', toProperty: 'dateCreatedTo' },
        },
        {
          type: ReportFilterType.dateRange, paramName: 'dateObjectModifiedRange', property: '', messsage: 'Modified',
          database: { fromProperty: 'dateModifiedFrom', toProperty: 'dateModifiedTo' },
        },
        { type: ReportFilterType.text, paramName: 'title', property: 'metadata.title', messsage: 'Title', database: null },
      ],
      columns: [
        { label: 'Id', property: 'redboxOid', hide: false, template: '', exportTemplate: '' },
        { label: 'Title', property: 'metadata.title', hide: false, template: '{{metadata.title}}', exportTemplate: '' },
        {
          label: 'External URL', property: 'redboxOid', hide: true,
          template: '<a href="{{optTemplateData.brandingAndPortalUrl}}/record/view/{{redboxOid}}">View</a>',
          exportTemplate: '{{optTemplateData.brandingAndPortalUrl}}/record/view/{{redboxOid}}',
        },
        {
          label: 'Custom Created', property: 'date_object_created', hide: false,
          template: 'screen-only {{date_object_created}}',
          exportTemplate: 'preserved custom: {{date_object_created}}',
        },
      ],
    };
  }

  beforeEach(() => {
    originals = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Reflect.set(globalThis, 'sails', createMockSails({
      config: {
        appPath: '/app', appUrl: 'http://localhost:1500',
        http: { rootContext: '' }, auth: { defaultBrand: 'default', defaultPortal: 'rdmp' },
      },
    }));
    // Only persistence/query execution is doubled: URL resolution and CSV templates are real services.
    findReport = sinon.stub().callsFake(({ key }: { key: string }) => {
      const brand = key.startsWith(`${secondBrand.id}_`) ? secondBrand : defaultBrand;
      return createQueryObject(reportFor(brand));
    });
    getNamedQuery = sinon.stub().resolves(namedQueryConfig);
    runNamedQuery = sinon.stub().resolves({
      summary: { numFound: records.length, start: 0, page: 1 }, records,
    });
    Reflect.set(globalThis, 'RBReport', { findOne: findReport });
    Reflect.set(globalThis, 'NamedQueryService', {
      getNamedQueryConfig: getNamedQuery, performNamedQueryFromConfig: runNamedQuery,
    });
    Reflect.set(globalThis, 'BrandingService', new CachedBrandingService([defaultBrand, secondBrand]));
    reports = new ReportServices.Reports();
    Reflect.set(globalThis, 'ReportsService', reports);
    controller = new Controllers.Report();
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  async function download(context: RequestContext, filters: Record<string, string> = rawFilters) {
    sails.config.http.rootContext = context.rootContext ?? '';
    const params = { name: 'rdmpRecords', ...context.params };
    const request = {
      params, body: context.body ?? {}, session: { ...context.session }, query: { ...filters },
      param: (name: string) => Reflect.get(params, name) ?? filters[name],
    } as unknown as Sails.Req;
    const response = {
      attachment: sinon.stub().returnsThis(), set: sinon.stub().returnsThis(),
      status: sinon.stub().returnsThis(), send: sinon.stub().returnsThis(),
    };
    const returned = await controller.downloadCSV(request, response as unknown as Sails.Res);

    assert.equal(returned, response);
    sinon.assert.calledOnceWithExactly(response.attachment, 'rdmpRecords.csv');
    sinon.assert.calledOnceWithExactly(response.set, 'Content-Type', 'text/csv');
    sinon.assert.calledOnceWithExactly(response.status, 200);
    sinon.assert.calledOnce(response.send);
    assert.equal(typeof response.send.firstCall.args[0], 'string');
    const csv = response.send.firstCall.args[0] as string;
    const rows: Record<string, string>[] = [];
    for await (const row of Readable.from([csv]).pipe(csvParser())) rows.push(row);

    const brand = context.session.branding === secondBrand.name ? secondBrand : defaultBrand;
    sinon.assert.calledOnceWithExactly(findReport, { key: `${brand.id}_rdmpRecords` });
    sinon.assert.calledOnceWithExactly(getNamedQuery, brand, 'listRDMPRecords');
    sinon.assert.calledOnceWithExactly(runNamedQuery, namedQueryConfig, {
      dateCreatedFrom: filters.dateObjectCreatedRange_fromDate,
      dateCreatedTo: filters.dateObjectCreatedRange_toDate,
      dateModifiedFrom: filters.dateObjectModifiedRange_fromDate,
      dateModifiedTo: filters.dateObjectModifiedRange_toDate,
      title: filters.title,
    }, brand, 0, 1000000000);
    assert.deepEqual(rows, [
      {
        Id: 'oid-1', Title: title, 'External URL': `http://localhost:1500${context.expectedPath}/record/view/oid-1`,
        'Custom Created': 'preserved custom: 2028-06-15T00:00:00.000Z',
      },
      {
        Id: 'oid-2', Title: "'=SUM(1,2)", 'External URL': `http://localhost:1500${context.expectedPath}/record/view/oid-2`,
        'Custom Created': 'preserved custom: 2028-06-16T00:00:00.000Z',
      },
    ]);
    assert.ok(csv.startsWith('Id,Title,External URL,Custom Created\n'));
    assert.ok(csv.includes('"Research, ""quoted"" & <literal>\nsecond line"'));
    assert.ok(!csv.includes('&amp;'));
    assert.ok(!csv.includes('<a href='));
  }

  it('uses the nondefault route brand and portal, including root context, ahead of body/session values', async () => {
    await download({
      session: { branding: 'second-brand', portal: 'session-portal' },
      params: { branding: 'second-brand', portal: 'second-portal' },
      body: { branding: 'default', portal: 'body-portal' },
      rootContext: 'portal-root', expectedPath: '/portal-root/second-brand/second-portal',
    });
  });

  it('preserves nondefault brand and portal from the session when route/body values are absent', async () => {
    await download({
      session: { branding: 'second-brand', portal: 'session-portal' },
      expectedPath: '/second-brand/session-portal',
    });
  });

  it('retains explicit default-brand/default-portal CSV links, raw filters, headers and text escaping', async () => {
    await download({
      session: { branding: 'default', portal: 'rdmp' }, params: { branding: 'default', portal: 'rdmp' },
      expectedPath: '/default/rdmp',
    });
  });

  it('retains the configured default portal and omitted filter values', async () => {
    await download({ session: { branding: 'default' }, expectedPath: '/default/rdmp' }, {});
  });
});
