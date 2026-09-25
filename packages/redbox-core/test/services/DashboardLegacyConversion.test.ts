let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { LegacyCaptureInput, convertLegacyDashboardConfiguration, summariseLegacyConversion } from '../../src/services/DashboardLegacyConversion';
import { getTargetSettings } from '../../src/configmodels/DashboardSettings';

const row = (title: string, variable: string, template = `{{${variable}}}`, extra: Record<string, unknown> = {}) => ({ title, variable, template, ...extra });

function baseInput(): LegacyCaptureInput {
  return {
    recordTypes: [],
    dashboardTypes: [
      {
        name: 'standard',
        formatRules: {
          filterBy: {},
          queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] },
          hideWorkflowStepTitleForRecordType: ['party']
        }
      }
    ],
    overrides: null,
    views: {}
  };
}

const wf = (recordType: string, stage: string) => ({ kind: 'workflow' as const, recordType, stage });

describe('DashboardLegacyConversion', function () {
  it('uses Angular built-in columns when a stage declares no rowConfig (profile only)', function () {
    const input = baseInput();
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft', displayIndex: 1 }] }];
    const result = convertLegacyDashboardConfiguration(input);
    const settings = getTargetSettings(result.data, wf('rdmp', 'draft'))!;
    expect(settings.tableConfig.rowConfig.map((r) => r.title)).to.deep.equal(['Record Title', 'header-ci', 'header-data-manager', 'header-created', 'header-modified']);
    expect(settings.tableConfig.formatRules.queryFilters).to.deep.equal({ rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] });
    expect(result.targets[0].outcome).to.equal('preserved');
  });

  it('keeps raw headings but the compiled template actually rendered, and preserves blank cells from index mismatches', function () {
    const input = baseInput();
    input.recordTypes = [{
      name: 'rdmp',
      steps: [{ name: 'draft', displayIndex: 1, table: { rowConfig: [row('Old heading', 'metadata.title', '{{raw}}'), row('Added', 'metadata.added')] } }]
    }];
    // An override changed the first template and reordered columns; the raw stage table still drove headings.
    input.overrides = { recordTypes: { rdmp: { steps: { draft: { dashboardType: 'standard', tableConfig: { rowConfig: [row('New heading', 'metadata.title', '{{override}}'), row('Other', 'metadata.other')] } } } } } };
    const result = convertLegacyDashboardConfiguration(input);
    const rows = getTargetSettings(result.data, wf('rdmp', 'draft'))!.tableConfig.rowConfig;
    expect(rows.map((r) => r.title)).to.deep.equal(['Old heading', 'Added']);
    expect(rows[0].template).to.equal('{{override}}');
    expect(rows[1].template).to.equal('');
    const codes = result.findings.map((f) => f.code);
    expect(codes).to.include.members(['template-from-compiled-config', 'preserved-empty-template']);
  });

  it('materialises stage-order format-rule leakage per stage and uses the final rules for search controls', function () {
    const input = baseInput();
    input.recordTypes = [{
      name: 'rdmp',
      steps: [
        { name: 'draft', displayIndex: 1 },
        { name: 'review', displayIndex: 2, table: { rowConfig: [row('Title', 'metadata.title')], formatRules: { filterBy: { filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.owner' }, queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Owner', path: 'metadata.owner' }] }] } } } },
        { name: 'published', displayIndex: 3 }
      ]
    }];
    const result = convertLegacyDashboardConfiguration(input);
    const draft = getTargetSettings(result.data, wf('rdmp', 'draft'))!;
    const published = getTargetSettings(result.data, wf('rdmp', 'published'))!;
    expect(draft.tableConfig.formatRules.filterBy).to.deep.equal({});
    // "published" inherited the preceding stage's filter in v5.0.1; it is now its own copy.
    expect(published.tableConfig.formatRules.filterBy).to.deep.equal({ filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.owner' });
    // Search controls read the final shared rules for every stage.
    expect(draft.tableConfig.formatRules.queryFilters!.rdmp[0].filterFields[0].name).to.equal('Owner');
  });

  it('only hides the stage title where it had an effect, and never stores structural fields', function () {
    const input = baseInput();
    input.recordTypes = [{ name: 'party', steps: [{ name: 'draft' }] }];
    const result = convertLegacyDashboardConfiguration(input);
    const settings = getTargetSettings(result.data, wf('party', 'draft'))!;
    expect(settings.showStageTitle).to.equal(false);
    expect(settings.tableConfig.formatRules).to.not.have.property('hideWorkflowStepTitleForRecordType');
    expect(settings.tableConfig.formatRules).to.not.have.property('filterWorkflowStepsBy');
  });

  it('retains workspace context and reports the workspace page rendering differently', function () {
    const input = baseInput();
    input.dashboardTypes.push({ name: 'workspace', formatRules: { filterBy: {}, recordTypeFilterBy: 'existing-locations', filterWorkflowStepsBy: ['existing-locations-draft'], queryFilters: { workspace: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] } } });
    input.recordTypes = [{ name: 'existing-locations', steps: [{ name: 'existing-locations-draft', table: { rowConfig: [row('Name', 'metadata.title')] } }] }];
    const result = convertLegacyDashboardConfiguration(input);
    expect(result.data.contexts.workspace).to.deep.equal({ recordTypeFilterBy: 'existing-locations', filterWorkflowStepsBy: ['existing-locations-draft'] });
    const settings = getTargetSettings(result.data, wf('existing-locations', 'existing-locations-draft'))!;
    // Standard context wins for templates; the workspace search filters are kept under their own key.
    expect(settings.tableConfig.rowConfig[0].template).to.equal('{{metadata.title}}');
    expect(Object.keys(settings.tableConfig.formatRules.queryFilters!)).to.include('workspace');
    const conflict = result.findings.find((f) => f.code === 'context-conflict');
    expect(conflict?.severity).to.equal('resolution');
    expect(result.targets.find((t) => t.target.kind === 'workflow' && t.target.recordType === 'existing-locations')!.outcome).to.equal('needs-resolution');
  });

  it('keeps hidden stages as inactive independent settings', function () {
    const input = baseInput();
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'secret', hidden: true, table: { rowConfig: [row('Only', 'metadata.only')] } }] }];
    const result = convertLegacyDashboardConfiguration(input);
    expect(getTargetSettings(result.data, wf('rdmp', 'secret'))!.tableConfig.rowConfig[0].title).to.equal('Only');
    expect(result.targets[0].outcome).to.equal('inactive');
  });

  it('does not activate an ignored overall sort', function () {
    const input = baseInput();
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft', table: { rowConfig: [row('Title', 'metadata.title')], formatRules: { sortBy: 'metadata.title:1' } } }] }];
    const result = convertLegacyDashboardConfiguration(input);
    expect(getTargetSettings(result.data, wf('rdmp', 'draft'))!.tableConfig.formatRules).to.not.have.property('sortBy');
    expect(result.findings.some((f) => f.code === 'ignored-sort-by')).to.equal(true);
  });

  it('converts custom view steps with their own rules and reports orphaned overrides', function () {
    const input = baseInput();
    input.dashboardTypes.push({ name: 'consolidated', formatRules: { filterBy: { filterBase: 'record', filterBaseFieldOrValue: 'rdmp' } } });
    input.views = {
      consolidated: {
        name: 'consolidated',
        titleLabelKey: 'consolidated',
        dashboardType: 'consolidated',
        sourceRecordType: 'rdmp',
        steps: [{
          name: 'consolidated',
          sourceRecordType: 'rdmp',
          fetchMode: 'allForRecordType',
          dashboardTable: {
            rowConfig: [row('Actions', '', '{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid "actions"}}')],
            rowRulesConfig: [{ ruleSetName: 'actions', applyRuleSet: true, rules: [{ name: 'Edit', action: 'show', renderItemTemplate: 'edit', evaluateRulesTemplate: 'true' }] }],
            formatRules: { groupBy: 'groupedByRecordType', sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }] }
          }
        }]
      }
    };
    input.overrides = { recordTypes: { gone: { steps: { draft: { dashboardType: 'standard' } } } } };
    const result = convertLegacyDashboardConfiguration(input);
    const settings = getTargetSettings(result.data, { kind: 'view', view: 'consolidated', step: 'consolidated' })!;
    expect(settings.searchable).to.equal(false);
    expect(settings.tableConfig.formatRules.groupBy).to.equal('groupedByRecordType');
    // The step declared its own rules, so the profile filter was not used.
    expect(settings.tableConfig.formatRules).to.not.have.property('filterBy');
    expect(settings.tableConfig.rowRulesConfig[0].rules[0].renderItemTemplate).to.equal('edit');
    expect(result.findings.some((f) => f.code === 'orphaned-override')).to.equal(true);
    expect(summariseLegacyConversion(result, 'default')).to.contain('Targets: 1');
  });

  it('is deterministic for the same inputs', function () {
    const input = baseInput();
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft' }] }];
    const a = convertLegacyDashboardConfiguration(input);
    const b = convertLegacyDashboardConfiguration(JSON.parse(JSON.stringify(input)));
    expect(a.inputFingerprint).to.equal(b.inputFingerprint);
    expect(a.data).to.deep.equal(b.data);
  });
});
