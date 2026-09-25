/**
 * One-time conversion of v5.0.1 dashboard configuration into independent
 * per-target settings.
 *
 * This module reconstructs what the v5.0.1 dashboard actually rendered, which
 * is not the same as the old merged-config API:
 *
 * - Columns, headings and column sorting came from the raw workflow/view table,
 *   or the Angular built-in columns when the table declared no `rowConfig`.
 * - Cell/rule templates came from precompiled *merged* configuration and were
 *   looked up by (context, stage, array index, variable). A mismatch rendered an
 *   empty string.
 * - Format rules started with the dashboard profile's rules and were replaced by
 *   each processed stage that declared its own, so later stages inherited the
 *   previous stage's rules. Search controls read the final rules.
 * - Ordinary dashboards never supplied row rule sets or grouping.
 *
 * It is not a runtime fallback. Pure functions only; callers supply captured
 * inputs and persist the result.
 */
import type { DashboardViewConfig, DashboardViewDefinition } from '../config/dashboardview.config';
import {
  DashboardConfigurationData,
  DashboardModeContext,
  DashboardSettings,
  DashboardSettingsQueryFilter,
  DashboardSettingsRowConfig,
  DashboardSettingsRuleSet,
  DashboardTarget,
  STRUCTURAL_FORMAT_RULE_FIELDS,
  builtInDashboardRowConfig,
  canonicalJson,
  emptyDashboardConfigurationData,
  fingerprint,
  normaliseDashboardSettings,
  setTargetSettings,
  targetKey,
  targetLabel
} from '../configmodels/DashboardSettings';

type AnyRecord = Record<string, unknown>;

export interface LegacyWorkflowStepInput {
  name: string;
  hidden?: boolean;
  displayIndex?: number;
  /** Raw `config.dashboard.table` from the persisted WorkflowStep. */
  table?: unknown;
}

export interface LegacyRecordTypeInput {
  name: string;
  steps: LegacyWorkflowStepInput[];
}

export interface LegacyDashboardTypeInput {
  name: string;
  formatRules?: unknown;
  tableConfig?: unknown;
  searchable?: boolean;
}

export interface LegacyOverrideInput {
  recordTypes?: Record<string, { default?: AnyRecord; steps?: Record<string, AnyRecord> }>;
  views?: Record<string, { default?: AnyRecord; steps?: Record<string, AnyRecord> }>;
}

export interface LegacyCaptureInput {
  recordTypes: LegacyRecordTypeInput[];
  dashboardTypes: LegacyDashboardTypeInput[];
  /** The `dashboardTableConfig` value the old AppConfigService returned. */
  overrides: LegacyOverrideInput | null;
  views: DashboardViewConfig;
}

export type LegacyFindingSeverity = 'info' | 'resolution';

export interface LegacyMigrationFinding {
  id: string;
  severity: LegacyFindingSeverity;
  code: string;
  target?: DashboardTarget;
  context?: string;
  message: string;
}

export type LegacyTargetOutcome = 'preserved' | 'needs-resolution' | 'inactive';

export interface LegacyConversionResult {
  inputFingerprint: string;
  data: DashboardConfigurationData;
  targets: Array<{ target: DashboardTarget; outcome: LegacyTargetOutcome; contexts: string[] }>;
  findings: LegacyMigrationFinding[];
}

/** Angular `defaultFormatRules` in dashboard.component.ts (v5.0.1). */
const ANGULAR_DEFAULT_FORMAT_RULES: AnyRecord = {
  filterBy: {},
  filterWorkflowStepsBy: [],
  recordTypeFilterBy: '',
  queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] },
  sortBy: 'metaMetadata.lastSaveDate:-1',
  groupBy: '',
  sortGroupBy: [],
  hideWorkflowStepTitleForRecordType: []
};

/** Dashboard modes whose page shows the stage title heading (v5.0.1 template). */
const TITLE_MODES = ['standard', 'consolidated'];

