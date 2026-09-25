/**
 * Record field catalogue for dashboard authoring.
 *
 * Flattens the record JSON Schema of a workflow stage (from
 * RecordSchemaService) into the dotted field paths that dashboard columns,
 * filters, sorting and grouping use, e.g. `metadata.contributor_ci.email`.
 * Pure functions only.
 */

export type DashboardFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any';

export interface DashboardFieldInfo {
  /** Dotted path in the stored record, e.g. `metadata.title`. */
  path: string;
  /** Readable label derived from the path. */
  label: string;
  type: DashboardFieldType;
  /** True when the value sits inside a list (matches any list entry). */
  repeated: boolean;
  enum?: Array<string | number | boolean>;
  description?: string;
  source: 'schema' | 'system';
}

export interface DashboardFieldCatalogue {
  status: 'complete' | 'partial' | 'unavailable';
  /** Why the schema could not be described, when unavailable. */
  reason?: string;
  recordType: string;
  workflowStage?: string;
  fields: DashboardFieldInfo[];
  /** Path prefixes whose contents the schema does not describe (anything below is allowed). */
  openPrefixes: string[];
}

/** Record fields maintained by ReDBox rather than the form. */
export const DASHBOARD_SYSTEM_FIELDS: DashboardFieldInfo[] = [
  { path: 'metaMetadata.createdOn', label: 'Created', type: 'string', repeated: false, source: 'system' },
  { path: 'metaMetadata.lastSaveDate', label: 'Last modified', type: 'string', repeated: false, source: 'system' },
  { path: 'metaMetadata.createdBy', label: 'Created by (username)', type: 'string', repeated: false, source: 'system' },
  { path: 'metaMetadata.type', label: 'Record type', type: 'string', repeated: false, source: 'system' },
  { path: 'metaMetadata.packageType', label: 'Package type', type: 'string', repeated: false, source: 'system' },
  { path: 'workflow.stage', label: 'Workflow stage', type: 'string', repeated: false, source: 'system' },
  { path: 'workflow.stageLabel', label: 'Workflow stage label', type: 'string', repeated: false, source: 'system' }
];

/** Top-level record areas maintained by ReDBox; paths below them are not checked against the form schema. */
const SYSTEM_ROOTS = ['metaMetadata', 'workflow', 'authorization', 'redboxOid', 'oid'];

const MAX_DEPTH = 12;
const MAX_FIELDS = 2000;

type JsonSchemaNode = Record<string, unknown>;

function isObject(value: unknown): value is JsonSchemaNode {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function humanise(segment: string): string {
  const words = segment.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : segment;
}

export function labelForFieldPath(path: string): string {
  const segments = path.split('.').filter((s) => s && s !== 'metadata');
  return segments.map(humanise).join(' › ') || path;
}

function schemaTypes(node: JsonSchemaNode): string[] {
  const type = node['type'];
  if (typeof type === 'string') {
    return [type];
  }
  return Array.isArray(type) ? type.filter((t): t is string => typeof t === 'string') : [];
}

/**
 * Flatten a record JSON Schema (draft 2020-12) into leaf field paths under the
 * given root (`metadata` for record metadata).
 */
export function flattenRecordJsonSchema(document: unknown, root = 'metadata'): { fields: DashboardFieldInfo[]; openPrefixes: string[] } {
  const fields = new Map<string, DashboardFieldInfo>();
  const openPrefixes = new Set<string>();
  const defs = isObject(document) && isObject(document['$defs']) ? (document['$defs'] as Record<string, unknown>) : {};

  const resolve = (node: JsonSchemaNode, seen: Set<string>): JsonSchemaNode | null => {
    const ref = node['$ref'];
    if (typeof ref !== 'string') {
      return node;
    }
    const match = /^#\/\$defs\/(.+)$/.exec(ref);
    const key = match ? decodeURIComponent(match[1].replace(/~1/g, '/').replace(/~0/g, '~')) : null;
    if (!key || seen.has(key) || !isObject(defs[key])) {
      return null;
    }
    seen.add(key);
    return { ...(defs[key] as JsonSchemaNode), ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref')) };
  };

  const addLeaf = (path: string, type: DashboardFieldType, repeated: boolean, node: JsonSchemaNode) => {
    if (fields.size >= MAX_FIELDS || fields.has(path)) {
      return;
    }
    const info: DashboardFieldInfo = { path, label: labelForFieldPath(path), type, repeated, source: 'schema' };
    if (Array.isArray(node['enum'])) {
      info.enum = (node['enum'] as unknown[]).filter((v): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v));
    }
    if (typeof node['description'] === 'string') {
      info.description = node['description'];
    }
    fields.set(path, info);
  };

  const walk = (input: unknown, path: string, repeated: boolean, depth: number, seen: Set<string>) => {
    if (!isObject(input) || depth > MAX_DEPTH) {
      return;
    }
    const node = resolve(input, new Set(seen));
    if (!node) {
      return;
    }
    for (const combinator of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(node[combinator])) {
        (node[combinator] as unknown[]).forEach((branch) => walk(branch, path, repeated, depth + 1, seen));
      }
    }
    for (const conditional of ['then', 'else']) {
      walk(node[conditional], path, repeated, depth + 1, seen);
    }
    const types = schemaTypes(node);
    const properties = isObject(node['properties']) ? (node['properties'] as Record<string, unknown>) : null;
    if (properties || types.includes('object')) {
      for (const [name, child] of Object.entries(properties ?? {})) {
        walk(child, path ? `${path}.${name}` : name, repeated, depth + 1, seen);
      }
      if (node['additionalProperties'] !== false && node['unevaluatedProperties'] !== false) {
        openPrefixes.add(path);
      }
      return;
    }
    if (types.includes('array') || node['items'] !== undefined) {
      if (isObject(node['items']) && (isObject((node['items'] as JsonSchemaNode)['properties']) || schemaTypes(node['items'] as JsonSchemaNode).includes('object') || typeof (node['items'] as JsonSchemaNode)['$ref'] === 'string')) {
        walk(node['items'], path, true, depth + 1, seen);
      } else {
        const itemTypes = isObject(node['items']) ? schemaTypes(node['items'] as JsonSchemaNode) : [];
        addLeaf(path, (itemTypes.find((t) => t !== 'null') as DashboardFieldType) ?? 'array', true, isObject(node['items']) ? (node['items'] as JsonSchemaNode) : node);
      }
      return;
    }
    const scalar = types.find((t) => t !== 'null');
    if (scalar) {
      addLeaf(path, scalar as DashboardFieldType, repeated, node);
    } else if (path && !Array.isArray(node['allOf']) && !Array.isArray(node['anyOf']) && !Array.isArray(node['oneOf']) && node['then'] === undefined) {
      // No type information: an unsupported or permissive region.
      openPrefixes.add(path);
    }
  };

  walk(document, root, false, 0, new Set());
  return { fields: Array.from(fields.values()).sort((a, b) => a.path.localeCompare(b.path)), openPrefixes: Array.from(openPrefixes).filter((p) => p !== root || fields.size === 0) };
}

