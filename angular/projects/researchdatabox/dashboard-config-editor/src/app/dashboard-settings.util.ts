import { DashboardCopyGroup, DashboardCopySelection, DashboardGroupChange, DashboardSettings, DashboardTarget } from './dashboard-config-api.service';

/**
 * Client-side mirror of the copy-group partition in
 * @researchdatabox/redbox-core DashboardSettings.ts. Used for "Copy from", which
 * edits only the local draft; saving revalidates on the server.
 */
export const COPY_GROUPS: Array<{ id: DashboardCopyGroup; label: string; description: string }> = [
  { id: 'columnsAndActions', label: 'Columns and row actions', description: 'Columns, headings, templates, column sorting and named row action rule sets.' },
  { id: 'filtersAndSearch', label: 'Filters, sorting and search', description: 'Record filter, search filter fields, overall sort, search box and stage title visibility.' },
  { id: 'grouping', label: 'Grouping and group rows', description: 'Group by, group levels, group row columns and group row rules.' }
];

export const COPY_GROUP_FIELDS: Record<DashboardCopyGroup, string[]> = {
  columnsAndActions: ['tableConfig.rowConfig', 'tableConfig.rowRulesConfig'],
  filtersAndSearch: ['tableConfig.formatRules.filterBy', 'tableConfig.formatRules.queryFilters', 'tableConfig.formatRules.sortBy', 'searchable', 'showStageTitle'],
  grouping: ['tableConfig.formatRules.groupBy', 'tableConfig.formatRules.sortGroupBy', 'tableConfig.groupRowConfig', 'tableConfig.groupRowRulesConfig']
};

export function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function targetKey(target: DashboardTarget): string {
  return target.kind === 'workflow' ? JSON.stringify(['workflow', target.recordType, target.stage]) : JSON.stringify(['view', target.view, target.step]);
}

export function selectionToGroups(selection: DashboardCopySelection[]): DashboardCopyGroup[] {
  return selection.includes('all') ? COPY_GROUPS.map((g) => g.id) : COPY_GROUPS.map((g) => g.id).filter((id) => selection.includes(id));
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function setPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor = obj;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    delete cursor[last];
  } else {
    cursor[last] = cloneSettings(value);
  }
}

/** Replace exactly the selected groups' fields; everything else stays as in the destination. */
export function applyCopyGroups(source: DashboardSettings, destination: DashboardSettings, groups: DashboardCopyGroup[]): DashboardSettings {
  const result = cloneSettings(destination);
  for (const group of groups) {
    for (const path of COPY_GROUP_FIELDS[group]) {
      setPath(result, path, getPath(source, path));
    }
  }
  return result;
}

function none(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
}

function summarise(value: unknown): string {
  if (none(value)) {
    return '(none)';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function columns(rows: Array<{ title?: string; variable?: string }> | undefined): string {
  return rows && rows.length ? rows.map((r) => r.title || r.variable || '(untitled)').join(', ') : '(none)';
}

function ruleSets(sets: Array<{ ruleSetName: string; rules?: unknown[] }> | undefined): string {
  return sets && sets.length ? sets.map((s) => `${s.ruleSetName} (${(s.rules || []).length} rules)`).join(', ') : '(none)';
}

/** Readable before/after summary for the selected groups. */
export function describeGroupChanges(before: DashboardSettings, after: DashboardSettings, groups: DashboardCopyGroup[]): DashboardGroupChange[] {
  const item = (label: string, b: string, a: string) => ({ label, before: b, after: a, cleared: b !== '(none)' && a === '(none)' });
  return groups.map((group) => {
    const b = before.tableConfig;
    const a = after.tableConfig;
    let items;
    if (group === 'columnsAndActions') {
      items = [item('Columns', columns(b.rowConfig), columns(a.rowConfig)), item('Row action rule sets', ruleSets(b.rowRulesConfig), ruleSets(a.rowRulesConfig))];
    } else if (group === 'filtersAndSearch') {
      items = [
        item('Filter', summarise(b.formatRules.filterBy), summarise(a.formatRules.filterBy)),
        item('Search filters', summarise(b.formatRules.queryFilters), summarise(a.formatRules.queryFilters)),
        item('Overall sort', summarise(b.formatRules.sortBy), summarise(a.formatRules.sortBy)),
        item('Search box', before.searchable ? 'shown' : 'hidden', after.searchable ? 'shown' : 'hidden'),
        item('Stage title', before.showStageTitle ? 'shown' : 'hidden', after.showStageTitle ? 'shown' : 'hidden')
      ];
    } else {
      items = [
        item('Group by', summarise(b.formatRules.groupBy), summarise(a.formatRules.groupBy)),
        item('Group levels', summarise(b.formatRules.sortGroupBy), summarise(a.formatRules.sortGroupBy)),
        item('Group row columns', columns(b.groupRowConfig), columns(a.groupRowConfig)),
        item('Group row rule sets', ruleSets(b.groupRowRulesConfig), ruleSets(a.groupRowRulesConfig))
      ];
    }
    const changed = COPY_GROUP_FIELDS[group].some((path) => JSON.stringify(getPath(before, path) ?? null) !== JSON.stringify(getPath(after, path) ?? null));
    return { group, label: COPY_GROUPS.find((g) => g.id === group)!.label, changed, items };
  });
}
