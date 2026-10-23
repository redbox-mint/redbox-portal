import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

/**
 * Write binary chunks without abandoning dispatched GridFS writes on source failure.
 * @internal First-party GridFS owners only; no repository or hook contract.
 */
export async function writeGridFSStream(contents: Readable, upload: Writable, chunkSizeBytes: number): Promise<void> {
  const completed = finished(upload, { cleanup: true });
  // Construction/write errors can arrive before the source iterator yields.
  void completed.catch(error => {
    contents.destroy(error);
  });
  try {
    for await (const chunk of contents) {
      // Match Node's writable byte interpretation, including non-Uint8 views.
      // Buffer.from(view) alone truncates multi-byte elements and accepts arrays.
      if (typeof chunk !== 'string' && !ArrayBuffer.isView(chunk))
        throw Object.assign(new TypeError('GridFS upload requires string or binary chunks.'), {
          code: 'ERR_INVALID_ARG_TYPE',
        });
      const buffer =
        typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      // The driver dispatches every full GridFS chunk in one write concurrently
      // and reports its first failure early. Bound each write to one DB insert.
      for (let offset = 0; offset < buffer.length; offset += chunkSizeBytes) {
        await new Promise<void>((resolve, reject) => {
          upload.write(buffer.subarray(offset, offset + chunkSizeBytes), error => {
            // Capture the failure before iterator cleanup can add its own AbortError.
            if (error) reject(contents.errored ?? upload.errored ?? error);
            else resolve();
          });
        });
      }
    }
    upload.end();
    await completed;
  } finally {
    contents.destroy();
    upload.destroy();
    await completed.catch(() => {});
  }
}