/** True when the catalogue knows the path, a parent of it, or cannot say. */
export function isKnownFieldPath(catalogue: DashboardFieldCatalogue, path: string): boolean {
  if (catalogue.status === 'unavailable' || !path) {
    return true;
  }
  const trimmed = path.trim();
  if (SYSTEM_ROOTS.some((root) => trimmed === root || trimmed.startsWith(`${root}.`))) {
    return true;
  }
  if (catalogue.fields.some((f) => f.path === trimmed || f.path.startsWith(`${trimmed}.`))) {
    return true;
  }
  return catalogue.openPrefixes.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}.`));
}

/** Record field paths used by settings, with the settings location that uses each. */
export function collectSettingsFieldPaths(settings: {
  tableConfig: {
    rowConfig: Array<{ variable?: unknown; secondarySort?: unknown }>;
    formatRules: {
      filterBy?: Record<string, unknown>;
      queryFilters?: Record<string, Array<{ filterFields?: Array<{ path?: unknown }> }>>;
      sortBy?: unknown;
      sortGroupBy?: Array<Record<string, unknown>>;
    };
  };
}): Array<{ settingsPath: string; fieldPath: string }> {
  const result: Array<{ settingsPath: string; fieldPath: string }> = [];
  const add = (settingsPath: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      result.push({ settingsPath, fieldPath: value.trim() });
    }
  };
  const table = settings.tableConfig;
  (table.rowConfig ?? []).forEach((row, i) => {
    add(`tableConfig.rowConfig[${i}].variable`, row?.variable);
    add(`tableConfig.rowConfig[${i}].secondarySort`, row?.secondarySort);
  });
  const formatRules = table.formatRules ?? {};
  add('tableConfig.formatRules.filterBy.filterField', formatRules.filterBy?.['filterField']);
  for (const [key, filters] of Object.entries(formatRules.queryFilters ?? {})) {
    (Array.isArray(filters) ? filters : []).forEach((filter, i) =>
      (filter?.filterFields ?? []).forEach((field, j) => add(`tableConfig.formatRules.queryFilters.${key}[${i}].filterFields[${j}].path`, field?.path))
    );
  }
  if (typeof formatRules.sortBy === 'string') {
    add('tableConfig.formatRules.sortBy', formatRules.sortBy.split(':')[0]);
  }
  (formatRules.sortGroupBy ?? []).forEach((level, i) => {
    add(`tableConfig.formatRules.sortGroupBy[${i}].compareField`, level?.['compareField']);
    add(`tableConfig.formatRules.sortGroupBy[${i}].relatedTo`, level?.['relatedTo']);
  });
  return result;
}
