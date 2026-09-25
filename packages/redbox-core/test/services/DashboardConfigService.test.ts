let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Services, DASHBOARD_CONFIGURATION_MIGRATION_NAME, DASHBOARD_LEGACY_SNAPSHOT_KEY } from '../../src/services/DashboardConfigService';
import { DashboardSettings, fingerprint, normaliseDashboardSettings } from '../../src/configmodels/DashboardSettings';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

type Doc = { id: string; branding: string; revision: number; configData: any; provenance?: any };

/**
 * In-memory stand-in for the DashboardConfiguration model. `update` applies the
 * same revision-conditioned criteria the service relies on.
 */
function createStore() {
  const docs: Doc[] = [];
  let nextId = 1;
  const matches = (doc: Doc, criteria: Record<string, unknown>) => Object.entries(criteria).every(([k, v]) => (doc as any)[k] === v);
  return {
    docs,
    model: {
      findOne: async (criteria: Record<string, unknown>) => {
        const found = docs.find((d) => matches(d, criteria));
        return found ? JSON.parse(JSON.stringify(found)) : undefined;
      },
      create: async (values: Doc) => {
        if (docs.some((d) => d.branding === values.branding)) {
          throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
        }
        docs.push({ ...JSON.parse(JSON.stringify(values)), id: String(nextId++) });
      },
      update: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          fetch: async () => {
            const matched = docs.filter((d) => matches(d, criteria));
            matched.forEach((d) => Object.assign(d, JSON.parse(JSON.stringify(values))));
            return matched;
          }
        })
      })
    }
  };
}

function stageSettings(title: string, extra: Partial<DashboardSettings['tableConfig']['formatRules']> = {}): DashboardSettings {
  return normaliseDashboardSettings({
    searchable: true,
    showStageTitle: true,
    tableConfig: { rowConfig: [{ title, variable: 'metadata.title', template: '{{metadata.title}}' }], formatRules: { ...extra } }
  });
}

