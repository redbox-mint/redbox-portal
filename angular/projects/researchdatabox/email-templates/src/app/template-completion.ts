import { blockHelperScaffold } from './helper-usage';
import type { ContextSchemaField } from './schema-fields';
import { pathParent, pathSegments, templatePathTokenEnd } from './template-path';

/** What the editor can suggest: schema fields, plus the allowlisted roots and helpers. */
export interface CompletionSource {
  fields: ContextSchemaField[];
  roots: string[];
  helpers: string[];
}

export interface CompletionQuery {
  /** Replacement range: the whole path token around the caret. */
  start: number;
  end: number;
  /** Token text before the caret. */
  prefix: string;
  /** Directly after `{{`/`{{#`, where helpers are also offered. */
  head: boolean;
  /** `{{#` or `{{^` block opener. */
  block: boolean;
  triple: boolean;
}

export interface CompletionItem {
  kind: 'field' | 'root' | 'helper';
  /** Last path segment, or the helper name. */
  label: string;
  /** Full path or helper name to insert. */
  value: string;
  type: string;
  title?: string;
  required?: boolean;
  /** Objects drill down: accepting inserts `path.` and keeps suggesting. */
  container: boolean;
}

export interface CompletionEdit {
  start: number;
  end: number;
  text: string;
  /** Selection offsets relative to the inserted text. */
  selection?: { start: number; end: number };
}

const MAX_ITEMS = 50;

/** Finds an open, unclosed mustache around the caret and the path being typed in it. */
export function completionQuery(text: string, caret: number, helpers: string[] = []): CompletionQuery | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf('{{');
  if (open < 0) return null;
  let first = open;
  while (first > 0 && before[first - 1] === '{') first--;
  const triple = open - first >= 1;
  let inner = before.slice(open + 2);
  if (triple && inner.startsWith('{')) inner = inner.slice(1);
  inner = inner.replace(/^~/, '').replace(/^\s+/, '');
  if (/^[!>/&]/.test(inner) || /^else\b/.test(inner)) return null;
  const block = /^[#^]/.test(inner);
  if (block) inner = inner.slice(1).replace(/^\s+/, '');
  let tokenStart = 0;
  let bracket = false;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '[') bracket = true;
    else if (inner[i] === ']') bracket = false;
    else if (!bracket && inner.startsWith('}}', i)) return null;
    else if (/\s/.test(inner[i]) && !bracket) tokenStart = i + 1;
  }
  const prefix = inner.slice(tokenStart);
  if (/^\d/.test(prefix)) return null;
  const rest = inner.slice(0, inner.length - prefix.length);
  const head = rest === '';
  if (!head) {
    // Only complete arguments of known helpers, e.g. `{{#each ` or `{{formatDate `.
    const words = rest.trim().split(/\s+/);
    if (!/\s$/.test(rest) || !helpers.includes(words[0])) return null;
  }
  const start = caret - prefix.length;
  const tokenEnd = templatePathTokenEnd(text.slice(start));
  if (tokenEnd < prefix.length) return null;
  const end = start + tokenEnd;
  return { start, end, prefix, head, block, triple };
}

