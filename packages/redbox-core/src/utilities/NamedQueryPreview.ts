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
});

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
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > NAMED_QUERY_PREVIEW_LIMITS.inputBytes)
    throw new NamedQueryAssistanceError('INPUT_LIMIT', 413);
}

/** One deadline for the entire execution, including hooks and relation expansion. */
export class NamedQueryExecutionBudget {
  private readonly deadline: number;
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
