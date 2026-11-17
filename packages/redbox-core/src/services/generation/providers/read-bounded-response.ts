import { GenerationError } from '../../../model/generation';

/** Bound the bytes retained from a provider before handing the body to the SDK. */
export async function readBoundedResponse(
  response: Response,
  maxResponseBytes: number,
  signal?: AbortSignal | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const oversized = () => new GenerationError(
    'GENERATION_OUTPUT_PARSE_FAILED',
    'Generation provider response exceeded the configured limit',
  );
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw oversized();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const abort = (): void => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) throw oversized();
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return body;
  } catch (error) {
    // Cancellation must start immediately; a slow transport must not delay rejection.
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
