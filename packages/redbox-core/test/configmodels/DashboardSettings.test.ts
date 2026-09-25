let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import {
  DashboardSettings,
  DashboardTarget,
  applyCopyGroups,
  builtInDashboardSettings,
  describeGroupChanges,
  emptyDashboardConfigurationData,
  findSourceSpecificReferences,
  fingerprint,
  getTargetSettings,
  normaliseCopySelection,
  normaliseDashboardSettings,
  parseDashboardTarget,
  setTargetSettings,
  targetKey,
  validateDashboardSettings
} from '../../src/configmodels/DashboardSettings';

const target: DashboardTarget = { kind: 'workflow', recordType: 'rdmp', stage: 'draft' };
const ctx = { target, queryFilterKeys: ['rdmp'] };

function settings(overrides: { rows?: string[]; filter?: Record<string, unknown>; groupBy?: string; rowRules?: DashboardSettings['tableConfig']['rowRulesConfig'] } = {}): DashboardSettings {
  return normaliseDashboardSettings({
    searchable: true,
    showStageTitle: true,
    tableConfig: {
      rowConfig: (overrides.rows ?? ['Title']).map((title) => ({ title, variable: `metadata.${title.toLowerCase()}`, template: `{{metadata.${title.toLowerCase()}}}` })),
      rowRulesConfig: overrides.rowRules ?? [],
      formatRules: {
        ...(overrides.filter ? { filterBy: overrides.filter } : {}),
        ...(overrides.groupBy ? { groupBy: overrides.groupBy, sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }] } : {})
      }
    }
  });
}

