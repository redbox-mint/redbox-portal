import { isObject } from './renderer';

interface Selection {
  whole: boolean;
  children: Map<string, Selection>;
}

export class ProjectionError extends Error {}

/** Pointer tokens select metadata only; arrays transparently apply the remainder to every row. */
export function projectMetadata(
  metadata: Readonly<Record<string, unknown>>,
  fields?: string
): Readonly<Record<string, unknown>> {
  if (fields === undefined) return metadata;
  if (!fields || Buffer.byteLength(fields) > 16_384) throw new ProjectionError('Invalid fields.');
  const selectors = fields.split(',');
  if (selectors.length > 50) throw new ProjectionError('Too many fields.');
  const root: Selection = { whole: false, children: new Map() };
  for (const selector of selectors) {
    if (!selector.startsWith('/') || /~(?![01])/.test(selector)) throw new ProjectionError('Invalid metadata pointer.');
    const tokens = selector
      .slice(1)
      .split('/')
      .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.length > 12) throw new ProjectionError('Projection is too deep.');
    let selection = root;
    for (const token of tokens) {
      let child = selection.children.get(token);
      if (!child) {
        child = { whole: false, children: new Map() };
        selection.children.set(token, child);
      }
      selection = child;
    }
    selection.whole = true;
  }
  let work = 10_000;
  const select = (value: unknown, selection: Selection): unknown => {
    if (--work < 0) throw new ProjectionError('Projection exceeds the stored-value work budget.');
    if (selection.whole || value === null) return value;
    if (Array.isArray(value)) {
      if (value.length > 1_000) throw new ProjectionError('Stored list exceeds the item bound.');
      return value.map(item => select(item, selection));
    }
    if (!isObject(value)) return null;
    return Object.fromEntries(
      [...selection.children]
        .filter(([key]) => Object.hasOwn(value, key))
        .map(([key, child]) => [key, select(value[key], child)])
    );
  };
  const projected = select(metadata, root);
  if (!isObject(projected)) throw new ProjectionError('Invalid metadata.');
  return projected;
}
