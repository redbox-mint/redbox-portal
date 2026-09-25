import { FiltersEditorComponent } from './filters-editor.component';
import { GroupingEditorComponent } from './grouping-editor.component';
import { DashboardFormatRules } from '../dashboard-config-api.service';

function init<T extends { ngOnChanges: (c: any) => void }>(component: T): T {
  component.ngOnChanges({ formatRules: {} as any, queryFilterKeys: {} as any });
  return component;
}

describe('FiltersEditorComponent', () => {
  it('builds a signed-in-person filter without JSON', () => {
    const rules: DashboardFormatRules = {};
    const editor = init(Object.assign(new FiltersEditorComponent(), { formatRules: rules }));
    editor.filterKind = 'user';
    editor.onFilterKindChange();
    editor.filterField = 'metadata.contributor_ci.email';
    editor.emitFilter();
    expect(rules.filterBy).toEqual({ filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.contributor_ci.email', filterMode: 'equal' });
    expect(editor.filterComplete).toBeTrue();

    editor.filterKind = 'none';
    editor.emitFilter();
    expect(rules.filterBy).toBeUndefined();
  });

  it('reads and writes the overall sort as field and direction', () => {
    const rules: DashboardFormatRules = { sortBy: 'metaMetadata.createdOn:1' };
    const editor = init(Object.assign(new FiltersEditorComponent(), { formatRules: rules }));
    expect(editor.sortField).toBe('metaMetadata.createdOn');
    expect(editor.sortDirection).toBe('1');
    editor.sortDirection = '-1';
    editor.emitSort();
    expect(rules.sortBy).toBe('metaMetadata.createdOn:-1');
    editor.sortField = '';
    editor.emitSort();
    expect(rules.sortBy).toBeUndefined();
  });

  it('edits search fields for the page key and keeps entries it does not manage', () => {
    const other = { filterType: 'date', filterFields: [{ name: 'Created', path: 'metaMetadata.createdOn' }] };
    const rules: DashboardFormatRules = { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }, other], party: [] } };
    const editor = init(Object.assign(new FiltersEditorComponent(), { formatRules: rules, queryFilterKeys: ['rdmp'] }));
    expect(editor.searchGroups.map((g) => [g.key, g.expected])).toEqual([['rdmp', true], ['party', false]]);
    const group = editor.searchGroups[0];
    editor.addField(group);
    group.fields[1].name = 'Owner';
    group.fields[1].path = 'metadata.owner';
    editor.emitSearch();
    expect((rules.queryFilters as any).rdmp).toEqual([{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }, { name: 'Owner', path: 'metadata.owner' }] }, other]);
    expect((rules.queryFilters as any).party).toBeUndefined();
  });
});

describe('GroupingEditorComponent', () => {
  it('builds relationship levels with record types, links and row levels', () => {
    const rules: DashboardFormatRules = {};
    const editor = init(Object.assign(new GroupingEditorComponent(), { formatRules: rules, recordTypes: ['dataRecord', 'rdmp'] }));
    editor.groupBy = 'groupedByRelationships';
    editor.onGroupByChange();
    editor.add();
    editor.levels[0].compareFieldValue = 'rdmp';
    editor.add();
    editor.levels[1].compareFieldValue = 'dataRecord';
    editor.levels[1].relatedTo = 'metadata.metadata.rdmp.oid';
    editor.emit();
    expect(rules.groupBy).toBe('groupedByRelationships');
    expect(rules.sortGroupBy).toEqual([
      { rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metadata.metaMetadata.type', relatedTo: '' },
      { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metadata.metaMetadata.type', relatedTo: 'metadata.metadata.rdmp.oid' }
    ]);
    editor.move(1, -1);
    expect((rules.sortGroupBy as any)[0].compareFieldValue).toBe('dataRecord');
    expect((rules.sortGroupBy as any)[0].rowLevel).toBe(0);
  });

  it('flags incomplete levels and clears grouping cleanly', () => {
    const rules: DashboardFormatRules = { groupBy: 'groupedByRelationships', sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }, { rowLevel: 1, compareFieldValue: '' }] };
    const editor = init(Object.assign(new GroupingEditorComponent(), { formatRules: rules }));
    expect(editor.levelProblems(editor.levels[1], 1).length).toBe(2);
    editor.groupBy = '';
    editor.levels = [];
    editor.emit();
    expect(rules.groupBy).toBeUndefined();
    expect(rules.sortGroupBy).toBeUndefined();
  });
});
