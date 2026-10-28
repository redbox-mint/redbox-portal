import type { ContextSchemaField } from './schema-fields';
import { pathParent, pathSegments, templateSegment } from './template-path';

export interface FieldNode {
  name: string;
  /** Presentation path; array item children keep the `[]` marker. */
  path: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  isArray: boolean;
  /** A root from the allowlist with no schema behind it (for example a hook root). */
  loose: boolean;
  children: FieldNode[];
}

export interface FieldRow {
  node: FieldNode;
  depth: number;
}

/** Nest flattened schema fields; allowlisted roots without a schema become loose leaves. */
export function buildFieldTree(fields: ContextSchemaField[], roots: string[]): FieldNode[] {
  const byPath = new Map<string, FieldNode>();
  const top: FieldNode[] = [];
  for (const field of fields) {
    const parentPath = pathParent(field.path);
    const node: FieldNode = {
      name: pathSegments(field.path).pop()!.name,
      path: field.path,
      type: field.type,
      title: field.title,
      description: field.description,
      required: field.required,
      isArray: field.isArray,
      loose: false,
      children: [],
    };
    byPath.set(field.path, node);
    const parent = parentPath ? byPath.get(parentPath.replace(/\[\]$/, '')) : null;
    if (!parentPath) top.push(node);
    else parent?.children.push(node);
  }
  for (const root of roots) {
    if (!byPath.has(root))
      top.push({ name: root, path: root, type: 'any', required: false, isArray: false, loose: true, children: [] });
  }
  return top;
}

/** Visible rows for the expanded state, depth first. */
export function visibleFieldRows(nodes: FieldNode[], expanded: ReadonlySet<string>, depth = 0): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length && expanded.has(node.path))
      rows.push(...visibleFieldRows(node.children, expanded, depth + 1));
  }
  return rows;
}

/** Roots that mirror the whole context for older templates; their matches are listed last. */
export const ALIAS_ROOTS = ['imports'];

/** Search across every field, matching the path, title or description. */
export function searchFieldRows(nodes: FieldNode[], query: string, limit = 100): FieldRow[] {
  const needle = query.trim().toLowerCase();
  const rows: FieldRow[] = [];
  const aliases: FieldRow[] = [];
  const visit = (list: FieldNode[], alias: boolean) => {
    for (const node of list) {
      if (rows.length + aliases.length >= limit) return;
      const haystack = [node.path, node.title ?? '', node.description ?? ''].join(' ').toLowerCase();
      if (haystack.includes(needle)) (alias ? aliases : rows).push({ node, depth: 0 });
      visit(node.children, alias);
    }
  };
  if (needle) for (const node of nodes) visit([node], ALIAS_ROOTS.includes(node.path));
  return [...rows, ...aliases];
}

/**
 * Handlebars to insert for a field. Scalars insert their absolute path; arrays
 * insert an `#each` scaffold; fields inside arrays are reached through nested
 * `#each` blocks with `this.` item paths, never literal `[]` brackets.
 */
export function fieldInsertion(node: FieldNode): string {
  const parts = node.path.split('[]');
  const leaf = parts.pop() ?? '';
  let indent = '';
  let open = '';
  let close = '';
  parts.forEach((part, index) => {
    const path = index === 0 ? part : `this${part}`;
    open += `${indent}{{#each ${path}}}\n`;
    close = `\n${indent}{{/each}}` + close;
    indent += '  ';
  });
  let inner: string;
  if (node.isArray) {
    const path = parts.length ? `this${leaf}` : leaf;
    const item =
      node.children.find(child => child.required && !child.children.length) ??
      node.children.find(child => !child.children.length);
    open += `${indent}{{#each ${path}}}\n`;
    close = `\n${indent}{{/each}}` + close;
    inner = `${indent}  {{${item ? `this.${templateSegment(item.name)}` : 'this'}}}`;
  } else {
    inner = `${indent}{{${parts.length ? `this${leaf}` : leaf}}}`;
  }
  return open + inner + close;
}