function isPlainObject(value: unknown): value is AnyRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length === 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function finding(severity: LegacyFindingSeverity, code: string, message: string, target?: DashboardTarget, context?: string): LegacyMigrationFinding {
  const id = fingerprint([code, target ? targetKey(target) : '', context ?? '', message]).slice(0, 16);
  return { id, severity, code, target, context, message };
}

/** v5.0.1 DashboardConfigService.normalizeTableConfig: empty => built-in columns. */
function legacyNormaliseTable(config: unknown): AnyRecord {
  return isEmptyValue(config) ? { rowConfig: builtInDashboardRowConfig() } : (clone(config) as AnyRecord);
}

/** v5.0.1 DashboardConfigService.mergeTableConfigs: arrays replace, objects merge. */
function legacyMergeTables(...configs: unknown[]): AnyRecord {
  const valid = configs.filter((c) => !isEmptyValue(c)) as AnyRecord[];
  if (valid.length === 0) {
    return { rowConfig: builtInDashboardRowConfig() };
  }
  const merge = (target: AnyRecord, source: AnyRecord) => {
    for (const [key, value] of Object.entries(source)) {
      // Legacy configuration is data, so never let special property names reach
      // an ordinary object during the recursive merge.
      if (key === '__proto__' || key === 'constructor') {
        continue;
      }
      if (Array.isArray(value)) {
        target[key] = clone(value);
      } else if (isPlainObject(value)) {
        target[key] = merge(isPlainObject(target[key]) ? (target[key] as AnyRecord) : {}, value);
      } else if (value !== undefined) {
        target[key] = value;
      }
    }
    return target;
  };
  return valid.reduce<AnyRecord>((acc, config) => merge(acc, config), {});
}

/** Templates the old server extracted, keyed as the client looked them up. */
interface CompiledTemplateIndex {
  rows: Map<string, string>;
  groupRows: Map<string, string>;
  rowRules: Map<string, string>;
  groupRowRules: Map<string, string>;
}

function indexCompiledTemplates(merged: AnyRecord): CompiledTemplateIndex {
  const index: CompiledTemplateIndex = { rows: new Map(), groupRows: new Map(), rowRules: new Map(), groupRowRules: new Map() };
  // Template extraction replaced an empty merged rowConfig with the built-in columns.
  const rows = (!isEmptyValue(merged.rowConfig) ? merged.rowConfig : builtInDashboardRowConfig()) as DashboardSettingsRowConfig[];
  rows.forEach((row, i) => row?.template && index.rows.set(`${i}|${row.variable}`, row.template));
  ((merged.groupRowConfig as DashboardSettingsRowConfig[]) || []).forEach((row, i) => row?.template && index.groupRows.set(`${i}|${row.variable}`, row.template));
  const indexRules = (sets: unknown, target: Map<string, string>) => {
    ((sets as DashboardSettingsRuleSet[]) || []).forEach((set) =>
      (set?.rules || []).forEach((rule, i) => {
        if (rule?.renderItemTemplate) {
          target.set(`${set.ruleSetName}|${i}|render`, rule.renderItemTemplate);
        }
        if (rule?.evaluateRulesTemplate) {
          target.set(`${set.ruleSetName}|${i}|evaluate`, rule.evaluateRulesTemplate);
        }
      })
    );
  };
  indexRules(merged.rowRulesConfig, index.rowRules);
  indexRules(merged.groupRowRulesConfig, index.groupRowRules);
  return index;
}

interface ReconcileNotes {
  replaced: string[];
  blanked: string[];
}

/**
 * Replace each rendered template with the one the old client actually executed.
 * `templatesAvailable = false` models a context whose module lookup never
 * matched, so every cell rendered empty.
 */
