import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';
import { resolveContextSchema, safeSchemaKey } from './schema-utils';
import { pathSegments, readTemplatePath, templateSegment } from './template-path';

export interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

/** Character offset of a one-based line and column, or -1 when out of range. */
export function offsetAt(source: string, line: number, column: number): number {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return -1;
  let offset = 0;
  for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
  if (column < 1 || column - 1 > lines[line - 1].length) return -1;
  return offset + column - 1;
}

/** The whole Handlebars path at a diagnostic position, read from local source. */
export function pathAt(source: string, line: number, column: number): string | null {
  const offset = offsetAt(source, line, column);
  if (offset < 0) return null;
  return readTemplatePath(source.slice(offset));
}

/** Uses exact server AST-part metadata, or unambiguous absolute schema lookup.
 * Relative paths without segment metadata are deliberately not guessed.
 */
export function suggestionEdit(
  source: string,
  position: { line: number; column: number; segmentIndex?: number },
  suggestion: string,
  schema?: EmailContextSchema | null
): SourceEdit | null {
  const replacement = templateSegment(suggestion);
  if (!replacement) return null;
  const offset = offsetAt(source, position.line, position.column);
  const path = offset < 0 ? null : pathAt(source, position.line, position.column);
  if (!path) return null;
  const segments = pathSegments(path);
  // Handlebars AST parts omit this and ../, but retain the root data part.
  if (segments[0]?.name === 'this' && !path.startsWith('[this]')) segments.shift();
  if (!segments.length) return null;
  if (position.segmentIndex !== undefined) {
    if (!Number.isInteger(position.segmentIndex)) return null;
    const segment = segments[position.segmentIndex];
    if (!segment || segment.name === suggestion) return null;
    return { start: offset + segment.start, end: offset + segment.end, text: replacement };
  }
  let target = -1;
  const names = segments.map(segment => segment.name);
  const absolute = names[0] === '@root' ? names.slice(1) : /^(?:this|\.\.|@)/.test(path) ? null : names;
  if (absolute && schema) {
    const skip = names.length - absolute.length;
    let node: EmailContextSchema = schema;
    let resolved = true;
    for (let i = 0; i < absolute.length; i++) {
      node = resolveContextSchema(node, schema);
      const name = absolute[i];
      const next: EmailContextSchema | undefined =
        safeSchemaKey(name) && node.properties && Object.hasOwn(node.properties, name)
          ? node.properties[name]
          : undefined;
      if (!next) {
        resolved = false;
        if (node.properties && Object.hasOwn(node.properties, suggestion)) target = i + skip;
        break;
      }
      node = next;
    }
    // Every segment is known: the source no longer matches the warning.
    if (resolved) return null;
  }
  if (target < 0 || segments[target].name === suggestion) return null;
  const start = offset + segments[target].start;
  return { start, end: offset + segments[target].end, text: replacement };
}
