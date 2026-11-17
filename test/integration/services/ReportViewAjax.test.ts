import supertest from 'supertest';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { ReportSource } from '../../../packages/redbox-core/src/model/config/ReportConfig';

/** Real Mongo/Solr pagination through the authenticated report-view HTTP endpoints. */
describe('Report view AJAX sorting', function () {
  this.timeout(60_000);
  const prefix = `report-sort-${Date.now()}`;
  let brand: any;
  let collection: any;
  let agent: supertest.Agent;
  let solrUrl: string;
  const names = [`${prefix}-database`, `${prefix}-solr`];
  const ids = [0, 1, 2].map(index => `${prefix}-${index}`);

  before(async () => {
    brand = BrandingService.getDefault();
    collection = await new Promise((resolve, reject) =>
      (sails.models.record as any).native((err: Error, value: unknown) => (err ? reject(err) : resolve(value)))
    );
    await collection.insertMany(
      ['Bravo', 'Zulu', 'Alpha'].map((title, index) => ({
        redboxOid: ids[index],
        metadata: { title },
        metaMetadata: { brandId: brand.id, type: prefix },
        dateCreated: `2026-01-0${index + 1}T00:00:00.000Z`,
        lastSaveDate: '2026-01-01T00:00:00.000Z',
      }))
    );
    await NamedQueryService.create(brand, prefix, {
      collectionName: 'record',
      brandIdFieldPath: 'metaMetadata.brandId',
      mongoQuery: { 'metaMetadata.type': prefix },
      queryParams: {},
      resultObjectMapping: { alias: '{{record.metadata.title}}' },
      sort: [{ dateCreated: 'DESC' }],
    });
    await firstValueFrom(
      ReportsService.create(brand, names[0], {
        title: 'Sorting database fixture',
        reportSource: ReportSource.database,
        databaseQuery: { queryName: prefix },
        solrQuery: null,
        filter: [],
        columns: [{ label: 'Title', property: 'title', hide: false, template: '', exportTemplate: '' }],
      })
    );
    const options = sails.config.solr.cores.default.options;
    solrUrl = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}/update?commit=true`;
    await axios.post(
      solrUrl,
      ids.map((id, index) => ({
        id,
        metaMetadata_brandId: brand.id,
        date_report_sort: `2026-01-0${index + 1}T00:00:00Z`,
      }))
    );
    await firstValueFrom(
      ReportsService.create(brand, names[1], {
        title: 'Sorting Solr fixture',
        reportSource: ReportSource.solr,
        databaseQuery: null,
        solrQuery: { baseQuery: `q=id:(${ids.join(' OR ')})`, searchCore: 'default' },
        filter: [],
        columns: [{ label: 'Created', property: 'date_report_sort', hide: false, template: '', exportTemplate: '' }],
      })
    );
    agent = supertest.agent((sails as any).hooks.http.app);
    const loginCsrf = (await agent.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    await agent
      .post('/user/login_local')
      .set('X-CSRF-Token', loginCsrf)
      .set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
  });

  after(async () => {
    // Every fixture is scoped to a unique prefix; never change existing records/configuration.
    if (collection) await collection.deleteMany({ redboxOid: { $in: ids } });
    if (brand) {
      await RBReport.destroy({ branding: brand.id, name: names });
      await NamedQuery.destroy({ branding: brand.id, name: prefix });
    }
    if (solrUrl) await axios.post(solrUrl, { delete: ids.map(id => ({ id })) });
  });

  for (const [index, field, ascending] of [
    [0, 'title', ['Alpha', 'Bravo', 'Zulu']],
    [1, 'date_report_sort', ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z']],
  ] as const) {
    it(`sorts ${index === 0 ? 'database' : 'Solr'} results across pages and matches CSV`, async () => {
      const base = '/default/rdmp/admin';
      const metadata = await agent
        .get(`${base}/getReport`)
        .set('X-Source', 'jsclient')
        .query({ name: names[index] })
        .expect(200);
      expect(metadata.body.reportSource).to.equal(index === 0 ? 'database' : 'solr');
      expect(metadata.body.columns[0].sortable).to.equal(true);
      expect(metadata.body).not.to.have.property('solrQuery');
      expect(metadata.body.databaseQuery).to.deep.equal(index === 0 ? { queryName: prefix } : null);
      for (const sortDirection of ['asc', 'desc']) {
        const expected = sortDirection === 'asc' ? [...ascending] : [...ascending].reverse();
        for (let start = 0; start < 3; start++) {
          const response = await agent
            .get(`${base}/getReportResults`)
            .set('X-Source', 'jsclient')
            .query({ name: names[index], sortField: field, sortDirection, start, rows: 1 })
            .expect(200);
          expect(response.body.total).to.equal(3);
          expect(response.body.records[0][field]).to.equal(expected[start]);
        }
        const csv = await agent
          .get(`${base}/downloadReportCSV`)
          .set('X-Source', 'jsclient')
          .query({ name: names[index], sortField: field, sortDirection })
          .expect(200);
        expect(csv.text.trim().split('\n').slice(1)).to.deep.equal(expected);
      }
      const baseline = await agent
        .get(`${base}/getReportResults`)
        .set('X-Source', 'jsclient')
        .query({ name: names[index] })
        .expect(200);
      const invalid = await agent
        .get(`${base}/getReportResults`)
        .set('X-Source', 'jsclient')
        .query({ name: names[index], sortField: 'title desc,id', sortDirection: 'asc' })
        .expect(200);
      expect(invalid.body.records).to.deep.equal(baseline.body.records);
    });
  }

  it('does not disclose reports to an unauthenticated caller', async () => {
    const response = await supertest((sails as any).hooks.http.app)
      .get('/default/rdmp/admin/getReport')
      .set('X-Source', 'jsclient')
      .query({ name: names[0] });
    expect(response.body).not.to.have.property('columns');
  });
});