function reconcileRows(rows: DashboardSettingsRowConfig[], compiled: Map<string, string>, templatesAvailable: boolean, pathPrefix: string, notes: ReconcileNotes): DashboardSettingsRowConfig[] {
  return rows.map((row, i) => {
    const effective = templatesAvailable ? compiled.get(`${i}|${row.variable}`) ?? '' : '';
    if (effective !== row.template) {
      (effective === '' ? notes.blanked : notes.replaced).push(`${pathPrefix}[${i}] (${row.title || row.variable})`);
    }
    return { ...row, template: effective };
  });
}

function reconcileRuleSets(sets: DashboardSettingsRuleSet[], compiled: Map<string, string>, pathPrefix: string, notes: ReconcileNotes): DashboardSettingsRuleSet[] {
  return sets.map((set) => ({
    ...set,
    rules: (set.rules || []).map((rule, i) => {
      const next = { ...rule };
      const render = compiled.get(`${set.ruleSetName}|${i}|render`) ?? '';
      if (rule.renderItemTemplate && render !== rule.renderItemTemplate) {
        (render === '' ? notes.blanked : notes.replaced).push(`${pathPrefix}.${set.ruleSetName}[${i}].render`);
        next.renderItemTemplate = render;
      }
      if (rule.evaluateRulesTemplate) {
        const evaluate = compiled.get(`${set.ruleSetName}|${i}|evaluate`);
        if (evaluate === undefined) {
          // A missing compiled evaluate template rendered '' which never equals 'true'.
          notes.blanked.push(`${pathPrefix}.${set.ruleSetName}[${i}].evaluate`);
          next.evaluateRulesTemplate = 'false';
        } else if (evaluate !== rule.evaluateRulesTemplate) {
          notes.replaced.push(`${pathPrefix}.${set.ruleSetName}[${i}].evaluate`);
          next.evaluateRulesTemplate = evaluate;
        }
      }
      return next;
    })
  }));
}

function editableFormatRules(formatRules: AnyRecord): AnyRecord {
  const result = clone(formatRules) ?? {};
  for (const field of STRUCTURAL_FORMAT_RULE_FIELDS) {
    delete result[field];
  }
  return result;
}

interface Observation {
  context: string;
  settings: DashboardSettings;
  notes: ReconcileNotes;
  extra: LegacyMigrationFinding[];
}

