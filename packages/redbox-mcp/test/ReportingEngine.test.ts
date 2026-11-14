import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import {
  BrandingModel,
  RoleModel,
  UserModel,
  ReportingService,
  MongoReportingProvider,
  reportingPrincipal,
  resolveReportingRegistry,
  recordHasAccess,
  reporting,
  type RecordTypeConfig,
  type RecordModel,
} from '@researchdatabox/redbox-core';
import { createReportingMcpServer } from '../src/server';

(process.env.REDBOX_REPORTING_MONGO_URL ? describe : describe.skip)(
  'MCP over the real ReportingService and Mongo provider',
  function () {
    this.timeout(15000);
    it('demonstrates direct, count, group, time series and permission-safe record drilldown with the standard client', async () => {
      const connection = await MongoClient.connect(process.env.REDBOX_REPORTING_MONGO_URL!);
      const database = connection.db(`redbox_mcp_test_${randomUUID().replaceAll('-', '')}`);
      const collection = database.collection<RecordModel>('record');
      const brand = Object.assign(new BrandingModel(), { id: 'brand-a', name: 'a' });
      const role = Object.assign(new RoleModel(), { id: 'researcher-a', name: 'Researcher', branding: brand });
      brand.roles = [role];
      const user = Object.assign(new UserModel(), { id: 'alice-id', username: 'alice', type: 'oidc', roles: [role] });
      const principal = reportingPrincipal(brand, user);
      const types: RecordTypeConfig = {
        rdmp: {
          packageType: 'rdmp',
          reporting: {
            enabled: true,
            allowedRoles: ['Researcher'],
            forms: ['rdmp-view'],
            searchCore: 'default',
            searchFullTextVisibleToAllReportingRoles: true,
            fields: [
              {
                id: 'created',
                label: 'Created',
                path: 'metaMetadata.createdOn',
                type: 'date',
                operations: ['filter', 'histogram', 'read'],
              },
              {
                id: 'faculty',
                label: 'Faculty',
                path: 'metadata.faculty',
                type: 'category',
                operations: ['filter', 'group', 'read'],
              },
              {
                id: 'workflowStage',
                label: 'Stage',
                path: 'workflow.stage',
                type: 'category',
                operations: ['filter', 'group', 'read'],
              },
            ],
          },
        },
      };
      const registry = (actor: typeof principal, recordType: string) =>
        resolveReportingRegistry(
          actor,
          recordType,
          { ...reporting, enabled: true },
          types,
          async () => new Set(['metadata.faculty'])
        );
      const provider = new MongoReportingProvider(collection, registry);
      const service = new ReportingService.Services.Reporting({
        registry,
        provider: () => provider,
        records: {
          getMeta: async oid => (await collection.findOne({ redboxOid: oid }))!,
          hasViewAccess: (activeBrand, actor, roles, record) =>
            recordHasAccess(
              activeBrand as typeof brand,
              String(actor.username),
              roles as typeof principal.roles,
              record
            ),
        },
        project: async (_actor, record) => ({ faculty: record.metadata.faculty }),
        search: async () => ['visible', 'hidden'],
      });
      const document: RecordModel = {
        redboxOid: 'visible',
        id: 'visible',
        harvestId: '',
        dateCreated: '',
        lastSaveDate: '',
        metaMetadata: {
          brandId: brand.id,
          type: 'rdmp',
          form: 'rdmp-view',
          createdBy: 'alice',
          searchCore: 'default',
          attachmentFields: [],
          createdOn: '2026-01-01T00:00:00Z',
        },
        metadata: { faculty: 'Faculty A', private: 'private-value' },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: {
          view: ['alice'],
          edit: [],
          viewRoles: [],
          editRoles: [],
          viewPending: [],
          editPending: [],
          stored: { edit: [], view: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] },
        },
      };
      await collection.insertMany([
        document,
        { ...document, redboxOid: 'hidden', authorization: { ...document.authorization, view: ['bob'] } },
        { ...document, redboxOid: 'foreign', metaMetadata: { ...document.metaMetadata, brandId: 'brand-b' } },
      ]);
      const server = createReportingMcpServer(service, async () => principal);
      const client = new Client({ name: 'reporting-engine-test', version: '1.0' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      try {
        assert.deepEqual(await service.count(principal, { recordType: 'rdmp' }), { count: 1 });
        await server.connect(b);
        await client.connect(a);
        const count = await client.callTool({
          name: 'count_records',
          arguments: {
            recordType: 'rdmp',
            filters: [{ field: 'created', operator: 'between', start: '2026-01-01', end: '2027-01-01' }],
          },
        });
        assert.deepEqual(count.structuredContent, { count: 1 });
        const group = await client.callTool({
          name: 'group_records',
          arguments: { recordType: 'rdmp', groupBy: ['faculty'] },
        });
        assert.deepEqual(Reflect.get(group.structuredContent as object, 'items'), [
          { dimensions: { faculty: 'Faculty A' }, metrics: { count: 1 } },
        ]);
        const histogram = await client.callTool({
          name: 'time_series',
          arguments: {
            recordType: 'rdmp',
            dateHistogram: { field: 'created', interval: 'month', start: '2026-01-01', end: '2027-01-01' },
          },
        });
        assert.deepEqual(Reflect.get(histogram.structuredContent as object, 'items'), [
          { dimensions: { bucket: '2026-01' }, metrics: { count: 1 } },
        ]);
        const list = await client.callTool({
          name: 'list_records',
          arguments: { recordType: 'rdmp', filters: [{ field: 'faculty', operator: 'eq', value: 'Faculty A' }] },
        });
        assert.equal(Reflect.get(list.structuredContent as object, 'returned'), 1);
        const record = await client.callTool({ name: 'get_record', arguments: { recordType: 'rdmp', oid: 'visible' } });
        assert.ok(!JSON.stringify(record).includes('private-value'));
        const denied = await client.callTool({ name: 'get_record', arguments: { recordType: 'rdmp', oid: 'hidden' } });
        assert.equal(denied.isError, true);
        const search = await client.callTool({
          name: 'search_records',
          arguments: { recordType: 'rdmp', text: 'machine learning' },
        });
        assert.equal(Reflect.get(search.structuredContent as object, 'returned'), 1);
        assert.equal(Reflect.get(search.structuredContent as object, 'truncated'), null);
      } finally {
        await client.close();
        await server.close();
        await database.dropDatabase();
        await connection.close();
      }
    });
  }
);
