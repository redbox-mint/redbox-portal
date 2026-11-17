/** Safe metadata only: paths are relative to the authenticated brand/portal. */
export interface NamedQueryConsumer {
  type: 'report' | 'dashboard' | 'vocabulary' | 'form' | 'configuration';
  name: string;
  path: string;
}

export type NamedQueryUsage = Record<string, NamedQueryConsumer[]>;

export class NamedQueryInUseError extends Error {
  constructor(public readonly consumers: NamedQueryConsumer[]) {
    super('Named query is in use. Remove its configured references before deleting it.');
  }
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';

/** Recognise reference fields, never substrings in templates, labels or query bodies. */
export function configuredQueryNames(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const config = object(node);
    const queryName = object(config.databaseQuery).queryName;
    if (typeof config.namedQuery === 'string' && config.namedQuery) names.add(config.namedQuery);
    if (config.querySource === 'database' || config.reportSource === 'database') {
      if (typeof queryName === 'string') names.add(queryName.trim());
    }
    if (config.type === 'namedQuery' || config.sourceType === 'namedQuery') {
      // queryId is a vocabulary alias, resolved separately below.
      if (typeof config.queryName === 'string') names.add(config.queryName);
      if (config.type === 'namedQuery' && typeof config.name === 'string') names.add(config.name);
    }
    for (const [key, child] of Object.entries(config)) {
      if (!['mongoQuery', 'queryParams', 'resultObjectMapping'].includes(key)) visit(child);
    }
  };
  visit(value);
  return [...names].filter(Boolean);
}

/** Build one reverse index from brand-filtered rows and process-wide runtime config. */
export function buildNamedQueryUsage(input: {
  reports: unknown[]; dashboards: unknown; dashboardTypes: unknown[]; recordTypes: unknown[];
  workflowSteps: unknown[]; views: Record<string, unknown>; vocabularies: Record<string, unknown>;
  forms: unknown[]; appConfigs: unknown[];
}): NamedQueryUsage {
  const usage: NamedQueryUsage = Object.create(null);
  const add = (query: string, consumer: NamedQueryConsumer): void => {
    if (!query) return;
    const entries = usage[query] ?? (usage[query] = []);
    if (!entries.some(entry => entry.type === consumer.type && entry.path === consumer.path && entry.name === consumer.name)) entries.push(consumer);
  };
  const scan = (config: unknown, consumer: NamedQueryConsumer): void => {
    for (const name of configuredQueryNames(config)) add(name, consumer);
  };
  const dashboard = (kind: 'workflow' | 'view', owner: string, step: string, config: unknown): void => {
    const key = JSON.stringify([kind, owner, step]);
    scan(config, { type: 'dashboard', name: `${owner} · ${step}`, path: `/admin/dashboard-config#target=${encodeURIComponent(key)}` });
  };
  for (const rawReport of input.reports) {
    const report = object(rawReport);
    const queryName = object(report.databaseQuery).queryName;
    if (report.reportSource === 'database' && typeof queryName === 'string') {
      add(queryName, { type: 'report', name: text(report.title) || text(report.name), path: `/admin/report/${encodeURIComponent(text(report.name))}` });
    }
  }
  for (const [kind, owners] of Object.entries({ workflow: object(input.dashboards).workflows, view: object(input.dashboards).views })) {
    for (const [owner, steps] of Object.entries(object(owners))) {
      for (const [step, settings] of Object.entries(object(steps))) dashboard(kind as 'workflow' | 'view', owner, step, settings);
    }
  }
  const recordTypes = new Map(input.recordTypes.map(value => {
    const recordType = object(value);
    return [String(recordType.id), text(recordType.name)];
  }));
  for (const value of input.workflowSteps) {
    const step = object(value);
    const owner = recordTypes.get(String(object(step.recordType).id ?? step.recordType));
    if (owner) dashboard('workflow', owner, text(step.name), step.config);
  }
  for (const [name, value] of Object.entries(input.views)) {
    const view = object(value);
    for (const step of Array.isArray(view.steps) ? view.steps : []) dashboard('view', name, text(object(step).name), step);
    const { steps: _steps, ...viewConfig } = view;
    scan(viewConfig, { type: 'dashboard', name, path: `/dashboard-view/${encodeURIComponent(name)}` });
  }
  for (const type of input.dashboardTypes) scan(type, { type: 'dashboard', name: text(object(type).name), path: '/admin/dashboard-config' });
  const vocabularyQueries = new Map<string, string>();
  for (const [name, value] of Object.entries(input.vocabularies)) {
    const config = object(value);
    const queryName = object(config.databaseQuery).queryName;
    if (config.querySource === 'database' && typeof queryName === 'string') {
      const query = queryName.trim();
      vocabularyQueries.set(name, query);
      add(query, { type: 'vocabulary', name, path: `/query/vocab/${encodeURIComponent(name)}` });
    }
  }
  for (const value of input.forms) {
    const form = object(value);
    const consumer: NamedQueryConsumer = { type: 'form', name: text(form.name), path: `/record/form/${encodeURIComponent(text(form.name))}` };
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const node = object(value);
      if (node.sourceType === 'namedQuery') {
        const query = vocabularyQueries.get(String(node.queryId ?? '').trim());
        if (query) add(query, consumer);
      }
      Object.values(node).forEach(visit);
    };
    visit(form.configuration);
  }
  for (const value of input.appConfigs) {
    const config = object(value);
    scan(config.configData, { type: 'configuration', name: text(config.configKey), path: `/admin/appconfig/edit/${encodeURIComponent(text(config.configKey))}` });
  }
  return usage;
}
