import { DashboardSettings } from './dashboard-config-api.service';
import { applyCopyGroups, describeGroupChanges, selectionToGroups } from './dashboard-settings.util';

function settings(columns: string[], formatRules: DashboardSettings['tableConfig']['formatRules'] = {}): DashboardSettings {
  return {
    searchable: true,
    showStageTitle: true,
    tableConfig: {
      rowConfig: columns.map((title) => ({ title, variable: title, template: `{{${title}}}` })),
      rowRulesConfig: [],
      groupRowConfig: [],
      groupRowRulesConfig: [],
      formatRules
    }
  };
}

describe('dashboard settings copy utilities', () => {
  it('replaces only the selected group and clears values missing from the source', () => {
    const source = settings(['Title', 'Updated']);
    const destination = settings(['Title', 'Owner'], { filterBy: { filterBase: 'user' }, groupBy: 'groupedByRecordType' });

    const columns = applyCopyGroups(source, destination, ['columnsAndActions']);
    expect(columns.tableConfig.rowConfig.map((r) => r.title)).toEqual(['Title', 'Updated']);
    expect(columns.tableConfig.formatRules.filterBy).toEqual({ filterBase: 'user' });

    const filters = applyCopyGroups(source, columns, ['filtersAndSearch']);
    expect(filters.tableConfig.formatRules.filterBy).toBeUndefined();
    expect(filters.tableConfig.formatRules.groupBy).toBe('groupedByRecordType');
  });

  it('never shares references with the source', () => {
    const source = settings(['A']);
    const result = applyCopyGroups(source, settings(['B']), ['columnsAndActions']);
    result.tableConfig.rowConfig[0].title = 'changed';
    expect(source.tableConfig.rowConfig[0].title).toBe('A');
  });

  it('expands "all" and describes cleared values', () => {
    expect(selectionToGroups(['all'])).toEqual(['columnsAndActions', 'filtersAndSearch', 'grouping']);
    const changes = describeGroupChanges(settings(['A'], { filterBy: { x: 1 } }), settings(['A']), ['filtersAndSearch']);
    expect(changes[0].items.find((i) => i.label === 'Filter')!.cleared).toBeTrue();
  });
});