describe('DashboardConfigService', function () {
  const brand = { id: 'brand1', name: 'default' } as any;
  const draft = { kind: 'workflow', recordType: 'rdmp', stage: 'draft' } as const;
  const review = { kind: 'workflow', recordType: 'rdmp', stage: 'review' } as const;
  const hidden = { kind: 'workflow', recordType: 'rdmp', stage: 'secret' } as const;
  const other = { kind: 'workflow', recordType: 'dataRecord', stage: 'draft' } as const;
  let service: Services.DashboardConfig;
  let store: ReturnType<typeof createStore>;
  let mockSails: any;

  async function seed(workflows: Record<string, Record<string, DashboardSettings>> = {}) {
    await store.model.create({ id: '', branding: 'brand1', revision: 1, configData: { schemaVersion: 1, workflows, views: {}, contexts: {} } });
  }

  beforeEach(function () {
    mockSails = createMockSails();
    mockSails.config.dashboardview = {
      consolidated: { name: 'consolidated', titleLabelKey: 'consolidated', dashboardType: 'consolidated', sourceRecordType: 'rdmp', steps: [{ name: 'consolidated', sourceRecordType: 'rdmp', fetchMode: 'allForRecordType' }] }
    };
    mockSails.config.dashboardtype = { standard: { formatRules: { filterBy: {} } } };
    mockSails.models = { migration: { findOne: sinon.stub().resolves({ name: DASHBOARD_CONFIGURATION_MIGRATION_NAME }) } };
    setupServiceTestGlobals(mockSails);
    store = createStore();
    (global as any).DashboardConfiguration = store.model;
    (global as any).RecordTypesService = {
      getAll: sinon.stub().returns(of([{ name: 'rdmp', id: 'rt1' }, { name: 'dataRecord', id: 'rt2' }]))
    };
    const steps: Record<string, any[]> = {
      rt1: [{ name: 'draft', config: { displayIndex: 1, workflow: { stageLabel: 'Draft' } } }, { name: 'review', config: { displayIndex: 2 } }, { name: 'secret', hidden: true, config: { displayIndex: 3 } }],
      rt2: [{ name: 'draft', config: { displayIndex: 1 } }]
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordTypeIncludingHidden: sinon.stub().callsFake((rt: any) => of(steps[rt.id]))
    };
    (global as any).BrandingService = { getAvailable: () => ['default'], getBrand: () => brand };
    (global as any).RecordType = { find: sinon.stub().resolves([{ id: 'rt1', name: 'rdmp' }, { id: 'rt2', name: 'dataRecord' }]) };
    (global as any).WorkflowStep = { find: sinon.stub().callsFake(async ({ recordType }: any) => steps[recordType]) };
    (global as any).DashboardType = { find: sinon.stub().resolves([]) };
    (global as any).AppConfig = { find: sinon.stub().resolves([]), findOne: sinon.stub().resolves(undefined), create: sinon.stub().resolves({}) };
    (global as any).BrandingConfig = { find: sinon.stub().resolves([{ id: 'brand1', name: 'default' }]) };
    service = new Services.DashboardConfig();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    for (const name of ['DashboardConfiguration', 'RecordTypesService', 'WorkflowStepsService', 'BrandingService', 'RecordType', 'WorkflowStep', 'DashboardType', 'AppConfig', 'BrandingConfig']) {
      delete (global as any)[name];
    }
    sinon.restore();
  });

  describe('catalogue', function () {
    it('lists hidden stages (flagged) and view steps; saved entries for removed stages are kept aside', async function () {
      await seed({ rdmp: { draft: stageSettings('A'), retired: stageSettings('Old') } });
      const catalogue = await service.getTargetCatalogue(brand);
      const keys = catalogue.targets.map((t) => t.key);
      expect(keys).to.have.length(5);
      expect(catalogue.targets.find((t) => t.target.kind === 'workflow' && t.target.stage === 'secret')!.hidden).to.equal(true);
      expect(catalogue.targets.find((t) => t.target.kind === 'workflow' && t.target.stage === 'draft')!.stepLabel).to.equal('Draft');
      expect(catalogue.removed.map((r) => r.target)).to.deep.equal([{ kind: 'workflow', recordType: 'rdmp', stage: 'retired' }]);
    });

    it('refuses removed or unknown targets', async function () {
      await seed({ rdmp: { retired: stageSettings('Old') } });
      try {
        await service.getTargetSettings(brand, { kind: 'workflow', recordType: 'rdmp', stage: 'retired' });
        expect.fail('should reject');
      } catch (e: any) {
        expect(e.code).to.equal('target-not-found');
        expect(e.status).to.equal(404);
      }
    });

    it('reports unavailable configuration (503) instead of falling back', async function () {
      try {
        await service.getTargetSettings(brand, draft);
        expect.fail('should reject');
      } catch (e: any) {
        expect(e.status).to.equal(503);
      }
    });
  });

  describe('save', function () {
    beforeEach(async function () {
      await seed({ rdmp: { draft: stageSettings('Draft'), review: stageSettings('Review') } });
    });

    it('saves one stage and leaves others unchanged', async function () {
      const next = stageSettings('Changed');
      const saved = await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: next });
      expect(saved.revision).to.equal(2);
      expect(store.docs[0].configData.workflows.rdmp.draft.tableConfig.rowConfig[0].title).to.equal('Changed');
      expect(store.docs[0].configData.workflows.rdmp.review.tableConfig.rowConfig[0].title).to.equal('Review');
    });

    it('stores cleared values as empty rather than restoring defaults', async function () {
      const cleared = normaliseDashboardSettings({ searchable: false, showStageTitle: true, tableConfig: {} });
      await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: cleared });
      const read = await service.getTargetSettings(brand, draft);
      expect(read.settings.tableConfig.rowConfig).to.deep.equal([]);
      expect(read.settings.tableConfig.formatRules).to.deep.equal({});
    });

    it('rejects a stale revision and changes nothing', async function () {
      await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: stageSettings('First') });
      try {
        await service.saveTargetSettings(brand, review, { expectedRevision: 1, settings: stageSettings('Second') });
        expect.fail('should conflict');
      } catch (e: any) {
        expect(e.code).to.equal('stale-revision');
        expect(e.status).to.equal(409);
      }
      expect(store.docs[0].configData.workflows.rdmp.review.tableConfig.rowConfig[0].title).to.equal('Review');
    });

    it('loses cleanly when another writer commits between read and write', async function () {
      const original = store.model.update;
      store.model.update = (criteria: any) => {
        store.docs[0].revision = 5; // A concurrent writer won.
        return original(criteria);
      };
      try {
        await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: stageSettings('Mine') });
        expect.fail('should conflict');
      } catch (e: any) {
        expect(e.code).to.equal('stale-revision');
      }
      expect(store.docs[0].configData.workflows.rdmp.draft.tableConfig.rowConfig[0].title).to.equal('Draft');
    });

    it('requires complete settings and blocks invalid ones', async function () {
      for (const settings of [{ tableConfig: {} }, { ...stageSettings('x'), tableConfig: { ...stageSettings('x').tableConfig, rowConfig: [{ title: 'x', variable: 'y', template: '{{#if}}' }] } }]) {
        try {
          await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings });
          expect.fail('should reject');
        } catch (e: any) {
          expect(e.code).to.equal('invalid-settings');
          expect(e.details.errors.length).to.be.greaterThan(0);
        }
      }
      expect(store.docs[0].revision).to.equal(1);
    });

    it('requires warnings to be acknowledged for the exact reviewed settings', async function () {
      const withWarning = stageSettings('Draft', { sortBy: 'metadata.nope:1' });
      let fingerprintFromServer = '';
      let warningIds: string[] = [];
      try {
        await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: withWarning });
        expect.fail('should require review');
      } catch (e: any) {
        expect(e.code).to.equal('warnings-require-review');
        fingerprintFromServer = e.details.validationFingerprint;
        warningIds = e.details.warnings.map((w: any) => w.id);
      }
      // A different candidate cannot reuse the acknowledgement.
      const different = stageSettings('Other', { sortBy: 'metadata.nope:1' });
      try {
        await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: different, validationFingerprint: fingerprintFromServer, acknowledgedWarningIds: warningIds });
        expect.fail('should require review again');
      } catch (e: any) {
        expect(e.code).to.equal('warnings-require-review');
      }
      const saved = await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: withWarning, validationFingerprint: fingerprintFromServer, acknowledgedWarningIds: warningIds });
      expect(saved.revision).to.equal(2);
    });
  });

  describe('copy', function () {
    beforeEach(async function () {
      await seed({
        rdmp: {
          draft: stageSettings('Source', { filterBy: { filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'owner' } }),
          review: stageSettings('Review', { groupBy: '' }),
          secret: stageSettings('Hidden')
        },
        dataRecord: { draft: stageSettings('Data') }
      });
    });

    it('previews complete candidates and applies all destinations in one write', async function () {
      const preview = await service.previewCopy(brand, { source: draft, destinations: [review, hidden], groups: ['columnsAndActions'] });
      expect(preview.errors).to.deep.equal([]);
      expect(preview.changes).to.have.length(2);
      expect(preview.changes.find((c) => c.label.includes('secret'))!.hidden).to.equal(true);
      const result = await service.applyCopy(brand, { ...preview, groups: ['columnsAndActions'], acknowledgedWarningIds: [] });
      expect(result).to.deep.include({ updated: 2, revision: 2 });
      const data = store.docs[0].configData.workflows.rdmp;
      expect(data.review.tableConfig.rowConfig[0].title).to.equal('Source');
      expect(data.secret.tableConfig.rowConfig[0].title).to.equal('Source');
      // Unselected groups keep destination values.
      expect(data.review.tableConfig.formatRules.filterBy).to.equal(undefined);
    });

    it('creates independent copies: later source edits do not propagate', async function () {
      const preview = await service.previewCopy(brand, { source: draft, destinations: [review], groups: ['all'] });
      await service.applyCopy(brand, { ...preview, groups: ['all'] });
      await service.saveTargetSettings(brand, draft, { expectedRevision: 2, settings: stageSettings('Edited later', { filterBy: { filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'owner' } }) });
      expect(store.docs[0].configData.workflows.rdmp.review.tableConfig.rowConfig[0].title).to.equal('Source');
    });

    it('rejects a stale preview without changing any destination', async function () {
      const preview = await service.previewCopy(brand, { source: draft, destinations: [review, other], groups: ['columnsAndActions'] });
      await service.saveTargetSettings(brand, review, { expectedRevision: 1, settings: stageSettings('Concurrent edit') });
      try {
        await service.applyCopy(brand, { ...preview, groups: ['columnsAndActions'] });
        expect.fail('should conflict');
      } catch (e: any) {
        expect(e.code).to.equal('stale-preview');
      }
      expect(store.docs[0].configData.workflows.rdmp.review.tableConfig.rowConfig[0].title).to.equal('Concurrent edit');
      expect(store.docs[0].configData.workflows.dataRecord.draft.tableConfig.rowConfig[0].title).to.equal('Data');
    });

    it('requires acknowledging warnings, e.g. cross-record-type search filters', async function () {
      await service.saveTargetSettings(brand, draft, {
        expectedRevision: 1,
        settings: stageSettings('Source', { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] } })
      });
      const preview = await service.previewCopy(brand, { source: draft, destinations: [other], groups: ['filtersAndSearch'] });
      expect(preview.warnings.map((w) => w.code)).to.include('query-filter-key');
      try {
        await service.applyCopy(brand, { ...preview, groups: ['filtersAndSearch'] });
        expect.fail('should require acknowledgement');
      } catch (e: any) {
        expect(e.code).to.equal('warnings-require-review');
      }
      const result = await service.applyCopy(brand, { ...preview, groups: ['filtersAndSearch'], acknowledgedWarningIds: preview.warnings.map((w) => w.id) });
      expect(result.updated).to.equal(1);
      // Field paths and keys are not rewritten.
      expect(Object.keys(store.docs[0].configData.workflows.dataRecord.draft.tableConfig.formatRules.queryFilters)).to.deep.equal(['rdmp']);
    });

    it('validates each resulting destination and blocks the whole copy if one is invalid', async function () {
      // A destination whose retained (unselected) columns reference a row rule set only it defines.
      const withRules = stageSettings('Data');
      withRules.tableConfig.rowConfig.push({ title: 'Actions', variable: 'a', template: '{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid "actions"}}' });
      withRules.tableConfig.rowRulesConfig = [{ ruleSetName: 'actions', applyRuleSet: true, rules: [] }];
      store.docs[0].configData.workflows.dataRecord.draft = withRules;
      // Grouping does not touch row rules, so this is valid.
      const grouping = await service.previewCopy(brand, { source: draft, destinations: [review, other], groups: ['grouping'] });
      expect(grouping.errors).to.deep.equal([]);
      // A destination with a stored malformed template makes every destination fail together.
      store.docs[0].configData.workflows.dataRecord.draft.tableConfig.rowConfig[0].template = '{{#each}}';
      const preview = await service.previewCopy(brand, { source: draft, destinations: [review, other], groups: ['grouping'] });
      expect(preview.errors.map((e) => e.code)).to.include('invalid-template');
      try {
        await service.applyCopy(brand, { ...preview, groups: ['grouping'] });
        expect.fail('should block');
      } catch (e: any) {
        expect(e.code).to.equal('invalid-settings');
      }
      expect(store.docs[0].revision).to.equal(1);
    });

    it('rejects self, duplicate and removed destinations', async function () {
      for (const destinations of [[draft], [review, review], [{ kind: 'workflow', recordType: 'rdmp', stage: 'retired' }]]) {
        try {
          await service.previewCopy(brand, { source: draft, destinations, groups: ['grouping'] });
          expect.fail('should reject');
        } catch (e: any) {
          expect(['invalid-request', 'target-not-found']).to.include(e.code);
        }
      }
    });

    it('refuses "All settings" when the source has unclassified fields', async function () {
      store.docs[0].configData.workflows.rdmp.draft.hookOnlyField = true;
      const preview = await service.previewCopy(brand, { source: draft, destinations: [review], groups: ['all'] });
      expect(preview.errors.map((e) => e.code)).to.include('unclassified-field');
      const grouped = await service.previewCopy(brand, { source: draft, destinations: [review], groups: ['columnsAndActions'] });
      expect(grouped.errors).to.deep.equal([]);
    });
  });

  describe('record field catalogue', function () {
    const caller = { user: { username: 'admin', roles: [{ id: 'r', name: 'Admin' }] }, brand } as any;

    beforeEach(async function () {
      await seed({ rdmp: { draft: stageSettings('Draft') } });
      mockSails.services = {
        recordschemaservice: {
          describeStage: sinon.stub().resolves({
            kind: 'resolved',
            completeness: 'complete',
            document: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, owner: { type: 'object', additionalProperties: false, properties: { email: { type: 'string' } } } } }
          })
        }
      };
    });

    it('describes the stage fields from its record schema, plus ReDBox fields', async function () {
      const result = await service.getFieldCatalogue(brand, draft, { caller, portal: 'rdmp' });
      expect(result.status).to.equal('complete');
      expect(result.fields.map((f) => f.path)).to.include.members(['metadata.title', 'metadata.owner.email', 'metaMetadata.lastSaveDate']);
      const request = mockSails.services.recordschemaservice.describeStage.firstCall.args[0];
      expect(request).to.deep.include({ recordType: 'rdmp', targetStep: 'draft', portal: 'rdmp' });
    });

    it('warns about field paths the schema does not describe', async function () {
      const settings = stageSettings('Draft', { filterBy: { filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.ownr.email', filterMode: 'equal' } });
      const result = await service.validateTargetSettings(brand, draft, 1, settings, { caller });
      expect(result.errors).to.deep.equal([]);
      expect(result.warnings.map((w) => w.path)).to.deep.equal(['tableConfig.formatRules.filterBy.filterField']);
    });

    it('never blocks editing when the schema is unavailable', async function () {
      mockSails.services.recordschemaservice.describeStage = sinon.stub().resolves({ kind: 'unavailable', code: 'forbidden' });
      const result = await service.getFieldCatalogue(brand, draft, { caller });
      expect(result.status).to.equal('unavailable');
      expect(result.reason).to.equal('forbidden');
      const validation = await service.validateTargetSettings(brand, draft, 1, stageSettings('Draft', { filterBy: { filterBase: 'record', filterBaseFieldOrValue: 'x', filterField: 'metadata.anything' } }), { caller });
      expect(validation.warnings).to.deep.equal([]);
    });
  });

  describe('runtime', function () {
    it('returns one snapshot with per-target fingerprints and detects changed settings', async function () {
      await seed({ rdmp: { draft: stageSettings('Draft') } });
      const runtime = await service.getRuntimeSettings(brand, 'workflow', 'rdmp');
      expect(runtime.revision).to.equal(1);
      const fp = runtime.targets.draft.fingerprint;
      expect(fp).to.equal(fingerprint(normaliseDashboardSettings(stageSettings('Draft'))));
      expect((await service.getRuntimeTargetSettings(brand, draft, fp))!.fingerprint).to.equal(fp);
      await service.saveTargetSettings(brand, draft, { expectedRevision: 1, settings: stageSettings('New') });
      try {
        await service.getRuntimeTargetSettings(brand, draft, fp);
        expect.fail('should report the change');
      } catch (e: any) {
        expect(e.code).to.equal('settings-changed');
        expect(e.status).to.equal(409);
      }
    });
  });

  describe('initialisation', function () {
    it('creates missing documents after a completed migration and inserts only missing targets', async function () {
      (global as any).WorkflowStep.find = sinon.stub().callsFake(async ({ recordType }: any) => (recordType === 'rt1'
        ? [{ name: 'draft', config: { displayIndex: 1, dashboard: { table: { rowConfig: [{ title: 'Seed', variable: 'metadata.title', template: '{{metadata.title}}' }] } } } }]
        : []));
      await service.initialiseAfterBootstrap();
      expect(service.isReady()).to.equal(true);
      const data = store.docs[0].configData;
      expect(data.workflows.rdmp.draft.tableConfig.rowConfig[0].title).to.equal('Seed');
      expect(data.workflows.rdmp.review).to.not.equal(undefined);
      expect(data.views.consolidated.consolidated).to.not.equal(undefined);

      // Saved settings (even empty) are never replaced by a later hook seed.
      const revision = store.docs[0].revision;
      await service.saveTargetSettings(brand, draft, { expectedRevision: revision, settings: normaliseDashboardSettings({ searchable: true, showStageTitle: true, tableConfig: {} }) });
      await service.initialiseAfterBootstrap();
      expect(store.docs[0].configData.workflows.rdmp.draft.tableConfig.rowConfig).to.deep.equal([]);
    });

    it('is not ready when an existing installation has not been migrated', async function () {
      mockSails.models.migration.findOne = sinon.stub().resolves(undefined);
      await service.initialiseAfterBootstrap();
      expect(service.isReady()).to.equal(false);
      expect(store.docs).to.have.length(0);
    });
  });

  describe('legacy migration', function () {
    it('snapshots, converts and publishes once; reruns leave published settings alone', async function () {
      (global as any).WorkflowStep.find = sinon.stub().callsFake(async ({ recordType }: any) => (recordType === 'rt1' ? [{ name: 'draft', config: { displayIndex: 1 } }] : []));
      await service.migrateLegacyConfiguration();
      expect((global as any).AppConfig.create.firstCall.args[0].configKey).to.equal(DASHBOARD_LEGACY_SNAPSHOT_KEY);
      expect(store.docs).to.have.length(1);
      expect(store.docs[0].provenance.migration.name).to.equal(DASHBOARD_CONFIGURATION_MIGRATION_NAME);

      store.docs[0].configData.workflows.rdmp.draft.searchable = false; // Administrator edit after migration.
      await service.migrateLegacyConfiguration();
      expect(store.docs).to.have.length(1);
      expect(store.docs[0].configData.workflows.rdmp.draft.searchable).to.equal(false);
    });

    it('does not publish a brand with unresolved material differences', async function () {
      (global as any).DashboardType.find = sinon.stub().resolves([
        { name: 'standard', formatRules: { filterBy: {} } },
        { name: 'workspace', formatRules: { filterBy: {}, recordTypeFilterBy: 'rdmp' } }
      ]);
      (global as any).WorkflowStep.find = sinon.stub().callsFake(async ({ recordType }: any) => (recordType === 'rt1' ? [{ name: 'draft', config: { dashboard: { table: { rowConfig: [{ title: 'T', variable: 'metadata.title', template: '{{metadata.title}}' }] } } } }] : []));
      try {
        await service.migrateLegacyConfiguration();
        expect.fail('should stop');
      } catch (e: any) {
        expect(String(e.message)).to.contain('need an explicit resolution');
      }
      expect(store.docs).to.have.length(0);
      // The recovery snapshot was still captured first.
      expect((global as any).AppConfig.create.calledOnce).to.equal(true);
    });

    it('treats a fresh installation (no brands yet) as nothing to migrate', async function () {
      (global as any).BrandingConfig.find = sinon.stub().resolves([]);
      await service.migrateLegacyConfiguration();
      expect(store.docs).to.have.length(0);
    });
  });
});
