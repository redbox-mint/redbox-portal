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

  it('preserves v5.0.1 workflow search availability regardless of DashboardType.searchable', function () {
    for (const searchable of [true, false, undefined]) {
      const input = baseInput();
      input.dashboardTypes[0].searchable = searchable;
      input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft', displayIndex: 1 }] }];

      const result = convertLegacyDashboardConfiguration(input);
      const settings = getTargetSettings(result.data, wf('rdmp', 'draft'))!;

      expect(settings.searchable, `legacy searchable=${String(searchable)}`).to.equal(true);
    }
  });

  it('does not apply a custom profile searchable flag to workflow or view search controls', function () {
    const input = baseInput();
    input.dashboardTypes.push({ name: 'customer-profile', searchable: false, formatRules: { filterBy: {} } });
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft', displayIndex: 1 }] }];
    input.overrides = { recordTypes: { rdmp: { default: { dashboardType: 'customer-profile' } } } };
    input.views = {
      custom: {
        name: 'custom',
        titleLabelKey: 'custom',
        dashboardType: 'customer-profile',
        sourceRecordType: 'rdmp',
        steps: [{ name: 'all', sourceRecordType: 'rdmp', fetchMode: 'allForRecordType', dashboardTable: {} }],
      },
    };

    const result = convertLegacyDashboardConfiguration(input);

    expect(getTargetSettings(result.data, wf('rdmp', 'draft'))!.searchable).to.equal(true);
    expect(getTargetSettings(result.data, { kind: 'view', view: 'custom', step: 'all' })!.searchable).to.equal(false);
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

  it('keeps raw workflow columns while resolving templates through profile and AppConfig override precedence', function () {
    const input = baseInput();
    input.dashboardTypes.push({
      name: 'customer-profile',
      formatRules: { filterBy: {} },
      tableConfig: { rowConfig: [row('Profile heading', 'metadata.title', '{{profile}}')] },
    });
    input.recordTypes = [
      {
        name: 'rdmp',
        steps: [
          {
            name: 'review',
            displayIndex: 2,
            table: {
              rowConfig: [
                row('Raw review heading', 'metadata.title', '{{raw-review}}'),
                row('Raw extra', 'metadata.extra', '{{raw-extra}}'),
              ],
            },
          },
          {
            name: 'draft',
            displayIndex: 1,
            table: {
              rowConfig: [
                row('Raw draft heading', 'metadata.title', '{{raw-draft}}'),
                row('Raw draft extra', 'metadata.extra', '{{raw-extra}}'),
              ],
            },
          },
          { name: 'published', displayIndex: 3 },
        ],
      },
    ];
    input.overrides = {
      recordTypes: {
        rdmp: {
          default: {
            dashboardType: 'customer-profile',
            tableConfig: { rowConfig: [row('Default override heading', 'metadata.title', '{{default-override}}')] },
          },
          steps: {
            review: {
              dashboardType: 'standard',
              tableConfig: { rowConfig: [row('Stage override heading', 'metadata.title', '{{stage-override}}')] },
            },
          },
        },
      },
    };

    const result = convertLegacyDashboardConfiguration(input);
    const draft = getTargetSettings(result.data, wf('rdmp', 'draft'))!;
    const review = getTargetSettings(result.data, wf('rdmp', 'review'))!;
    const published = getTargetSettings(result.data, wf('rdmp', 'published'))!;

    // Angular used the raw workflow table for structure; the server's merged
    // profile/workflow/override configuration supplied only compiled templates.
    expect(draft.tableConfig.rowConfig.map(r => r.title)).to.deep.equal(['Raw draft heading', 'Raw draft extra']);
    expect(draft.tableConfig.rowConfig.map(r => r.template)).to.deep.equal(['{{default-override}}', '']);
    expect(review.tableConfig.rowConfig.map(r => r.title)).to.deep.equal(['Raw review heading', 'Raw extra']);
    expect(review.tableConfig.rowConfig.map(r => r.template)).to.deep.equal(['{{stage-override}}', '']);
    // A stage without a raw table used Angular's built-in row structure.
    expect(published.tableConfig.rowConfig.map(r => r.title)).to.deep.equal([
      'Record Title',
      'header-ci',
      'header-data-manager',
      'header-created',
      'header-modified',
    ]);
    expect(published.tableConfig.rowConfig[0].template).to.equal('{{default-override}}');
    expect(published.tableConfig.rowConfig.slice(1).every(r => r.template === '')).to.equal(true);
  });

  it('reproduces profile-to-stage rule replacement in display order and excludes hidden or filtered stages', function () {
    const input = baseInput();
    const profileFilter = {
      filterBase: 'record',
      filterBaseFieldOrValue: 'profile',
      filterField: 'metadata.owner',
      filterMode: 'equal',
    };
    input.dashboardTypes[0].formatRules = {
      filterBy: profileFilter,
      filterWorkflowStepsBy: ['draft', 'review', 'published'],
      queryFilters: {
        rdmp: [{ filterType: 'text', filterFields: [{ name: 'Profile search', path: 'metadata.owner' }] }],
      },
    };
    input.recordTypes = [
      {
        name: 'rdmp',
        steps: [
          { name: 'published', displayIndex: 7 },
          {
            name: 'filtered',
            displayIndex: 5,
            table: {
              formatRules: {
                filterBy: {
                  filterBase: 'record',
                  filterBaseFieldOrValue: 'filtered',
                  filterField: 'metadata.owner',
                  filterMode: 'equal',
                },
              },
            },
          },
          {
            name: 'secret',
            hidden: true,
            displayIndex: 4,
            table: {
              formatRules: {
                filterBy: {
                  filterBase: 'record',
                  filterBaseFieldOrValue: 'hidden',
                  filterField: 'metadata.owner',
                  filterMode: 'equal',
                },
              },
            },
          },
          {
            name: 'review',
            displayIndex: 3,
            table: {
              rowConfig: [row('Title', 'metadata.title')],
              formatRules: {
                filterBy: {
                  filterBase: 'user',
                  filterBaseFieldOrValue: 'user.email',
                  filterField: 'metadata.owner',
                  filterMode: 'equal',
                },
                queryFilters: {
                  rdmp: [{ filterType: 'text', filterFields: [{ name: 'Owner', path: 'metadata.owner' }] }],
                },
              },
            },
          },
          { name: 'draft', displayIndex: 1 },
        ],
      },
    ];
    const result = convertLegacyDashboardConfiguration(input);
    const draft = getTargetSettings(result.data, wf('rdmp', 'draft'))!;
    const review = getTargetSettings(result.data, wf('rdmp', 'review'))!;
    const published = getTargetSettings(result.data, wf('rdmp', 'published'))!;
    const filtered = getTargetSettings(result.data, wf('rdmp', 'filtered'))!;
    const secret = getTargetSettings(result.data, wf('rdmp', 'secret'))!;

    // Stage A inherits the profile rules. Stage B replaces the whole shared
    // value and Stage C inherits B. Search controls use the final B rules.
    expect(draft.tableConfig.formatRules.filterBy).to.deep.equal(profileFilter);
    expect(review.tableConfig.formatRules.filterBy).to.deep.equal({
      filterBase: 'user',
      filterBaseFieldOrValue: 'user.email',
      filterField: 'metadata.owner',
      filterMode: 'equal',
    });
    expect(published.tableConfig.formatRules.filterBy).to.deep.equal(review.tableConfig.formatRules.filterBy);
    expect(draft.tableConfig.formatRules.queryFilters!.rdmp[0].filterFields[0].name).to.equal('Owner');
    expect(published.tableConfig.formatRules.queryFilters!.rdmp[0].filterFields[0].name).to.equal('Owner');

    // The configured order is displayIndex, not definition-array order. Hidden
    // Hidden and profile-filtered stages follow Stage B by displayIndex, but
    // were removed before initStepTableConfig and therefore cannot replace it.
    expect(filtered.tableConfig.formatRules.filterBy).to.deep.equal({
      filterBase: 'record',
      filterBaseFieldOrValue: 'filtered',
      filterField: 'metadata.owner',
      filterMode: 'equal',
    });
    expect(secret.tableConfig.formatRules.filterBy).to.deep.equal({
      filterBase: 'record',
      filterBaseFieldOrValue: 'hidden',
      filterField: 'metadata.owner',
      filterMode: 'equal',
    });
    expect(result.targets.find(t => t.target.kind === 'workflow' && t.target.stage === 'filtered')!.outcome).to.equal(
      'inactive'
    );
    expect(result.targets.find(t => t.target.kind === 'workflow' && t.target.stage === 'secret')!.outcome).to.equal(
      'inactive'
    );
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
    input.dashboardTypes.push({
      name: 'workspace',
      formatRules: {
        filterBy: {},
        recordTypeFilterBy: 'existing-locations',
        filterWorkflowStepsBy: ['existing-locations-draft'],
        queryFilters: {
          workspace: [
            { filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title', template: '{{value}}' }] },
          ],
        },
      },
    });
    input.recordTypes = [
      {
        name: 'existing-locations',
        steps: [
          { name: 'existing-locations-draft', displayIndex: 1, table: { rowConfig: [row('Name', 'metadata.title')] } },
        ],
      },
    ];
    const result = convertLegacyDashboardConfiguration(input);
    expect(result.data.contexts.workspace).to.deep.equal({ recordTypeFilterBy: 'existing-locations', filterWorkflowStepsBy: ['existing-locations-draft'] });
    const settings = getTargetSettings(result.data, wf('existing-locations', 'existing-locations-draft'))!;
    // Standard rendering resolves the module using the record type; workspace
    // fetches records with an empty record type before its template lookup.
    expect(settings.tableConfig.rowConfig[0].template).to.equal('{{metadata.title}}');
    expect(Object.keys(settings.tableConfig.formatRules.queryFilters!)).to.include('workspace');
    expect(settings.tableConfig.formatRules.queryFilters!.workspace[0].filterFields[0].template).to.equal('');
    expect(settings.tableConfig.formatRules.queryFilters!.workspace[0].filterFields[0].legacyTemplateLookupFailed).to.equal(true);
    const conflict = result.findings.find(f => f.code === 'context-conflict');
    expect(conflict?.severity).to.equal('resolution');
    expect(conflict?.message).to.contain('workspace dashboard');
    expect(conflict?.message).to.contain('cells or actions rendered empty there');
    expect(
      result.targets.find(t => t.target.kind === 'workflow' && t.target.recordType === 'existing-locations')!.outcome
    ).to.equal('needs-resolution');
  });

  it('blocks prototype-polluting keys without treating the ordinary prototype field as magic', function () {
    const input = baseInput();
    const dangerousProfileTable = JSON.parse(
      '{"rowConfig":[{"title":"Profile title","variable":"metadata.title","template":"{{metadata.title}}"}],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"safe":true}}'
    );
    input.dashboardTypes[0].tableConfig = dangerousProfileTable;
    input.recordTypes = [{ name: 'rdmp', steps: [{ name: 'draft', displayIndex: 1 }] }];

    const result = convertLegacyDashboardConfiguration(input);
    const settings = getTargetSettings(result.data, wf('rdmp', 'draft'))!;

    expect(({} as Record<string, unknown>)['polluted']).to.equal(undefined);
    expect(settings.tableConfig.rowConfig[0].template).to.equal('{{metadata.title}}');
    // `prototype` alone is ordinary configuration data: only `__proto__` and
    // the `constructor.prototype` path can affect this recursive merge target.
    expect(Object.getPrototypeOf(settings.tableConfig)).to.equal(Object.prototype);
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