/** Children of the typed parent path, ranked prefix matches first. */
export function completionItems(query: CompletionQuery, source: CompletionSource): CompletionItem[] {
  const scope = /^(?:@root[./]|this[./]|(?:\.\.\/)+|\.\/)/.exec(query.prefix)?.[0] ?? '';
  const prefix = query.prefix.slice(scope.length).replace(/\[[^\]]*\]|\//g, token => (token === '/' ? '.' : token));
  if (prefix.startsWith('@')) return [];
  // Find separators outside segment literals, including an unfinished literal.
  let dot = -1;
  let bracket = false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === '[') bracket = true;
    else if (prefix[i] === ']') bracket = false;
    else if (prefix[i] === '.' && !bracket) dot = i;
  }
  const parent = dot < 0 ? '' : prefix.slice(0, dot);
  const partial = prefix
    .slice(dot + 1)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase();
  const items: CompletionItem[] = [];
  const parents = new Set(source.fields.map(field => pathParent(field.path)));
  for (const field of source.fields) {
    if (field.path.includes('[]')) continue;
    if (pathParent(field.path) !== parent) continue;
    const label = pathSegments(field.path).pop()!.name;
    items.push({
      kind: 'field',
      label,
      value: scope + field.path,
      type: field.type,
      title: field.title,
      required: field.required,
      container: !field.isArray && parents.has(field.path),
    });
  }
  if (!parent) {
    for (const root of source.roots) {
      if (!items.some(item => item.value === scope + root))
        items.push({ kind: 'root', label: root, value: scope + root, type: 'any', container: false });
    }
    if (query.head && !scope) {
      const helpers = source.helpers.map(
        (name): CompletionItem => ({ kind: 'helper', label: name, value: name, type: 'helper', container: false })
      );
      items.splice(query.block ? 0 : items.length, 0, ...helpers);
    }
  }
  const starts = items.filter(item => item.label.toLowerCase().startsWith(partial));
  const contains = partial
    ? items.filter(item => !item.label.toLowerCase().startsWith(partial) && item.label.toLowerCase().includes(partial))
    : [];
  return [...starts, ...contains].slice(0, MAX_ITEMS);
}

/** The edit for accepting an item. Leaves in a plain mustache get their closing braces. */
export function completionEdit(text: string, query: CompletionQuery, item: CompletionItem): CompletionEdit {
  if (item.kind === 'helper') {
    const scaffold = blockHelperScaffold(item.value);
    const remaining = text.slice(query.end);
    const closing = /^\s*~?}}}?/.exec(remaining);
    // Arguments or this block's own close belong to the existing expression.
    // Only scaffold a new, otherwise-empty expression (including auto-closed braces).
    const ownsClose = !!closing && query.block && ownsFollowingClose(remaining.slice(closing[0].length), item.value);
    const fresh = /^\s*$/.test(remaining) || (!!closing && !ownsClose);
    if (scaffold && query.head && fresh) {
      let open = text.lastIndexOf('{{', query.start);
      while (open > 0 && text[open - 1] === '{') open--;
      // Keep an inverse opener (`{{^`) inverse; the scaffold is otherwise identical in length.
      const inverse = /^\{+~?\s*\^/.test(text.slice(open, query.start));
      const block = inverse ? scaffold.replace(/^\{\{#/, '{{^') : scaffold;
      const placeholder = /YOUR_[A-Z]+/.exec(block)!;
      return {
        start: open,
        end: query.end + (closing?.[0].length ?? 0),
        text: block,
        selection: { start: placeholder.index, end: placeholder.index + placeholder[0].length },
      };
    }
    return { start: query.start, end: query.end, text: scaffold ? item.value : `${item.value} ` };
  }
  if (item.container) return { start: query.start, end: query.end, text: `${item.value}.` };
  let insert = item.value;
  const close = query.triple ? '}}}' : '}}';
  if (query.head && !query.block && !/^\s*~?}}/.test(text.slice(query.end))) insert += close;
  return { start: query.start, end: query.end, text: insert };
}

/**
 * Whether the first unmatched block close after an opener belongs to it: blocks opened
 * in between are skipped, and a close for a different helper belongs to an outer block.
 */
function ownsFollowingClose(after: string, helper: string): boolean {
  let depth = 0;
  const tags = /{{~?\s*([#^/])\s*([^\s}~]*)/g;
  for (let tag = tags.exec(after); tag; tag = tags.exec(after)) {
    if (tag[1] !== '/') {
      if (tag[2]) depth++; // `{{^}}` alone is an else, not an opener.
      continue;
    }
    if (depth > 0) {
      depth--;
      continue;
    }
    return tag[2] === helper;
  }
  return false;
}
