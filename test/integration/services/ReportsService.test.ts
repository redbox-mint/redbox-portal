describe('ReportsService report configuration integration', function () {
  const mutableReportName = 'report-config-integration';
  const solrReportName = 'report-config-integration-solr';

  let brand: any;

  const cleanupReports = async () => {
    if (!brand) {
      return;
    }
    await RBReport.destroy({
      branding: brand.id,
      name: [mutableReportName, solrReportName],
    });
  };

  const createConfig = (overrides: Record<string, unknown> = {}) => ({
    name: mutableReportName,
    title: 'Integration report config',
    reportSource: 'database',
    databaseQuery: { queryName: 'listRDMPRecords' },
    solrQuery: null,
    filter: [
      {
        type: 'date-range',
        paramName: 'modified',
        message: 'Modified range',
        property: 'dateModified',
        database: {
          fromProperty: 'dateModifiedAfter',
          toProperty: 'dateModifiedBefore',
        },
      },
      {
        type: 'text',
        paramName: 'title',
        message: 'Title',
        property: 'title',
      },
    ],
    columns: [
      { label: 'Title', property: 'title' },
      { label: 'Date Modified', property: 'dateModified' },
    ],
    ...overrides,
  });

  before(async function () {
    brand = BrandingService.getBrand('default');
    await cleanupReports();
  });

  afterEach(async function () {
    await cleanupReports();
  });

  it('creates, reads, lists, updates, and deletes mutable database report configs in RBReport', async function () {
    const created = await ReportsService.createConfig(brand, createConfig());

    expect(created).to.include({
      name: mutableReportName,
      title: 'Integration report config',
      reportSource: 'database',
      readOnly: false,
      canEdit: true,
      canDelete: true,
      canPreview: true,
    });

    const persisted = await RBReport.findOne({ key: `${brand.id}_${mutableReportName}` });
    expect(persisted).to.exist;
    expect(persisted).to.include({
      name: mutableReportName,
      title: 'Integration report config',
      branding: brand.id,
      reportSource: 'database',
    });
    expect(persisted.databaseQuery).to.deep.equal({ queryName: 'listRDMPRecords' });
    expect(persisted.columns).to.deep.equal([
      { label: 'Title', property: 'title', hide: false, exportTemplate: '', template: '', multivalue: false },
      { label: 'Date Modified', property: 'dateModified', hide: false, exportTemplate: '', template: '', multivalue: false },
    ]);

    const fetched = await ReportsService.getConfig(brand, mutableReportName);
    expect(fetched).to.include({ name: mutableReportName, title: 'Integration report config' });

    const listed = await ReportsService.listConfigs(brand);
    expect(listed.map((report: any) => report.name)).to.include(mutableReportName);

    const updated = await ReportsService.updateConfig(brand, mutableReportName, createConfig({
      title: 'Updated integration report config',
      columns: [{ label: 'Record OID', property: 'oid' }],
    }));
    expect(updated).to.include({ name: mutableReportName, title: 'Updated integration report config' });
    expect(updated.columns).to.deep.equal([
      { label: 'Record OID', property: 'oid', hide: false, exportTemplate: '', template: '', multivalue: false },
    ]);

    const persistedUpdate = await RBReport.findOne({ key: `${brand.id}_${mutableReportName}` });
    expect(persistedUpdate.title).to.equal('Updated integration report config');
    expect(persistedUpdate.columns).to.deep.equal([
      { label: 'Record OID', property: 'oid', hide: false, exportTemplate: '', template: '', multivalue: false },
    ]);

    const deleted = await ReportsService.deleteConfig(brand, mutableReportName);
    expect(deleted).to.deep.equal({ deleted: true });
    expect(await RBReport.findOne({ key: `${brand.id}_${mutableReportName}` })).to.not.exist;
  });

  it('previews a draft database report through the named-query execution path', async function () {
    const req = {
      param(name: string) {
        const values: Record<string, string> = {
          modified_fromDate: '2000-01-01T00:00:00.000Z',
          modified_toDate: '2999-12-31T23:59:59.999Z',
          title: '',
        };
        return values[name];
      },
    };

    const result = await ReportsService.previewConfig(brand, createConfig(), req);

    expect(result).to.include({ success: true });
    expect(result.total).to.be.a('number');
    expect(result.records).to.be.an('array');
  });

  it('rejects invalid configs before writing to RBReport', async function () {
    try {
      await ReportsService.createConfig(brand, createConfig({ name: 'not url safe' }));
      expect.fail('Expected invalid name to throw');
    } catch (error: any) {
      expect(error.status).to.equal(400);
    }

    try {
      await ReportsService.createConfig(brand, createConfig({ databaseQuery: { queryName: 'does-not-exist' } }));
      expect.fail('Expected missing named query to throw');
    } catch (error: any) {
      expect(error.status).to.equal(400);
      expect(error.message).to.include("Named query 'does-not-exist' not found");
    }

    expect(await RBReport.findOne({ key: `${brand.id}_${mutableReportName}` })).to.not.exist;
  });

  it('keeps solr report configs read-only for mutation APIs', async function () {
    await RBReport.create({
      name: solrReportName,
      branding: brand.id,
      title: 'Read-only solr integration report',
      reportSource: 'solr',
      solrQuery: { baseQuery: 'q=*:*', searchCore: 'record' },
      databaseQuery: null,
      filter: [],
      columns: [{ label: 'Title', property: 'title' }],
    });

    const report = await ReportsService.getConfig(brand, solrReportName);
    expect(report).to.include({
      name: solrReportName,
      readOnly: true,
      canEdit: false,
      canDelete: false,
      canPreview: false,
    });

    try {
      await ReportsService.updateConfig(brand, solrReportName, createConfig({ name: solrReportName }));
      expect.fail('Expected solr update to throw');
    } catch (error: any) {
      expect(error.status).to.equal(403);
    }

    try {
      await ReportsService.deleteConfig(brand, solrReportName);
      expect.fail('Expected solr delete to throw');
    } catch (error: any) {
      expect(error.status).to.equal(403);
    }

    expect(await RBReport.findOne({ key: `${brand.id}_${solrReportName}` })).to.exist;
  });
});
