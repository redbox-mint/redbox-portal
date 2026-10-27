import Busboy from '@fastify/busboy';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Services as Disks } from '../../storage/StorageManager';
export interface MultipartFile {
  key: string;
  field: string;
  filename: string;
  mimeType: string;
  size: number;
}
export interface MultipartResult {
  fields: Record<string, string>;
  files: MultipartFile[];
}
export class MultipartError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
/** Streaming staging only. Callers authorize before receiving bytes and keep finalization in the callback. */
export class StreamingMultipart {
  private closing = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly cleanup = new Set<string>();
  constructor(
    private readonly disk: Pick<Disks.IDisk, 'putStream' | 'delete' | 'exists'>,
    private readonly limits: { files: number; fileSize: number; fields: number; fieldSize: number }
  ) {}
  quiesce(): void {
    this.closing = true;
  }
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled(this.pending);
  }
  async close(): Promise<void> {
    this.quiesce();
    await this.drain();
    for (const key of this.cleanup) {
      if (await this.disk.exists(key)) await this.disk.delete(key);
      this.cleanup.delete(key);
    }
  }
  receive<T>(request: IncomingMessage, consume: (result: MultipartResult) => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new MultipartError(503, 'Uploads are draining'));
    const work = this.receiveAccepted(request, consume);
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work)
    );
    return work;
  }
  private async receiveAccepted<T>(
    request: IncomingMessage,
    consume: (result: MultipartResult) => Promise<T>
  ): Promise<T> {
    // Authorization/session work can finish after the transport's abort event.
    // A parser attached to an already destroyed request would never settle.
    if (request.aborted || request.destroyed) throw new MultipartError(400, 'Upload cancelled');
    let parser: InstanceType<typeof Busboy>;
    try {
      const contentType = request.headers['content-type'];
      if (!contentType?.toLowerCase().startsWith('multipart/form-data')) throw new Error('Multipart required');
      parser = new Busboy({ headers: { ...request.headers, 'content-type': contentType }, limits: this.limits });
    } catch {
      throw new MultipartError(400, 'Invalid multipart request');
    }
    const result: MultipartResult = { fields: {}, files: [] },
      streams = new Set<Readable>(),
      writes: Promise<void>[] = [];
    const keys: string[] = [];
    let failure: Error | undefined;
    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      request.unpipe(parser);
      request.resume();
      for (const stream of streams) stream.destroy(error);
      parser.destroy(error);
    };
    const abort = () => fail(new MultipartError(400, 'Upload cancelled'));
    request.once('aborted', abort);
    request.once('error', abort);
    const completed = new Promise<void>((resolve, reject) => {
      // Busboy can report a malformed body before a staged write rejects.
      // Keep observing subsequent errors and cancel the remaining streams once.
      parser.on('error', () => {
        const error = failure ?? new MultipartError(400, 'Invalid multipart request');
        fail(error);
        reject(error);
      });
      parser.once('finish', resolve);
      parser.on('filesLimit', () => fail(new MultipartError(413, 'Too many files')));
      parser.on('fieldsLimit', () => fail(new MultipartError(413, 'Too many fields')));
      parser.on('partsLimit', () => fail(new MultipartError(413, 'Too many parts')));
      parser.on('field', (name, value, nameTruncated, valueTruncated) => {
        if (nameTruncated || valueTruncated) {
          fail(new MultipartError(413, 'Multipart field limit exceeded'));
          return;
        }
        if (name === '__proto__' || name === 'constructor' || Object.hasOwn(result.fields, name)) {
          fail(new MultipartError(400, 'Invalid or repeated multipart field'));
          return;
        }
        Object.defineProperty(result.fields, name, { value, enumerable: true });
      });
      parser.on('file', (field, stream, filename, _encoding, mimeType) => {
        const file = { key: randomUUID(), field, filename, mimeType, size: 0 };
        result.files.push(file);
        keys.push(file.key);
        this.cleanup.add(file.key);
        streams.add(stream);
        const counter = new Transform({
          transform(chunk, _encoding, callback) {
            file.size += chunk.length;
            callback(null, chunk);
          },
        });
        streams.add(counter);
        stream.once('limit', () => fail(new MultipartError(413, 'File size limit exceeded')));
        const copying = pipeline(stream, counter);
        const storing = (async () => {
          await this.disk.putStream(file.key, counter);
        })();
        // A failed parser pipeline can settle before the provider finishes its
        // write/abort cleanup. Retain both actual operations until cleanup/drain.
        writes.push(copying, storing);
        const write = Promise.all([copying, storing]).then(() => {
          streams.delete(stream);
          streams.delete(counter);
        });
        void write.catch(() => fail(new MultipartError(500, 'Failed to stage upload')));
      });
    });
    try {
      request.pipe(parser);
      await completed;
      const settled = await Promise.allSettled(writes);
      if (failure || settled.some(r => r.status === 'rejected'))
        throw failure ?? new MultipartError(500, 'Failed to stage upload');
      return await consume(result);
    } finally {
      request.removeListener('aborted', abort);
      request.removeListener('error', abort);
      await Promise.allSettled(writes);
      // Ambiguous writes are cleaned with their known keys too. A failed delete remains owned for close/retry.
      const removals = await Promise.allSettled(
        keys.map(async key => {
          if (await this.disk.exists(key)) await this.disk.delete(key);
          this.cleanup.delete(key);
        })
      );
      if (removals.some(r => r.status === 'rejected'))
        throw new MultipartError(500, 'Upload staging cleanup failed; reconciliation is required');
    }
  }
}
