import * as crypto from 'crypto';
import * as Handlebars from 'handlebars';

/**
 * Independent dashboard settings.
 *
 * Every workflow stage and custom dashboard-view step owns one complete
 * `DashboardSettings` object. There is no profile, default or override layer:
 * an empty value means "empty" and never triggers a lookup elsewhere.
 *
 * The functions in this module are pure so that normalisation, copying and
 * validation can be unit tested without Sails.
 */

export type DashboardTarget =
  | { kind: 'workflow'; recordType: string; stage: string }
  | { kind: 'view'; view: string; step: string };

export type DashboardTargetKind = DashboardTarget['kind'];

export interface DashboardSettingsRowConfig {
  title: string;
  variable: string;
  template: string;
  initialSort?: 'asc' | 'desc';
  defaultSort?: boolean;
  secondarySort?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsRule {
  name: string;
  action: 'show' | 'hide';
  mode?: 'all' | 'alo';
  renderItemTemplate: string;
  evaluateRulesTemplate?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsRuleSet {
  ruleSetName: string;
  applyRuleSet: boolean;
  type?: string;
  separator?: string;
  mode?: 'all' | 'alo';
  rules: DashboardSettingsRule[];
  [extra: string]: unknown;
}

export interface DashboardSettingsFilterField {
  name: string;
  path: string;
  template?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsQueryFilter {
  filterType: string;
  filterFields: DashboardSettingsFilterField[];
  [extra: string]: unknown;
}

export interface DashboardSettingsFilterBy {
  filterBase?: 'user' | 'record';
  filterBaseFieldOrValue?: string;
  filterField?: string;
  filterMode?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsSortGroupBy {
  rowLevel: number;
  compareFieldValue?: string;
  compareField?: string;
  relatedTo?: string;
  [extra: string]: unknown;
}

export interface StageDashboardFormatRules {
  filterBy?: DashboardSettingsFilterBy;
  queryFilters?: Record<string, DashboardSettingsQueryFilter[]>;
  sortBy?: string;
  groupBy?: string;
  sortGroupBy?: DashboardSettingsSortGroupBy[];
  [extra: string]: unknown;
}

export interface DashboardSettingsTableConfig {
  rowConfig: DashboardSettingsRowConfig[];
  rowRulesConfig: DashboardSettingsRuleSet[];
  groupRowConfig: DashboardSettingsRowConfig[];
  groupRowRulesConfig: DashboardSettingsRuleSet[];
  formatRules: StageDashboardFormatRules;
  [extra: string]: unknown;
}

export interface DashboardSettings {
  searchable: boolean;
  showStageTitle: boolean;
  tableConfig: DashboardSettingsTableConfig;
  [extra: string]: unknown;
}

/**
 * Read-only structural context for a dashboard mode (for example `workspace`).
 * Materialised once from retired dashboard profiles. It is not copyable and is
 * not part of any stage's settings.
 */
export interface DashboardModeContext {
  recordTypeFilterBy?: string;
  filterWorkflowStepsBy?: string[];
}

export interface DashboardConfigurationData {
  schemaVersion: 1;
  workflows: Record<string, Record<string, DashboardSettings>>;
  views: Record<string, Record<string, DashboardSettings>>;
  contexts: Record<string, DashboardModeContext>;
}

export const DASHBOARD_CONFIGURATION_SCHEMA_VERSION = 1 as const;

export const DASHBOARD_COPY_GROUPS = ['columnsAndActions', 'filtersAndSearch', 'grouping'] as const;
export type DashboardCopyGroup = (typeof DASHBOARD_COPY_GROUPS)[number];
export type DashboardCopySelection = DashboardCopyGroup | 'all';

export const DASHBOARD_COPY_GROUP_LABELS: Record<DashboardCopySelection, string> = {
  columnsAndActions: 'Columns and row actions',
  filtersAndSearch: 'Filters, sorting and search',
  grouping: 'Grouping and group rows',
  all: 'All settings'
};

/**
 * Explicit ownership of every classified field. Paths are relative to a
 * `DashboardSettings` object. Copying a group replaces exactly these paths.
 */
export const DASHBOARD_COPY_GROUP_FIELDS: Record<DashboardCopyGroup, string[]> = {
  columnsAndActions: ['tableConfig.rowConfig', 'tableConfig.rowRulesConfig'],
  filtersAndSearch: [
    'tableConfig.formatRules.filterBy',
    'tableConfig.formatRules.queryFilters',
    'tableConfig.formatRules.sortBy',
    'searchable',
    'showStageTitle'
  ],
  grouping: [
    'tableConfig.formatRules.groupBy',
    'tableConfig.formatRules.sortGroupBy',
    'tableConfig.groupRowConfig',
    'tableConfig.groupRowRulesConfig'
  ]
};

const KNOWN_SETTINGS_FIELDS = new Set(['searchable', 'showStageTitle', 'tableConfig']);
const KNOWN_TABLE_FIELDS = new Set(['rowConfig', 'rowRulesConfig', 'groupRowConfig', 'groupRowRulesConfig', 'formatRules']);
const KNOWN_FORMAT_RULE_FIELDS = new Set(['filterBy', 'queryFilters', 'sortBy', 'groupBy', 'sortGroupBy']);

/** Legacy profile fields that describe structure, not a stage's editable settings. */
export const STRUCTURAL_FORMAT_RULE_FIELDS = ['recordTypeFilterBy', 'filterWorkflowStepsBy', 'hideWorkflowStepTitleForRecordType'];

export const GROUP_BY_VALUES = ['', 'groupedByRelationships', 'groupedByRecordType'];

/**
 * Built-in starting columns. Applied only when initialising a target that has
 * no hook-provided settings; never merged into existing settings at read time.
 */
export function builtInDashboardRowConfig(): DashboardSettingsRowConfig[] {
  return [
    {
      title: 'Record Title',
      variable: 'metadata.title',
      template: `<a href='{{rootContext}}/{{branding}}/{{portal}}/record/view/{{oid}}'>{{metadata.title}}</a>
            <span class="dashboard-controls">
              {{#if hasEditAccess}}
                <a href='{{rootContext}}/{{branding}}/{{portal}}/record/edit/{{oid}}' aria-label='{{t "edit-link-label"}}'><i class="fa fa-pencil" aria-hidden="true"></i></a>
              {{/if}}
            </span>
          `,
      initialSort: 'desc'
    },
    {
      title: 'header-ci',
      variable: 'metadata.contributor_ci.text_full_name',
      template: '{{#if metadata.contributor_ci}}{{metadata.contributor_ci.text_full_name}}{{/if}}',
      initialSort: 'desc'
    },
    {
      title: 'header-data-manager',
      variable: 'metadata.contributor_data_manager.text_full_name',
      template: '{{#if metadata.contributor_data_manager}}{{metadata.contributor_data_manager.text_full_name}}{{/if}}',
      initialSort: 'desc'
    },
    {
      title: 'header-created',
      variable: 'metaMetadata.createdOn',
      template: '{{formatDateLocale dateCreated "DATETIME_MED"}}',
      initialSort: 'desc'
    },
    {
      title: 'header-modified',
      variable: 'metaMetadata.lastSaveDate',
      template: '{{formatDateLocale dateModified "DATETIME_MED"}}',
      initialSort: 'desc',
      defaultSort: true
    }
  ];
}

export function builtInDashboardSettings(): DashboardSettings {
  return normaliseDashboardSettings({ tableConfig: { rowConfig: builtInDashboardRowConfig() } });
}

export function emptyDashboardConfigurationData(): DashboardConfigurationData {
  return { schemaVersion: DASHBOARD_CONFIGURATION_SCHEMA_VERSION, workflows: {}, views: {}, contexts: {} };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Ensure required containers exist. Values that are present are preserved as
 * given (including unknown extension fields); nothing is filled from another
 * target or from built-in defaults.
 */
export function normaliseDashboardSettings(input: unknown): DashboardSettings {
  const source = isPlainObject(input) ? clone(input) : {};
  const table = isPlainObject(source.tableConfig) ? source.tableConfig : {};
  const formatRules = isPlainObject(table.formatRules) ? table.formatRules : {};
  const arrayOrEmpty = (value: unknown) => (value === undefined || value === null ? [] : value);
  return {
    ...source,
    searchable: source.searchable === undefined ? true : (source.searchable as boolean),
    showStageTitle: source.showStageTitle === undefined ? true : (source.showStageTitle as boolean),
    tableConfig: {
      ...table,
      rowConfig: arrayOrEmpty(table.rowConfig) as DashboardSettingsRowConfig[],
      rowRulesConfig: arrayOrEmpty(table.rowRulesConfig) as DashboardSettingsRuleSet[],
      groupRowConfig: arrayOrEmpty(table.groupRowConfig) as DashboardSettingsRowConfig[],
      groupRowRulesConfig: arrayOrEmpty(table.groupRowRulesConfig) as DashboardSettingsRuleSet[],
      formatRules: formatRules as StageDashboardFormatRules
    }
  };
}

export function targetKey(target: DashboardTarget): string {
  // JSON tuple encoding is collision free for arbitrary names.
  return target.kind === 'workflow'
    ? JSON.stringify(['workflow', target.recordType, target.stage])
    : JSON.stringify(['view', target.view, target.step]);
}

export function targetLabel(target: DashboardTarget): string {
  return target.kind === 'workflow' ? `${target.recordType} / ${target.stage}` : `View ${target.view} / ${target.step}`;
}

export function targetOwner(target: DashboardTarget): string {
  return target.kind === 'workflow' ? target.recordType : target.view;
}

export function targetStep(target: DashboardTarget): string {
  return target.kind === 'workflow' ? target.stage : target.step;
}

export function sameTarget(a: DashboardTarget, b: DashboardTarget): boolean {
  return targetKey(a) === targetKey(b);
}

/** Parse and strictly validate a target object received from a client. */
export function parseDashboardTarget(value: unknown): DashboardTarget | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (value.kind === 'workflow') {
    const recordType = str(value.recordType);
    const stage = str(value.stage);
    return recordType && stage ? { kind: 'workflow', recordType, stage } : null;
  }
  if (value.kind === 'view') {
    const view = str(value.view);
    const step = str(value.step);
    return view && step ? { kind: 'view', view, step } : null;
  }
  return null;
}

export function getTargetSettings(data: DashboardConfigurationData, target: DashboardTarget): DashboardSettings | undefined {
  const owners = target.kind === 'workflow' ? data.workflows : data.views;
  const steps = Object.prototype.hasOwnProperty.call(owners, targetOwner(target)) ? owners[targetOwner(target)] : undefined;
  if (!steps || !Object.prototype.hasOwnProperty.call(steps, targetStep(target))) {
    return undefined;
  }
  return steps[targetStep(target)];
}

export function setTargetSettings(data: DashboardConfigurationData, target: DashboardTarget, settings: DashboardSettings): void {
  const owners = target.kind === 'workflow' ? data.workflows : data.views;
  const owner = targetOwner(target);
  if (!Object.prototype.hasOwnProperty.call(owners, owner)) {
    owners[owner] = {};
  }
  owners[owner][targetStep(target)] = clone(settings);
}

export function normaliseCopySelection(groups: unknown): DashboardCopyGroup[] | null {
  if (!Array.isArray(groups) || groups.length === 0) {
    return null;
  }
  const result = new Set<DashboardCopyGroup>();
  for (const group of groups) {
    if (group === 'all') {
      DASHBOARD_COPY_GROUPS.forEach((g) => result.add(g));
    } else if ((DASHBOARD_COPY_GROUPS as readonly string[]).includes(group as string)) {
      result.add(group as DashboardCopyGroup);
    } else {
      return null;
    }
  }
  return DASHBOARD_COPY_GROUPS.filter((g) => result.has(g));
}

export function isAllSelection(groups: unknown): boolean {
  return Array.isArray(groups) && groups.includes('all');
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (isPlainObject(acc) ? acc[key] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    delete cursor[last];
  } else {
    cursor[last] = clone(value);
  }
}

/** Top-level/table/format-rule fields not owned by any copy group. */
export function findUnclassifiedFields(settings: DashboardSettings): string[] {
  const result: string[] = [];
  for (const key of Object.keys(settings)) {
    if (!KNOWN_SETTINGS_FIELDS.has(key)) {
      result.push(key);
    }
  }
  const table = isPlainObject(settings.tableConfig) ? settings.tableConfig : ({} as Record<string, unknown>);
  for (const key of Object.keys(table)) {
    if (!KNOWN_TABLE_FIELDS.has(key)) {
      result.push(`tableConfig.${key}`);
    }
  }
  const formatRules = isPlainObject(table.formatRules) ? table.formatRules : {};
  for (const key of Object.keys(formatRules)) {
    if (!KNOWN_FORMAT_RULE_FIELDS.has(key)) {
      result.push(`tableConfig.formatRules.${key}`);
    }
  }
  return result;
}

/**
 * Replace exactly the fields owned by the selected groups. Values absent from
 * the source are removed from the result, so an empty source filter clears the
 * destination's filter. The result never shares references with either input.
 */
export function applyCopyGroups(source: DashboardSettings, destination: DashboardSettings, groups: DashboardCopyGroup[]): DashboardSettings {
  const result = normaliseDashboardSettings(destination) as unknown as Record<string, unknown>;
  const src = normaliseDashboardSettings(source) as unknown as Record<string, unknown>;
  for (const group of groups) {
    for (const path of DASHBOARD_COPY_GROUP_FIELDS[group]) {
      setPath(result, path, getPath(src, path));
    }
  }
  return normaliseDashboardSettings(result);
}

// ---------------------------------------------------------------------------
// Readable differences
// ---------------------------------------------------------------------------

export interface DashboardChangeItem {
  label: string;
  before: string;
  after: string;
  cleared: boolean;
}

export interface DashboardGroupChange {
  group: DashboardCopyGroup;
  label: string;
  changed: boolean;
  items: DashboardChangeItem[];
}

function summariseColumns(rows: DashboardSettingsRowConfig[] | undefined): string {
  return rows && rows.length ? rows.map((r) => r.title || r.variable || '(untitled)').join(', ') : '(none)';
}

function summariseRuleSets(sets: DashboardSettingsRuleSet[] | undefined): string {
  return sets && sets.length ? sets.map((s) => `${s.ruleSetName} (${(s.rules || []).length} rules)`).join(', ') : '(none)';
}

function summariseValue(value: unknown): string {
  if (value === undefined || value === null || value === '' || (isPlainObject(value) && Object.keys(value).length === 0) || (Array.isArray(value) && value.length === 0)) {
    return '(none)';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function summariseQueryFilters(value: StageDashboardFormatRules['queryFilters']): string {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    return '(none)';
  }
  return Object.entries(value)
    .map(([key, filters]) => `${key}: ${(Array.isArray(filters) ? filters : []).flatMap((f) => (f.filterFields || []).map((ff) => ff.name || ff.path)).join(', ')}`)
    .join('; ');
}

export function describeGroupChanges(before: DashboardSettings, after: DashboardSettings, groups: DashboardCopyGroup[]): DashboardGroupChange[] {
  const item = (label: string, b: string, a: string): DashboardChangeItem => ({ label, before: b, after: a, cleared: b !== '(none)' && a === '(none)' });
  const b = normaliseDashboardSettings(before);
  const a = normaliseDashboardSettings(after);
  return groups.map((group) => {
    let items: DashboardChangeItem[] = [];
    if (group === 'columnsAndActions') {
      items = [
        item('Columns', summariseColumns(b.tableConfig.rowConfig), summariseColumns(a.tableConfig.rowConfig)),
        item('Row action rule sets', summariseRuleSets(b.tableConfig.rowRulesConfig), summariseRuleSets(a.tableConfig.rowRulesConfig))
      ];
    } else if (group === 'filtersAndSearch') {
      items = [
        item('Filter', summariseValue(b.tableConfig.formatRules.filterBy), summariseValue(a.tableConfig.formatRules.filterBy)),
        item('Search filters', summariseQueryFilters(b.tableConfig.formatRules.queryFilters), summariseQueryFilters(a.tableConfig.formatRules.queryFilters)),
        item('Overall sort', summariseValue(b.tableConfig.formatRules.sortBy), summariseValue(a.tableConfig.formatRules.sortBy)),
        item('Search box', b.searchable ? 'shown' : 'hidden', a.searchable ? 'shown' : 'hidden'),
        item('Stage title', b.showStageTitle ? 'shown' : 'hidden', a.showStageTitle ? 'shown' : 'hidden')
      ];
    } else {
      items = [
        item('Group by', summariseValue(b.tableConfig.formatRules.groupBy), summariseValue(a.tableConfig.formatRules.groupBy)),
        item('Group levels', summariseValue(b.tableConfig.formatRules.sortGroupBy), summariseValue(a.tableConfig.formatRules.sortGroupBy)),
        item('Group row columns', summariseColumns(b.tableConfig.groupRowConfig), summariseColumns(a.tableConfig.groupRowConfig)),
        item('Group row rule sets', summariseRuleSets(b.tableConfig.groupRowRulesConfig), summariseRuleSets(a.tableConfig.groupRowRulesConfig))
      ];
    }
    const changed = DASHBOARD_COPY_GROUP_FIELDS[group].some((path) => canonicalJson(getPath(b as unknown as Record<string, unknown>, path)) !== canonicalJson(getPath(a as unknown as Record<string, unknown>, path)));
    return { group, label: DASHBOARD_COPY_GROUP_LABELS[group], changed, items };
  });
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DashboardFindingSeverity = 'error' | 'warning';

export interface DashboardFinding {
  id: string;
  severity: DashboardFindingSeverity;
  code: string;
  target: DashboardTarget;
  path: string;
  message: string;
}

export interface DashboardValidationContext {
  target: DashboardTarget;
  /** Record-type keys that search controls for this target are expected to use. */
  queryFilterKeys: string[];
}

function makeFinding(target: DashboardTarget, severity: DashboardFindingSeverity, code: string, path: string, message: string): DashboardFinding {
  const id = crypto.createHash('sha1').update(`${targetKey(target)}|${code}|${path}|${message}`).digest('hex').slice(0, 16);
  return { id, severity, code, target, path, message };
}

type HbsNode = { type: string; [key: string]: unknown };

function walkHandlebars(node: unknown, visit: (node: HbsNode) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walkHandlebars(child, visit));
    return;
  }
  if (!isPlainObject(node) || typeof node.type !== 'string') {
    return;
  }
  visit(node as HbsNode);
  for (const key of ['body', 'params', 'program', 'inverse', 'hash', 'pairs', 'value', 'path']) {
    if (key in node) {
      walkHandlebars(node[key], visit);
    }
  }
}

interface RuleReference {
  helper: 'evaluateRowLevelRules' | 'evaluateGroupRowRules';
  literal: string | null;
}

function findRuleReferences(ast: unknown): RuleReference[] {
  const refs: RuleReference[] = [];
  walkHandlebars(ast, (node) => {
    if (node.type !== 'MustacheStatement' && node.type !== 'SubExpression' && node.type !== 'BlockStatement') {
      return;
    }
    const helper = (node.path as { original?: unknown } | undefined)?.original;
    if (helper !== 'evaluateRowLevelRules' && helper !== 'evaluateGroupRowRules') {
      return;
    }
    const params = Array.isArray(node.params) ? (node.params as HbsNode[]) : [];
    const nameParam = helper === 'evaluateRowLevelRules' ? params[5] : params[2];
    refs.push({ helper, literal: nameParam?.type === 'StringLiteral' ? String(nameParam.value) : null });
  });
  return refs;
}

export function validateDashboardSettings(input: unknown, context: DashboardValidationContext): DashboardFinding[] {
  const findings: DashboardFinding[] = [];
  const { target } = context;
  const error = (code: string, path: string, message: string) => findings.push(makeFinding(target, 'error', code, path, message));
  const warning = (code: string, path: string, message: string) => findings.push(makeFinding(target, 'warning', code, path, message));

  if (!isPlainObject(input)) {
    error('invalid-shape', '', 'Settings must be an object.');
    return findings;
  }
  const settings = input as Record<string, unknown>;
  if (typeof settings.searchable !== 'boolean') {
    error('invalid-shape', 'searchable', 'searchable must be true or false.');
  }
  if (typeof settings.showStageTitle !== 'boolean') {
    error('invalid-shape', 'showStageTitle', 'showStageTitle must be true or false.');
  }
  if (!isPlainObject(settings.tableConfig)) {
    error('invalid-shape', 'tableConfig', 'tableConfig must be an object.');
    return findings;
  }
  const table = settings.tableConfig;

  for (const structural of STRUCTURAL_FORMAT_RULE_FIELDS) {
    if (isPlainObject(table.formatRules) && structural in table.formatRules) {
      error('structural-field', `tableConfig.formatRules.${structural}`, `${structural} describes dashboard structure and cannot be stored in stage settings.`);
    }
  }

  const templates: Array<{ path: string; template: string; allowed: 'row' | 'group' | 'none' }> = [];

  const checkRows = (key: 'rowConfig' | 'groupRowConfig') => {
    const rows = table[key];
    if (!Array.isArray(rows)) {
      error('invalid-shape', `tableConfig.${key}`, `${key} must be an array.`);
      return;
    }
    rows.forEach((row, index) => {
      const path = `tableConfig.${key}[${index}]`;
      if (!isPlainObject(row)) {
        error('invalid-shape', path, 'Column must be an object.');
        return;
      }
      for (const field of ['title', 'variable', 'template']) {
        if (typeof row[field] !== 'string') {
          error('invalid-shape', `${path}.${field}`, `Column ${field} must be text.`);
        }
      }
      if (row.initialSort !== undefined && row.initialSort !== 'asc' && row.initialSort !== 'desc') {
        error('invalid-enum', `${path}.initialSort`, 'initialSort must be "asc" or "desc".');
      }
      if (row.defaultSort !== undefined && typeof row.defaultSort !== 'boolean') {
        error('invalid-shape', `${path}.defaultSort`, 'defaultSort must be true or false.');
      }
      if (row.secondarySort !== undefined && typeof row.secondarySort !== 'string') {
        error('invalid-shape', `${path}.secondarySort`, 'secondarySort must be text.');
      }
      if (typeof row.template === 'string') {
        templates.push({ path: `${path}.template`, template: row.template, allowed: key === 'rowConfig' ? 'row' : 'group' });
      }
    });
  };
  checkRows('rowConfig');
  checkRows('groupRowConfig');

  const ruleSetNames: Record<'rowRulesConfig' | 'groupRowRulesConfig', Set<string>> = { rowRulesConfig: new Set(), groupRowRulesConfig: new Set() };
  const checkRuleSets = (key: 'rowRulesConfig' | 'groupRowRulesConfig') => {
    const sets = table[key];
    if (!Array.isArray(sets)) {
      error('invalid-shape', `tableConfig.${key}`, `${key} must be an array.`);
      return;
    }
    sets.forEach((set, index) => {
      const path = `tableConfig.${key}[${index}]`;
      if (!isPlainObject(set)) {
        error('invalid-shape', path, 'Rule set must be an object.');
        return;
      }
      if (typeof set.ruleSetName !== 'string' || !set.ruleSetName.trim()) {
        error('invalid-shape', `${path}.ruleSetName`, 'Rule set name is required.');
      } else if (ruleSetNames[key].has(set.ruleSetName)) {
        error('duplicate-rule-set', `${path}.ruleSetName`, `Rule set "${set.ruleSetName}" is defined more than once.`);
      } else {
        ruleSetNames[key].add(set.ruleSetName);
      }
      if (typeof set.applyRuleSet !== 'boolean') {
        error('invalid-shape', `${path}.applyRuleSet`, 'applyRuleSet must be true or false.');
      }
      if (set.mode !== undefined && set.mode !== 'all' && set.mode !== 'alo') {
        error('invalid-enum', `${path}.mode`, 'mode must be "all" or "alo".');
      }
      if (!Array.isArray(set.rules)) {
        error('invalid-shape', `${path}.rules`, 'rules must be an array.');
        return;
      }
      set.rules.forEach((rule, ruleIndex) => {
        const rulePath = `${path}.rules[${ruleIndex}]`;
        if (!isPlainObject(rule)) {
          error('invalid-shape', rulePath, 'Rule must be an object.');
          return;
        }
        if (typeof rule.name !== 'string') {
          error('invalid-shape', `${rulePath}.name`, 'Rule name must be text.');
        }
        if (rule.action !== 'show' && rule.action !== 'hide') {
          error('invalid-enum', `${rulePath}.action`, 'action must be "show" or "hide".');
        }
        if (rule.mode !== undefined && rule.mode !== 'all' && rule.mode !== 'alo') {
          error('invalid-enum', `${rulePath}.mode`, 'mode must be "all" or "alo".');
        }
        if (typeof rule.renderItemTemplate !== 'string') {
          error('invalid-shape', `${rulePath}.renderItemTemplate`, 'renderItemTemplate must be text.');
        } else {
          templates.push({ path: `${rulePath}.renderItemTemplate`, template: rule.renderItemTemplate, allowed: 'none' });
        }
        if (rule.evaluateRulesTemplate !== undefined) {
          if (typeof rule.evaluateRulesTemplate !== 'string') {
            error('invalid-shape', `${rulePath}.evaluateRulesTemplate`, 'evaluateRulesTemplate must be text.');
          } else {
            templates.push({ path: `${rulePath}.evaluateRulesTemplate`, template: rule.evaluateRulesTemplate, allowed: 'none' });
          }
        }
      });
    });
  };
  checkRuleSets('rowRulesConfig');
  checkRuleSets('groupRowRulesConfig');

  const formatRules = table.formatRules;
  if (!isPlainObject(formatRules)) {
    error('invalid-shape', 'tableConfig.formatRules', 'formatRules must be an object.');
  } else {
    if (formatRules.filterBy !== undefined) {
      if (!isPlainObject(formatRules.filterBy)) {
        error('invalid-shape', 'tableConfig.formatRules.filterBy', 'filterBy must be an object.');
      } else if (formatRules.filterBy.filterBase !== undefined && formatRules.filterBy.filterBase !== 'user' && formatRules.filterBy.filterBase !== 'record') {
        error('invalid-enum', 'tableConfig.formatRules.filterBy.filterBase', 'filterBase must be "user" or "record".');
      }
    }
    if (formatRules.sortBy !== undefined && typeof formatRules.sortBy !== 'string') {
      error('invalid-shape', 'tableConfig.formatRules.sortBy', 'sortBy must be text.');
    }
    if (formatRules.groupBy !== undefined && (typeof formatRules.groupBy !== 'string' || !GROUP_BY_VALUES.includes(formatRules.groupBy))) {
      error('invalid-enum', 'tableConfig.formatRules.groupBy', `groupBy must be one of: ${GROUP_BY_VALUES.map((v) => `"${v}"`).join(', ')}.`);
    }
    if (formatRules.sortGroupBy !== undefined) {
      if (!Array.isArray(formatRules.sortGroupBy)) {
        error('invalid-shape', 'tableConfig.formatRules.sortGroupBy', 'sortGroupBy must be an array.');
      } else {
        formatRules.sortGroupBy.forEach((level, index) => {
          if (!isPlainObject(level) || typeof level.rowLevel !== 'number') {
            error('invalid-shape', `tableConfig.formatRules.sortGroupBy[${index}]`, 'Each group level needs a numeric rowLevel.');
          }
        });
      }
    }
    if (formatRules.queryFilters !== undefined) {
      if (!isPlainObject(formatRules.queryFilters)) {
        error('invalid-shape', 'tableConfig.formatRules.queryFilters', 'queryFilters must be an object keyed by record type.');
      } else {
        for (const [key, filters] of Object.entries(formatRules.queryFilters)) {
          const path = `tableConfig.formatRules.queryFilters.${key}`;
          if (!Array.isArray(filters)) {
            error('invalid-shape', path, 'Search filters must be an array.');
            continue;
          }
          if (!context.queryFilterKeys.includes(key)) {
            warning('query-filter-key', path, `Search filters are keyed to "${key}", which this dashboard does not use (expected ${context.queryFilterKeys.map((k) => `"${k}"`).join(' or ')}). They will have no effect here.`);
          }
          filters.forEach((filter, index) => {
            if (!isPlainObject(filter) || typeof filter.filterType !== 'string' || !Array.isArray(filter.filterFields)) {
              error('invalid-shape', `${path}[${index}]`, 'Search filter needs filterType and filterFields.');
              return;
            }
            filter.filterFields.forEach((field, fieldIndex) => {
              const fieldPath = `${path}[${index}].filterFields[${fieldIndex}]`;
              if (!isPlainObject(field) || typeof field.name !== 'string' || typeof field.path !== 'string') {
                error('invalid-shape', fieldPath, 'Search filter field needs name and path.');
                return;
              }
              if (field.template !== undefined) {
                if (typeof field.template !== 'string') {
                  error('invalid-shape', `${fieldPath}.template`, 'template must be text.');
                } else {
                  templates.push({ path: `${fieldPath}.template`, template: field.template, allowed: 'none' });
                }
              }
            });
          });
        }
      }
    }
    if (typeof formatRules.sortBy === 'string' && formatRules.sortBy.trim() && Array.isArray(table.rowConfig)) {
      const sortField = formatRules.sortBy.split(':')[0];
      const variables = (table.rowConfig as Array<Record<string, unknown>>).map((row) => row?.variable);
      if (!variables.includes(sortField)) {
        warning('sort-field', 'tableConfig.formatRules.sortBy', `Overall sort field "${sortField}" is not one of this dashboard's columns.`);
      }
    }
  }

  for (const { path, template, allowed } of templates) {
    let ast: unknown;
    try {
      ast = Handlebars.parse(template);
    } catch (e) {
      error('invalid-template', path, `Template cannot be parsed: ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    for (const ref of findRuleReferences(ast)) {
      const expectedIn = ref.helper === 'evaluateRowLevelRules' ? 'rowRulesConfig' : 'groupRowRulesConfig';
      if ((ref.helper === 'evaluateRowLevelRules' && allowed !== 'row') || (ref.helper === 'evaluateGroupRowRules' && allowed !== 'group')) {
        warning('rule-helper-context', path, `${ref.helper} is not supplied with rule sets in this template location; it will render nothing.`);
        continue;
      }
      if (ref.literal === null) {
        warning('dynamic-rule-set', path, `${ref.helper} uses a rule set name that cannot be checked before the dashboard runs.`);
      } else if (!ruleSetNames[expectedIn].has(ref.literal)) {
        error('missing-rule-set', path, `Template uses rule set "${ref.literal}", which is not defined in ${expectedIn === 'rowRulesConfig' ? 'row action rules' : 'group row rules'}.`);
      }
    }
  }

  for (const unclassified of findUnclassifiedFields(settings as unknown as DashboardSettings)) {
    if (!STRUCTURAL_FORMAT_RULE_FIELDS.some((f) => unclassified === `tableConfig.formatRules.${f}`)) {
      warning('unclassified-field', unclassified, `"${unclassified}" is not a recognised dashboard setting. It is kept as-is but cannot be copied with "All settings".`);
    }
  }

  return findings;
}

/**
 * Warn where copied groups contain literal references to the source owner (for
 * example a record type name inside a URL) when copying between owners.
 */
export function findSourceSpecificReferences(source: DashboardTarget, destination: DashboardTarget, copied: DashboardSettings, groups: DashboardCopyGroup[], sourceRecordTypeName: string, destinationRecordTypeName: string): DashboardFinding[] {
  if (!sourceRecordTypeName || sourceRecordTypeName === destinationRecordTypeName) {
    return [];
  }
  const findings: DashboardFinding[] = [];
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${sourceRecordTypeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_-]|$)`);
  for (const group of groups) {
    for (const path of DASHBOARD_COPY_GROUP_FIELDS[group]) {
      if (path === 'tableConfig.formatRules.queryFilters') {
        continue; // Reported separately as a key mismatch.
      }
      const value = getPath(copied as unknown as Record<string, unknown>, path);
      if (value !== undefined && pattern.test(JSON.stringify(value))) {
        findings.push(makeFinding(destination, 'warning', 'source-specific-reference', path, `Copied ${DASHBOARD_COPY_GROUP_LABELS[group].toLowerCase()} mention "${sourceRecordTypeName}" from ${targetLabel(source)}. Check that names, field paths and URLs suit ${destinationRecordTypeName}.`));
      }
    }
  }
  return findings;
}
