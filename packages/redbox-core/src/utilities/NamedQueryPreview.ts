import { createContext, Script } from 'node:vm';

/** Server-owned limits. Callers cannot supply execution options through the draft DTO. */
export const NAMED_QUERY_PREVIEW_LIMITS = Object.freeze({
  inputBytes: 131072,
  depth: 24,
  nodes: 4000,
  timeMs: 5000,
  rows: 100,
  responseBytes: 524288,
  scanRows: 1000,
  mappings: 1024,
});

/** Count JSON bytes without ever materializing an expanded JSON string. Stop at the limit. */
export function boundedJsonBytes(value: unknown, limit: number): number {
  let bytes = 0;
  const ancestors = new Set<object>();
  const string = (text: string): void => {
    bytes += 2;
    // Even unescaped ASCII cannot fit. Avoid scanning a huge source string.
    if (text.length > limit - bytes) {
      bytes = limit + 1;
      return;
    }
    for (let i = 0; i < text.length && bytes <= limit; i++) {
      const code = text.charCodeAt(i);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) bytes += 2;
      else if (code < 32) bytes += 6;
      else if (code < 128) bytes++;
      else if (code < 2048) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdfff) {
        const next = text.charCodeAt(i + 1);
        if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          i++;
        } else bytes += 6; // JSON escapes lone surrogates.
      } else bytes += 3;
    }
  };
  const visit = (node: unknown, depth: number): void => {
    if (bytes > limit) return;
    if (node && typeof node === 'object' && 'toJSON' in node && typeof node.toJSON === 'function') node = node.toJSON(); // Dates and BSON identifiers follow the response serializer.
    if (node === null) bytes += 4;
    else if (typeof node === 'string') string(node);
    else if (typeof node === 'number') bytes += String(Number.isFinite(node) ? node : null).length;
    else if (typeof node === 'boolean') bytes += node ? 4 : 5;
    else if (typeof node === 'object') {
      if (depth > 100 || ancestors.has(node)) {
        bytes = limit + 1;
        return;
      }
      ancestors.add(node);
      bytes += 2;
      let first = true;
      if (Array.isArray(node)) {
        for (const child of node) {
          if (bytes > limit) break;
          if (!first) bytes++;
          first = false;
          visit(
            child === undefined || typeof child === 'function' || typeof child === 'symbol' ? null : child,
            depth + 1
          );
        }
      } else {
        const properties = node as Record<string, unknown>;
        for (const key in node) {
          if (bytes > limit) break;
          if (!Object.hasOwn(node, key)) continue;
          const child = properties[key];
          if (child === undefined || typeof child === 'function' || typeof child === 'symbol') continue;
          if (!first) bytes++;
          first = false;
          string(key);
          bytes++;
          visit(child, depth + 1);
        }
      }
      ancestors.delete(node);
    } else if (typeof node === 'bigint') bytes = limit + 1;
  };
  visit(value, 0);
  return Math.min(bytes, limit + 1);
}

/** These execution paths use Waterline/populate or hooks with no cancellable database deadline. */
export function previewDeadlineIssue(definition: Record<string, unknown>): string | undefined {
  if (definition.collectionName !== 'record')
    return 'Preview requires native record queries; this collection cannot guarantee a database deadline.';
  if (definition.expandRelations === true) return 'Relation expansion cannot guarantee a database deadline in preview.';
  if (Array.isArray(definition.relatedRecordFilters) && definition.relatedRecordFilters.length)
    return 'Related-filter reads cannot guarantee a database deadline in preview.';
}

export class NamedQueryAssistanceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
  }
}

export function checkDraftBudget(value: unknown): void {
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    if (++nodes > NAMED_QUERY_PREVIEW_LIMITS.nodes || depth > NAMED_QUERY_PREVIEW_LIMITS.depth)
      throw new NamedQueryAssistanceError('COMPLEXITY_LIMIT', 413);
    if (node && typeof node === 'object') {
      for (const child of Object.values(node)) visit(child, depth + 1);
    }
  };
  // Check depth before serialization (also bounds cyclic/non-JSON service callers).
  visit(value, 0);
  if (value && typeof value === 'object' && 'definition' in value) {
    const definition = value.definition;
    if (
      definition &&
      typeof definition === 'object' &&
      'resultObjectMapping' in definition &&
      definition.resultObjectMapping &&
      typeof definition.resultObjectMapping === 'object' &&
      Object.keys(definition.resultObjectMapping).length > NAMED_QUERY_PREVIEW_LIMITS.mappings
    )
      throw new NamedQueryAssistanceError('MAPPING_LIMIT', 413);
  }
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > NAMED_QUERY_PREVIEW_LIMITS.inputBytes)
    throw new NamedQueryAssistanceError('INPUT_LIMIT', 413);
}

/** One deadline for permitted preview database operations and synchronous rendering. */
export class NamedQueryExecutionBudget {
  private readonly deadline: number;
  private outputBytes = 0;
  public outputTruncated = false;
  private readonly context = createContext({ operation: (): unknown => undefined });
  private readonly script = new Script('operation()');
  constructor(timeMs: number = NAMED_QUERY_PREVIEW_LIMITS.timeMs) {
    this.deadline = Date.now() + timeMs;
  }
  remaining(): number {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408);
    return remaining;
  }
  remainingOutputBytes(): number {
    return NAMED_QUERY_PREVIEW_LIMITS.responseBytes - this.outputBytes;
  }
  /** Account for each mapped value before retaining it or rendering another alias/row. */
  output(value: unknown): boolean {
    const bytes = this.run(() => boundedJsonBytes(value, NAMED_QUERY_PREVIEW_LIMITS.responseBytes - this.outputBytes));
    if (this.outputBytes + bytes > NAMED_QUERY_PREVIEW_LIMITS.responseBytes) {
      this.outputTruncated = true;
      return false;
    }
    this.outputBytes += bytes;
    return true;
  }
  /** Interrupt synchronous templates/helpers as well as awaiting asynchronous operations. */
  run<T>(operation: () => T): T {
    this.context.operation = operation;
    try {
      return this.script.runInContext(this.context, { timeout: this.remaining() }) as T;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT')
        throw new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408);
      throw error;
    } finally {
      this.context.operation = () => undefined;
    }
  }
  async wait<T>(operation: PromiseLike<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(operation),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408)), this.remaining());
        }),
      ]);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 50)
        throw new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  scan(count: number): void {
    this.remaining();
    if (count > NAMED_QUERY_PREVIEW_LIMITS.scanRows) throw new NamedQueryAssistanceError('PREVIEW_SCAN_LIMIT', 422);
  }
  query(value: unknown): void {
    checkDraftBudget(value);
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      for (const [key, child] of Object.entries(node)) {
        if (
          ['$where', '$function', '$accumulator', '__proto__', 'prototype', 'constructor'].some(part =>
            key.split('.').includes(part)
          )
        )
          throw new NamedQueryAssistanceError('PREVIEW_UNSAFE_QUERY', 422);
        visit(child);
      }
    };
    visit(value);
  }
}