describe('DashboardSettings', function () {
  describe('normaliseDashboardSettings', function () {
    it('adds required containers without inventing columns or filters', function () {
      const result = normaliseDashboardSettings({ searchable: false, showStageTitle: false, tableConfig: {} });
      expect(result.tableConfig).to.deep.equal({ rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} });
      expect(result.searchable).to.equal(false);
    });

    it('preserves unknown extension fields in round trips', function () {
      const result = normaliseDashboardSettings({ searchable: true, showStageTitle: true, hookField: 1, tableConfig: { rowConfig: [], custom: { a: 1 } } });
      expect(result.hookField).to.equal(1);
      expect(result.tableConfig.custom).to.deep.equal({ a: 1 });
    });

    it('built-in settings are only a starting value', function () {
      expect(builtInDashboardSettings().tableConfig.rowConfig).to.have.length(5);
    });
  });

  describe('target identity', function () {
    it('never collides across kinds, owners or unescaped separators', function () {
      const keys = new Set([
        targetKey({ kind: 'workflow', recordType: 'a__b', stage: 'c' }),
        targetKey({ kind: 'workflow', recordType: 'a', stage: 'b__c' }),
        targetKey({ kind: 'view', view: 'a__b', step: 'c' }),
        targetKey({ kind: 'workflow', recordType: 'dataRecord', stage: 'draft' }),
        targetKey({ kind: 'workflow', recordType: 'rdmp', stage: 'draft' })
      ]);
      expect(keys.size).to.equal(5);
    });

    it('stores same stage names under different record types independently', function () {
      const data = emptyDashboardConfigurationData();
      setTargetSettings(data, { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, settings({ rows: ['A'] }));
      setTargetSettings(data, { kind: 'workflow', recordType: 'dataRecord', stage: 'draft' }, settings({ rows: ['B'] }));
      setTargetSettings(data, { kind: 'view', view: 'rdmp', step: 'draft' }, settings({ rows: ['C'] }));
      expect(getTargetSettings(data, { kind: 'workflow', recordType: 'rdmp', stage: 'draft' })!.tableConfig.rowConfig[0].title).to.equal('A');
      expect(getTargetSettings(data, { kind: 'workflow', recordType: 'dataRecord', stage: 'draft' })!.tableConfig.rowConfig[0].title).to.equal('B');
      expect(getTargetSettings(data, { kind: 'view', view: 'rdmp', step: 'draft' })!.tableConfig.rowConfig[0].title).to.equal('C');
      expect(getTargetSettings(data, { kind: 'workflow', recordType: 'rdmp', stage: 'constructor' })).to.equal(undefined);
    });

    it('parses only well-formed targets', function () {
      expect(parseDashboardTarget({ kind: 'workflow', recordType: ' rdmp ', stage: 'draft' })).to.deep.equal({ kind: 'workflow', recordType: 'rdmp', stage: 'draft' });
      expect(parseDashboardTarget({ kind: 'workflow', recordType: 'rdmp' })).to.equal(null);
      expect(parseDashboardTarget({ kind: 'brand', brand: 'other' })).to.equal(null);
    });
  });

  describe('copy groups', function () {
    it('replaces exactly the selected group (design example)', function () {
      const source = settings({ rows: ['Title', 'Updated'] });
      const destination = settings({ rows: ['Title', 'Owner'], filter: { filterBase: 'user', filterField: 'owner' }, groupBy: 'groupedByRecordType' });

      const afterColumns = applyCopyGroups(source, destination, ['columnsAndActions']);
      expect(afterColumns.tableConfig.rowConfig.map((r) => r.title)).to.deep.equal(['Title', 'Updated']);
      expect(afterColumns.tableConfig.formatRules.filterBy).to.deep.equal({ filterBase: 'user', filterField: 'owner' });
      expect(afterColumns.tableConfig.formatRules.groupBy).to.equal('groupedByRecordType');

      const afterFilters = applyCopyGroups(source, afterColumns, ['filtersAndSearch']);
      expect(afterFilters.tableConfig.formatRules.filterBy).to.equal(undefined);
      expect(afterFilters.tableConfig.formatRules.groupBy).to.equal('groupedByRecordType');
      expect(afterFilters.tableConfig.rowConfig.map((r) => r.title)).to.deep.equal(['Title', 'Updated']);
    });

    it('copying filters does not replace grouping held in the same format rules object', function () {
      const source = settings({ filter: { filterBase: 'record', filterBaseFieldOrValue: 'x' } });
      const destination = settings({ groupBy: 'groupedByRelationships' });
      const result = applyCopyGroups(source, destination, ['filtersAndSearch']);
      expect(result.tableConfig.formatRules.groupBy).to.equal('groupedByRelationships');
      expect(result.tableConfig.formatRules.sortGroupBy).to.have.length(1);
    });

    it('copies empty values as clears and never shares references', function () {
      const source = settings({ rows: [] });
      const destination = settings({ rows: ['A'], rowRules: [{ ruleSetName: 'r', applyRuleSet: true, rules: [] }] });
      const result = applyCopyGroups(source, destination, ['columnsAndActions']);
      expect(result.tableConfig.rowConfig).to.deep.equal([]);
      expect(result.tableConfig.rowRulesConfig).to.deep.equal([]);

      const copied = applyCopyGroups(settings({ rows: ['X'] }), destination, ['columnsAndActions']);
      expect(copied.tableConfig.rowConfig).to.not.equal(settings({ rows: ['X'] }).tableConfig.rowConfig);
    });

    it('expands "all" and rejects unknown groups', function () {
      expect(normaliseCopySelection(['all'])).to.deep.equal(['columnsAndActions', 'filtersAndSearch', 'grouping']);
      expect(normaliseCopySelection(['grouping', 'columnsAndActions'])).to.deep.equal(['columnsAndActions', 'grouping']);
      expect(normaliseCopySelection(['everything'])).to.equal(null);
      expect(normaliseCopySelection([])).to.equal(null);
    });

    it('describes cleared values in readable differences', function () {
      const changes = describeGroupChanges(settings({ filter: { filterBase: 'user' } }), settings(), ['filtersAndSearch']);
      const filter = changes[0].items.find((i) => i.label === 'Filter')!;
      expect(changes[0].changed).to.equal(true);
      expect(filter.cleared).to.equal(true);
    });
  });

  describe('validateDashboardSettings', function () {
    it('accepts valid settings', function () {
      expect(validateDashboardSettings(settings(), ctx)).to.deep.equal([]);
    });

    it('blocks malformed templates, bad enums and duplicate rule sets', function () {
      const bad = settings({ rowRules: [{ ruleSetName: 'a', applyRuleSet: true, rules: [] }, { ruleSetName: 'a', applyRuleSet: true, rules: [] }] });
      bad.tableConfig.rowConfig[0].template = '{{#if x}}unclosed';
      (bad.tableConfig.rowConfig[0] as any).initialSort = 'sideways';
      const codes = validateDashboardSettings(bad, ctx).filter((f) => f.severity === 'error').map((f) => f.code);
      expect(codes).to.include.members(['invalid-template', 'invalid-enum', 'duplicate-rule-set']);
    });

    it('blocks a literal reference to a missing rule set and warns on dynamic references', function () {
      const s = settings();
      s.tableConfig.rowConfig.push({ title: 'Actions', variable: '', template: '{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid "missing"}}' });
      s.tableConfig.rowConfig.push({ title: 'Dynamic', variable: 'd', template: '{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid ruleName}}' });
      const findings = validateDashboardSettings(s, ctx);
      expect(findings.find((f) => f.code === 'missing-rule-set')?.severity).to.equal('error');
      expect(findings.find((f) => f.code === 'dynamic-rule-set')?.severity).to.equal('warning');

      s.tableConfig.rowRulesConfig = [{ ruleSetName: 'missing', applyRuleSet: true, rules: [] }];
      expect(validateDashboardSettings(s, ctx).some((f) => f.code === 'missing-rule-set')).to.equal(false);
    });

    it('rejects structural profile fields and warns about search filters for another record type', function () {
      const s = settings();
      s.tableConfig.formatRules.filterWorkflowStepsBy = ['draft'];
      s.tableConfig.formatRules.queryFilters = { dataRecord: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] };
      const findings = validateDashboardSettings(s, ctx);
      expect(findings.find((f) => f.code === 'structural-field')?.severity).to.equal('error');
      expect(findings.find((f) => f.code === 'query-filter-key')?.severity).to.equal('warning');
    });

    it('requires complete filters, well-formed sorts and complete group levels', function () {
      const s = settings({ filter: { filterBase: 'user', filterField: '' } });
      s.tableConfig.formatRules.sortBy = 'metadata.title';
      s.tableConfig.formatRules.groupBy = 'groupedByRelationships';
      s.tableConfig.formatRules.sortGroupBy = [{ rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metaMetadata.type' }, { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metaMetadata.type' }];
      const errors = validateDashboardSettings(s, ctx).filter((f) => f.severity === 'error').map((f) => f.path);
      expect(errors).to.include.members([
        'tableConfig.formatRules.filterBy.filterField',
        'tableConfig.formatRules.filterBy.filterBaseFieldOrValue',
        'tableConfig.formatRules.sortBy',
        'tableConfig.formatRules.sortGroupBy[1].relatedTo'
      ]);
      expect(errors).to.not.include('tableConfig.formatRules.sortGroupBy[0].relatedTo');
    });

    it('produces stable finding ids for the same target and path', function () {
      const s = settings();
      s.tableConfig.formatRules.sortBy = 'metadata.unknown:-1';
      const a = validateDashboardSettings(s, ctx);
      const b = validateDashboardSettings(s, ctx);
      expect(a[0].id).to.equal(b[0].id);
      const other = validateDashboardSettings(s, { target: { kind: 'workflow', recordType: 'rdmp', stage: 'review' }, queryFilterKeys: ['rdmp'] });
      expect(other[0].id).to.not.equal(a[0].id);
    });
  });

  it('warns when copied groups mention the source record type', function () {
    const source = settings();
    source.tableConfig.rowConfig[0].template = "<a href='/record/rdmp/{{oid}}'>x</a>";
    const findings = findSourceSpecificReferences(target, { kind: 'workflow', recordType: 'dataRecord', stage: 'draft' }, source, ['columnsAndActions'], 'rdmp', 'dataRecord');
    expect(findings).to.have.length(1);
    expect(findings[0].code).to.equal('source-specific-reference');
    expect(findSourceSpecificReferences(target, target, source, ['columnsAndActions'], 'rdmp', 'rdmp')).to.deep.equal([]);
  });

  it('fingerprints are independent of key order', function () {
    expect(fingerprint({ a: 1, b: { c: 2, d: 3 } })).to.equal(fingerprint({ b: { d: 3, c: 2 }, a: 1 }));
    expect(fingerprint({ a: 1 })).to.not.equal(fingerprint({ a: 2 }));
  });
});
