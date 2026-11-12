import { expect } from 'chai';
import { MongoClient, type Collection } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { MongoReportingProvider } from '../../src/reporting/mongo';
import type { MongoReportingQuery } from '../../src/reporting/query';
import { ReportingError } from '../../src/reporting/types';
import { principal, registry, storedRecord } from './fixtures';

// Use an isolated real database. This suite never touches portal records or existing test databases.
(process.env.REDBOX_REPORTING_MONGO_URL ? describe : describe.skip)(
  'Reporting Mongo aggregation conformance',
  function () {
    this.timeout(15000);
    let client: MongoClient;
    let collection: Collection;
    let provider: MongoReportingProvider;
    const dbName = `redbox_reporting_test_${randomUUID().replaceAll('-', '')}`;
    before(async () => {
      client = await MongoClient.connect(process.env.REDBOX_REPORTING_MONGO_URL!);
      collection = client.db(dbName).collection('record');
      provider = new MongoReportingProvider(collection, registry);
      const records = [];
      for (let i = 0; i < 10; i++) {
        const record = storedRecord(`a-${i}`);
        record.metaMetadata.createdOn = i < 5 ? '2026-01-02T00:00:00Z' : '2026-02-02T00:00:00Z';
        records.push(record);
      }
      for (let i = 0; i < 5; i++) {
        const record = storedRecord(`hidden-${i}`);
        record.authorization.view = ['bob'];
        records.push(record);
      }
      for (let i = 0; i < 2; i++) {
        const record = storedRecord(`b-${i}`);
        record.authorization.view = [];
        record.authorization.edit = ['alice'];
        record.metadata = { faculty: 'B', sensitiveData: false, amount: 200 };
        record.workflow.stage = 'queued';
        record.metaMetadata.createdOn = '2026-03-02T00:00:00Z';
        records.push(record);
      }
      for (let i = 0; i < 4; i++) {
        const record = storedRecord(`c-${i}`);
        record.authorization.view = [];
        if (i < 3) record.authorization.viewRoles = ['Reporter'];
        else record.authorization.editRoles = ['Reporter'];
        record.metadata = { faculty: 'C', sensitiveData: false, amount: i < 3 ? 50 : null };
        record.workflow.stage = 'published';
        record.metaMetadata.createdOn = i < 3 ? '2026-04-02T00:00:00Z' : '2025-12-31T23:30:00-01:00';
        records.push(record);
      }
      const otherBrand = storedRecord('other-brand');
      otherBrand.metaMetadata.brandId = 'brand-b';
      records.push(otherBrand);
      const otherType = storedRecord('other-type');
      otherType.metaMetadata.type = 'party';
      records.push(otherType);
      const missing = storedRecord('missing');
      missing.metadata = { tags: [] };
      missing.metaMetadata.createdOn = 'invalid';
      records.push(missing);
      const pending = storedRecord('pending');
      pending.authorization.view = [];
      pending.authorization.viewPending = ['alice'];
      records.push(pending);
      const admin = storedRecord('admin');
      admin.authorization.view = [];
      admin.authorization.viewRoles = ['Admin'];
      records.push(admin);
      await collection.insertMany(records);
      // Include a native BSON date while exercising the same UTC histogram.
      await collection.updateOne(
        { redboxOid: 'a-0' },
        { $set: { 'metaMetadata.createdOn': new Date('2026-01-02T00:00:00Z') } }
      );
    });
    after(async () => {
      if (client) {
        await client.db(dbName).dropDatabase();
        await client.close();
      }
    });
    const run = (query: Omit<MongoReportingQuery, 'recordType'>) =>
      provider.executeReporting(principal, { ...query, recordType: 'rdmp' } as MongoReportingQuery);
    it('counts only username/role view/edit records in the active brand/type', async () => {
      expect(await run({ operation: 'count' })).to.deep.equal({ count: 17 });
      const dateFilter = { field: 'created', operator: 'between' as const, start: '2026-01-01', end: '2027-01-01' };
      expect(
        await provider.executeReporting(principal, { operation: 'count', recordType: 'rdmp', filters: [dateFilter] })
      ).to.deep.equal({ count: 16 });
      const withoutRole = { ...principal, roles: [], user: { ...principal.user, roles: [] } };
      try {
        await provider.executeReporting(withoutRole, { operation: 'count', recordType: 'rdmp' });
        throw new Error('Expected role check');
      } catch (error) {
        expect(error).to.be.instanceOf(ReportingError);
      }
    });
    it('Faculty A has 10 visible records, unaffected by 5 hidden and a cross-brand record', async () => {
      const result = await provider.executeReporting(principal, {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty'],
        sort: { by: 'count', direction: 'desc' },
      });
      expect(result).to.deep.equal({
        total: 4,
        returned: 4,
        truncated: false,
        offset: 0,
        items: [
          { dimensions: { faculty: 'A' }, metrics: { count: 10 } },
          { dimensions: { faculty: 'C' }, metrics: { count: 4 } },
          { dimensions: { faculty: 'B' }, metrics: { count: 2 } },
          { dimensions: { faculty: null }, metrics: { count: 1 } },
        ],
      });
    });
    it('supports multiple dimensions, boolean/category/in filters and numeric opt-in metrics', async () => {
      const result = await provider.executeReporting(principal, {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty', 'workflowStage'],
        filters: [{ field: 'sensitiveData', operator: 'eq', value: true }],
        metrics: [
          { operation: 'count' },
          { operation: 'sum', field: 'amount', id: 'totalAmount' },
          { operation: 'average', field: 'amount', id: 'averageAmount' },
        ],
      });
      expect(result)
        .to.have.property('items')
        .deep.equal([
          {
            dimensions: { faculty: 'A', workflowStage: 'draft' },
            metrics: { count: 10, totalAmount: 1000, averageAmount: 100 },
          },
        ]);
      expect(
        await provider.executeReporting(principal, {
          operation: 'count',
          recordType: 'rdmp',
          filters: [{ field: 'faculty', operator: 'in', values: ['B', 'C'] }],
        })
      ).to.deep.equal({ count: 6 });
    });
    it('buckets UTC months, converting ISO offsets and BSON dates and excluding invalid/missing dates', async () => {
      const result = await provider.executeReporting(principal, {
        operation: 'time_series',
        recordType: 'rdmp',
        dateHistogram: { field: 'created', interval: 'month', start: '2026-01-01', end: '2027-01-01' },
      });
      expect(result)
        .to.have.property('items')
        .deep.equal(
          ['2026-01', '2026-02', '2026-03', '2026-04'].map((bucket, i) => ({
            dimensions: { bucket },
            metrics: { count: [6, 5, 2, 3][i] },
          }))
        );
    });
    it('deduplicates array values per record and retains empty arrays as a null group', async () => {
      const result = await provider.executeReporting(principal, {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['tags'],
        sort: { by: 'tags', direction: 'asc' },
      });
      expect(result)
        .to.have.property('items')
        .deep.equal([
          { dimensions: { tags: null }, metrics: { count: 7 } },
          { dimensions: { tags: 'ai' }, metrics: { count: 10 } },
          { dimensions: { tags: 'ml' }, metrics: { count: 10 } },
        ]);
    });
    it('reports pagination and empty results explicitly, and returns only authorized IDs for drilldown', async () => {
      const result = await provider.executeReporting(principal, {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty'],
        pagination: { limit: 1, offset: 0 },
      });
      expect(result).to.include({ total: 4, returned: 1, truncated: true });
      const empty = await provider.executeReporting(principal, {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty'],
        filters: [{ field: 'faculty', operator: 'eq', value: 'absent' }],
      });
      expect(empty).to.deep.equal({ total: 0, returned: 0, truncated: false, offset: 0, items: [] });
      const ids = await provider.executeReporting(principal, {
        operation: 'records',
        recordType: 'rdmp',
        filters: [{ field: 'faculty', operator: 'eq', value: 'A' }],
        pagination: { limit: 2, offset: 0 },
      });
      expect(ids).to.deep.equal({ total: 10, returned: 2, truncated: true, offset: 0, items: ['a-0', 'a-1'] });
      expect(
        await provider.executeReporting(principal, {
          operation: 'count',
          recordType: 'rdmp',
          filters: [{ field: 'faculty', operator: 'missing', value: true }],
        })
      ).to.deep.equal({ count: 1 });
    });
  }
);