export function convertLegacyDashboardConfiguration(input: LegacyCaptureInput): LegacyConversionResult {
  const findings: LegacyMigrationFinding[] = [];
  const data = emptyDashboardConfigurationData();
  const observations = new Map<string, { target: DashboardTarget; list: Observation[] }>();
  const overrides: LegacyOverrideInput = isPlainObject(input.overrides) ? (input.overrides as LegacyOverrideInput) : {};
  const profiles = new Map(input.dashboardTypes.map((p) => [p.name, p]));
  const recordTypes = new Map(input.recordTypes.map((r) => [r.name, r]));

  const observe = (target: DashboardTarget, observation: Observation) => {
    const key = targetKey(target);
    if (!observations.has(key)) {
      observations.set(key, { target, list: [] });
    }
    observations.get(key)!.list.push(observation);
  };

  // Structural context metadata retained from retired profiles.
  for (const profile of input.dashboardTypes) {
    const formatRules = isPlainObject(profile.formatRules) ? profile.formatRules : {};
    const context: DashboardModeContext = {};
    if (typeof formatRules.recordTypeFilterBy === 'string' && formatRules.recordTypeFilterBy) {
      context.recordTypeFilterBy = formatRules.recordTypeFilterBy;
    }
    if (Array.isArray(formatRules.filterWorkflowStepsBy) && formatRules.filterWorkflowStepsBy.length) {
      context.filterWorkflowStepsBy = clone(formatRules.filterWorkflowStepsBy as string[]);
    }
    data.contexts[profile.name] = context;
  }

  const overrideFor = (recordType: string, stage: string): AnyRecord | null => {
    const entry = overrides.recordTypes?.[recordType];
    return (entry?.steps?.[stage] ?? entry?.default ?? null) as AnyRecord | null;
  };

  const mergedWorkflowTable = (recordType: string, step: LegacyWorkflowStepInput): AnyRecord => {
    const override = overrideFor(recordType, step.name);
    const profileName = typeof override?.dashboardType === 'string' ? override.dashboardType : 'standard';
    const profileTable = legacyNormaliseTable(profiles.get(profileName)?.tableConfig);
    const workflowTable = isEmptyValue(step.table) ? null : legacyNormaliseTable(step.table);
    return legacyMergeTables(profileTable, workflowTable, override?.tableConfig ?? null);
  };

  /**
   * Reconstruct an ordinary (non-view) dashboard page: `/dashboard/:pageRecordType`
   * in dashboard mode `mode`.
   */
  const observeWorkflowPage = (pageRecordType: string, mode: string) => {
    const profile = profiles.get(mode);
    const profileRules = isPlainObject(profile?.formatRules) ? (profile!.formatRules as AnyRecord) : {};
    let formatRules: AnyRecord = !isEmptyValue(profileRules) ? profileRules : ANGULAR_DEFAULT_FORMAT_RULES;
    let recordTypeName = pageRecordType;
    if (formatRules.recordTypeFilterBy !== undefined && !isEmptyValue(profileRules)) {
      recordTypeName = String(formatRules.recordTypeFilterBy);
    }
    const hideTitle = ((profileRules.hideWorkflowStepTitleForRecordType as string[]) ?? []).includes(recordTypeName);
    const recordType = recordTypes.get(recordTypeName);
    if (!recordType) {
      return;
    }
    const filterSteps = formatRules.filterWorkflowStepsBy;
    let steps = recordType.steps.filter((s) => !s.hidden);
    if (Array.isArray(filterSteps) && filterSteps.length) {
      steps = steps.filter((s) => filterSteps.includes(s.name));
    }
    steps = [...steps].sort((a, b) => (a.displayIndex ?? Number.MAX_SAFE_INTEGER) - (b.displayIndex ?? Number.MAX_SAFE_INTEGER));

    // Stage-order dependent format rules, then the final shared value.
    const perStep: Array<{ step: LegacyWorkflowStepInput; formatRules: AnyRecord }> = [];
    for (const step of steps) {
      const table = isPlainObject(step.table) ? step.table : undefined;
      if (table && table.formatRules !== undefined) {
        formatRules = table.formatRules as AnyRecord;
      }
      perStep.push({ step, formatRules });
    }
    const finalRules = formatRules;
    // The workspace page dropped its record type before rendering, so no compiled template matched.
    const templatesAvailable = mode !== 'workspace';
    const context = `${mode} dashboard /dashboard/${pageRecordType}`;

    for (const { step, formatRules: stepRules } of perStep) {
      const target: DashboardTarget = { kind: 'workflow', recordType: recordTypeName, stage: step.name };
      const table = isPlainObject(step.table) ? step.table : {};
      const rows = (table.rowConfig !== undefined ? table.rowConfig : builtInDashboardRowConfig()) as DashboardSettingsRowConfig[];
      const notes: ReconcileNotes = { replaced: [], blanked: [] };
      const compiled = indexCompiledTemplates(mergedWorkflowTable(recordTypeName, step));
      const extra: LegacyMigrationFinding[] = [];

      const stepFormat = editableFormatRules(stepRules);
      const queryFilters = isPlainObject(finalRules.queryFilters) ? (finalRules.queryFilters as Record<string, DashboardSettingsQueryFilter[]>) : {};
      const searchFilters = queryFilters[pageRecordType];
      const formatForTarget: AnyRecord = {
        ...stepFormat,
        queryFilters: searchFilters === undefined ? {} : { [pageRecordType]: clone(searchFilters) }
      };
      // v5.0.1 ignored the overall sortBy value; only keep it where it still has no effect.
      const hasColumnSort = rows.some((r) => r?.initialSort === 'asc' || r?.initialSort === 'desc');
      if (typeof formatForTarget.sortBy === 'string' && formatForTarget.sortBy && !hasColumnSort) {
        extra.push(finding('info', 'ignored-sort-by', `Overall sort "${formatForTarget.sortBy}" was ignored in v5.0.1 and has not been activated; it is retained in the recovery snapshot.`, target, context));
        delete formatForTarget.sortBy;
      }

      // Ordinary dashboards were not given row rule sets; keep declared sets but report any that templates would now activate.
      const rowRules = (table.rowRulesConfig as DashboardSettingsRuleSet[]) ?? [];
      if (rowRules.length && rows.some((r) => typeof r?.template === 'string' && r.template.includes('evaluateRowLevelRules'))) {
        extra.push(finding('resolution', 'activated-row-rules', 'Row action rule sets were declared but not supplied to ordinary dashboards in v5.0.1. They will render after migration.', target, context));
      }

      let searchFilterNote: string | null = null;
      if (searchFilters && !templatesAvailable) {
        searchFilterNote = 'search filter templates';
      }
      if (searchFilters) {
        formatForTarget.queryFilters = {
          [pageRecordType]: (searchFilters as DashboardSettingsQueryFilter[]).map((filter) => ({
            ...filter,
            filterFields: (filter.filterFields || []).map((field) => (field.template && searchFilterNote ? { ...field, template: '' } : field))
          }))
        };
      }

      const settings = normaliseDashboardSettings({
        searchable: true,
        showStageTitle: TITLE_MODES.includes(mode) ? !(steps.length === 1 && hideTitle) : true,
        tableConfig: {
          ...table,
          rowConfig: reconcileRows(clone(rows), compiled.rows, templatesAvailable, 'columns', notes),
          rowRulesConfig: templatesAvailable ? reconcileRuleSets(clone(rowRules), compiled.rowRules, 'rowRules', notes) : clone(rowRules),
          groupRowConfig: clone(table.groupRowConfig ?? []),
          groupRowRulesConfig: clone(table.groupRowRulesConfig ?? []),
          formatRules: formatForTarget
        }
      });
      observe(target, { context, settings, notes, extra });
    }
  };

  const modes = input.dashboardTypes.map((p) => p.name).filter((name) => name !== 'consolidated');
  if (!modes.includes('standard')) {
    modes.unshift('standard');
  }
  for (const mode of modes) {
    if (mode === 'standard') {
      for (const recordType of input.recordTypes) {
        observeWorkflowPage(recordType.name, 'standard');
      }
    } else if (mode === 'workspace') {
      observeWorkflowPage('workspace', 'workspace');
    }
  }

  // Custom dashboard views.
  for (const [viewName, viewDef] of Object.entries(input.views ?? {}) as Array<[string, DashboardViewDefinition]>) {
    if (!viewDef || !Array.isArray(viewDef.steps)) {
      continue;
    }
    const profileName = viewDef.dashboardType;
    const profileRules = isPlainObject(profiles.get(profileName)?.formatRules) ? (profiles.get(profileName)!.formatRules as AnyRecord) : {};
    const pageRules = !isEmptyValue(profileRules) ? profileRules : ANGULAR_DEFAULT_FORMAT_RULES;
    if (!isEmptyValue(viewDef.formatRulesOverride)) {
      findings.push(finding('info', 'ignored-view-format-rules-override', `View "${viewName}" declares formatRulesOverride, which v5.0.1 dashboards ignored. It has not been activated.`, undefined, `view ${viewName}`));
    }
    for (const step of viewDef.steps) {
      const target: DashboardTarget = { kind: 'view', view: viewName, step: step.name };
      const context = `view /dashboard-view/${viewName}`;
      const table = isPlainObject(step.dashboardTable) ? (step.dashboardTable as unknown as AnyRecord) : {};
      const viewOverride = overrides.views?.[viewName];
      const override = (viewOverride?.steps?.[step.name] ?? viewOverride?.default ?? null) as AnyRecord | null;
      const mergedProfile = typeof override?.dashboardType === 'string' ? override.dashboardType : profileName;
      const merged = legacyMergeTables(
        legacyNormaliseTable(profiles.get(mergedProfile)?.tableConfig),
        isEmptyValue(table) ? null : legacyNormaliseTable(table),
        override?.tableConfig ?? null
      );
      const compiled = indexCompiledTemplates(merged);
      const notes: ReconcileNotes = { replaced: [], blanked: [] };
      const rows = (table.rowConfig !== undefined ? table.rowConfig : builtInDashboardRowConfig()) as DashboardSettingsRowConfig[];
      const stepRules = (table.formatRules ?? pageRules) as AnyRecord;
      const settings = normaliseDashboardSettings({
        // Search controls were never shown on custom views.
        searchable: false,
        showStageTitle: TITLE_MODES.includes(profileName),
        tableConfig: {
          ...table,
          rowConfig: reconcileRows(clone(rows), compiled.rows, true, 'columns', notes),
          rowRulesConfig: reconcileRuleSets(clone((table.rowRulesConfig as DashboardSettingsRuleSet[]) ?? []), compiled.rowRules, 'rowRules', notes),
          groupRowConfig: reconcileRows(clone((table.groupRowConfig as DashboardSettingsRowConfig[]) ?? []), compiled.groupRows, true, 'groupColumns', notes),
          groupRowRulesConfig: reconcileRuleSets(clone((table.groupRowRulesConfig as DashboardSettingsRuleSet[]) ?? []), compiled.groupRowRules, 'groupRowRules', notes),
          formatRules: editableFormatRules(stepRules)
        }
      });
      observe(target, { context, settings, notes, extra: [] });
    }
  }

  const targets: LegacyConversionResult['targets'] = [];

  // Combine observations per target; incompatible contexts are exceptions, never hidden inheritance.
  for (const { target, list } of observations.values()) {
    const primary = list[0];
    let outcome: LegacyTargetOutcome = 'preserved';
    const settings = clone(primary.settings);
    for (const other of list.slice(1)) {
      const mergedFilters = { ...(settings.tableConfig.formatRules.queryFilters ?? {}) };
      for (const [key, value] of Object.entries(other.settings.tableConfig.formatRules.queryFilters ?? {})) {
        if (mergedFilters[key] !== undefined && canonicalJson(mergedFilters[key]) !== canonicalJson(value)) {
          outcome = 'needs-resolution';
          findings.push(finding('resolution', 'context-conflict', `Search filters for "${key}" differ between ${primary.context} and ${other.context}.`, target, other.context));
        } else {
          mergedFilters[key] = clone(value);
        }
      }
      const comparable = (s: DashboardSettings) => canonicalJson({ ...s, showStageTitle: undefined, tableConfig: { ...s.tableConfig, formatRules: { ...s.tableConfig.formatRules, queryFilters: undefined } } });
      if (comparable(other.settings) !== comparable(settings)) {
        outcome = 'needs-resolution';
        const blanked = other.notes.blanked.length ? ` (${other.notes.blanked.length} cells or actions rendered empty there)` : '';
        findings.push(finding('resolution', 'context-conflict', `${other.context} rendered ${targetLabel(target)} differently from ${primary.context}${blanked}. The migrated settings follow ${primary.context}.`, target, other.context));
      }
      settings.tableConfig.formatRules.queryFilters = mergedFilters;
    }
    for (const observation of list) {
      findings.push(...observation.extra);
      if (observation.extra.some((f) => f.severity === 'resolution')) {
        outcome = 'needs-resolution';
      }
    }
    if (primary.notes.replaced.length) {
      findings.push(finding('info', 'template-from-compiled-config', `Templates that v5.0.1 actually rendered were taken from the compiled configuration for: ${primary.notes.replaced.join(', ')}.`, target, primary.context));
    }
    if (primary.notes.blanked.length) {
      findings.push(finding('info', 'preserved-empty-template', `These rendered empty in v5.0.1 and are preserved as explicit empty templates: ${primary.notes.blanked.join(', ')}.`, target, primary.context));
    }
    setTargetSettings(data, target, settings);
    targets.push({ target, outcome, contexts: list.map((o) => o.context) });
  }

  // Targets no dashboard page displayed (hidden or filtered stages) still get independent settings.
  for (const recordType of input.recordTypes) {
    for (const step of recordType.steps) {
      const target: DashboardTarget = { kind: 'workflow', recordType: recordType.name, stage: step.name };
      if (observations.has(targetKey(target))) {
        continue;
      }
      const table = isPlainObject(step.table) ? step.table : {};
      const rows = (table.rowConfig !== undefined ? table.rowConfig : builtInDashboardRowConfig()) as DashboardSettingsRowConfig[];
      const notes: ReconcileNotes = { replaced: [], blanked: [] };
      const compiled = indexCompiledTemplates(mergedWorkflowTable(recordType.name, step));
      setTargetSettings(data, target, normaliseDashboardSettings({
        searchable: true,
        showStageTitle: true,
        tableConfig: {
          ...table,
          rowConfig: reconcileRows(clone(rows), compiled.rows, true, 'columns', notes),
          formatRules: editableFormatRules(isPlainObject(table.formatRules) ? table.formatRules : {})
        }
      }));
      targets.push({ target, outcome: 'inactive', contexts: [] });
      findings.push(finding('info', 'not-displayed', `${targetLabel(target)} was not shown on any v5.0.1 dashboard${step.hidden ? ' (hidden stage)' : ''}. Settings were created from its declaration.`, target));
    }
  }

  // Overrides for targets that no longer exist are kept only in the recovery snapshot.
  for (const [recordTypeName, entry] of Object.entries(overrides.recordTypes ?? {})) {
    for (const stage of Object.keys(entry?.steps ?? {})) {
      if (!recordTypes.get(recordTypeName)?.steps.some((s) => s.name === stage)) {
        findings.push(finding('info', 'orphaned-override', `Override for ${recordTypeName} / ${stage} has no matching workflow stage; it is kept only in the recovery snapshot.`));
      }
    }
  }
  for (const [viewName, entry] of Object.entries(overrides.views ?? {})) {
    for (const step of Object.keys(entry?.steps ?? {})) {
      if (!input.views?.[viewName]?.steps?.some((s) => s.name === step)) {
        findings.push(finding('info', 'orphaned-override', `Override for view ${viewName} / ${step} has no matching view step; it is kept only in the recovery snapshot.`));
      }
    }
  }

  const uniqueFindings = Array.from(new Map(findings.map((f) => [f.id, f])).values());
  return {
    inputFingerprint: fingerprint(input),
    data,
    targets: targets.sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target))),
    findings: uniqueFindings
  };
}

/** Human readable preflight summary for operators. */
export function summariseLegacyConversion(result: LegacyConversionResult, brandName: string): string {
  const lines = [`Dashboard configuration preflight for brand "${brandName}"`, `Input fingerprint: ${result.inputFingerprint}`, ''];
  const counts = result.targets.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.outcome]: (acc[t.outcome] ?? 0) + 1 }), {});
  lines.push(`Targets: ${result.targets.length} (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'})`);
  const resolution = result.findings.filter((f) => f.severity === 'resolution');
  lines.push(`Findings requiring resolution: ${resolution.length}`, '');
  for (const f of result.findings) {
    lines.push(`- [${f.severity}] ${f.id} ${f.target ? targetLabel(f.target) + ': ' : ''}${f.message}`);
  }
  return lines.join('\n');
}
