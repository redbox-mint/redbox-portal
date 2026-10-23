import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

/**
 * Drain GridFS reads before closing their cursor, including initial responses.
 * @internal First-party binary owners only; retain the pinned-driver live tests.
 */
export function ownGridFSDownload(stream: Readable & { abort?: () => Promise<void> }): Promise<void> {
  // The driver intentionally strips this private state from its declarations.
  // Keep its narrow, pinned ABI inside this binary adapter, never in a contract.
  const state = stream as Readable & {
    s?: { cursor?: { next(): Promise<unknown>; close(): Promise<void> } };
  };
  const pending = new Set<Promise<unknown>>();
  let restore = () => {};
  const onFile = () => {
    const cursor = state.s?.cursor;
    if (!cursor) return;
    const next = cursor.next;
    // Driver 7.7 can finish abort() before an initializing next() receives its
    // server ID. Observe that private promise inside the concrete byte owner;
    // early cursor.close() would end its session and prevent a later kill.
    cursor.next = function (this: typeof cursor) {
      const work = next.call(this);
      pending.add(work);
      void work.then(
        () => pending.delete(work),
        () => pending.delete(work)
      );
      return work;
    };
    restore = () => {
      cursor.next = next;
    };
  };
  stream.once('file', onFile);
  const abort = stream.abort?.bind(stream);
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing)
      closing = (async () => {
        stream.destroy();
        while (pending.size) await Promise.allSettled(pending);
        try {
          await abort?.();
        } finally {
          try {
            await state.s?.cursor?.close();
          } finally {
            restore();
          }
        }
      })();
    return closing;
  };
  if (abort) stream.abort = close;
  return finished(stream, { cleanup: true }).finally(async () => {
    stream.removeListener('file', onFile);
    await (stream.abort ? stream.abort() : close());
  });
}
