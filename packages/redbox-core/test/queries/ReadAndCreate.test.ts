import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { firstValueFrom } from 'rxjs';
import { RecordAuditReader } from '../../src/queries/RecordAuditReader';
import { RecordAuditParams } from '../../src/RecordAuditParams';
import { Services as Reports } from '../../src/queries/Reports';
import { Services as Workflows } from '../../src/workflows/WorkflowSteps';
import { Services as Workspaces } from '../../src/workspaces/WorkspaceTypes';
import { Services as Queries } from '../../src/queries/NamedQueries';
import { createSinonStubLogger } from '../logger.test';

describe('query reads and creation ownership', () => {
  afterEach(() => sinon.restore());

  it('returns empty filtered audit history without writing or inventing an event', async () => {
    const storage = {
      getMeta: sinon.stub(),
      getRecordAudit: sinon.stub().resolves([]),
      createRecordAudit: sinon.stub(),
    };
    const createAudit = sinon.stub().resolves({});
    const input = { storage, createAudit, log: createSinonStubLogger(sinon), resolveUser: sinon.stub() };
    const reader = new RecordAuditReader(input);
    const params = Object.assign(new RecordAuditParams(), {
      oid: 'record',
      action: 'updated',
      workflowState: 'published',
    });
    assert.deepEqual(await reader.getRecordAudit(params), []);
    assert.equal(createAudit.callCount, 0);
    assert.equal(storage.createRecordAudit.callCount, 0);
    assert.equal(storage.getRecordAudit.callCount, 1);
  });

  it('applies the fallback form to a copy of frozen deployment configuration', async () => {
    const config = Object.freeze({ form: '' });
    const createDefinition = sinon.stub().callsFake(async value => value);
    const service = new Workflows.WorkflowSteps({
      config: { appmode: {}, workflow: { dataset: { draft: { config, starting: true } } } },
      references: { workflows: { listAll: sinon.stub().resolves([]), createDefinition } },
      log: createSinonStubLogger(sinon),
      initialiseDashboardSettings: sinon.stub().resolves(),
    } as any);
    const result = await service.bootstrap([{ id: 'type', name: 'dataset' }]);
    assert.equal(createDefinition.firstCall.args[0].config.form, 'generated-view-only');
    assert.equal((result[0] as any).config.form, 'generated-view-only');
    assert.equal(config.form, '');
    assert.notEqual(createDefinition.firstCall.args[0].config, config);
  });
  for (const kind of ['report', 'workflow', 'workspace']) {
    for (const fails of [false, true]) {
      it(`shares one ${kind} creation ${fails ? 'failure' : 'result'} across subscriptions`, async () => {
        const failure = new Error('creation failed');
        const row = { id: 'created', name: 'draft' };
        const createDefinition = fails ? sinon.stub().rejects(failure) : sinon.stub().resolves(row);
        const log = createSinonStubLogger(sinon);
        const dashboards = sinon.stub().resolves();
        const observable =
          kind === 'report'
            ? new Reports.Reports({ reports: { createDefinition }, log } as any).create(
                { id: 'brand' } as any,
                'report',
                {} as any
              )
            : kind === 'workflow'
              ? new Workflows.WorkflowSteps({
                  references: { workflows: { createDefinition } },
                  initialiseDashboardSettings: dashboards,
                  log,
                } as any).create({ id: 'type' }, 'draft', {}, true)
              : new Workspaces.WorkspaceTypes({
                  references: { workspaceTypes: { createDefinition } },
                  log,
                } as any).create({ id: 'brand' }, { name: 'workspace', label: 'Workspace' });
        if (fails) {
          await assert.rejects(firstValueFrom(observable), error => error === failure);
          await assert.rejects(firstValueFrom(observable), error => error === failure);
        } else {
          const first = await firstValueFrom(observable);
          assert.deepEqual(await firstValueFrom(observable), first);
          if (kind === 'workflow') assert.equal(dashboards.callCount, 1);
        }
        assert.equal(createDefinition.callCount, 1);
      });
    }
  }

  for (const kind of ['report', 'named query']) {
    for (const stage of ['directory', 'json', 'repository']) {
      it(`keeps a safe cause for ${kind} ${stage} bootstrap failures`, async () => {
        const log = createSinonStubLogger(sinon);
        const secret = 'private-bootstrap-value';
        const error = Object.assign(new Error(secret), { code: stage === 'directory' ? 'EACCES' : 'P2002' });
        const files = {
          readdir:
            stage === 'directory'
              ? sinon.stub().rejects(error)
              : sinon.stub().resolves([{ name: 'fixture.json', isFile: () => true }]),
          readFile: sinon
            .stub()
            .resolves(stage === 'json' ? secret : JSON.stringify({ title: 'Report', collectionName: 'record' })),
        };
        const definitions = { findByKey: sinon.stub().rejects(error) };
        const service =
          kind === 'report'
            ? new Reports.Reports({ reports: definitions, config: {}, log } as any)
            : new Queries.NamedQueryService({ queries: definitions, config: {}, log } as any);
        sinon.stub(service as any, 'getBootstrapFileOps').returns(files);
        await service.bootstrapData({ id: 'brand' } as any);
        const diagnostic = JSON.stringify(log.error.args);
        assert.ok(diagnostic.includes(stage === 'directory' ? 'EACCES' : stage === 'json' ? 'invalid-json' : 'P2002'));
        assert.ok(!diagnostic.includes(secret));
      });
    }
  }
});
