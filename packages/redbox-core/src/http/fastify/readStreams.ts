import { PassThrough, type Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { FastifyReply } from 'fastify';
import { writeHttpError } from './errorBoundary';
const exportsInFlight = new WeakSet<object>();
/** Private qualification seam: only owned domain read streams enter this allowlist. */
export const isOwnedReadStream = (value: unknown): value is Readable =>
  !!value && typeof value === 'object' && exportsInFlight.has(value);
/** Run after onSend replacements: only the retained export gets GET framing. */
export function prepareReadStreamHead(reply: FastifyReply, payload: unknown): boolean {
  if (!isOwnedReadStream(payload)) return false;
  if (!reply.hasHeader('Content-Length') && !reply.hasHeader('Transfer-Encoding'))
    reply.header(
      payload.readableLength ? 'Transfer-Encoding' : 'Content-Length',
      payload.readableLength ? 'chunked' : '0'
    );
  return true;
}
export async function sendReadStream(
  reply: FastifyReply,
  source: Readable,
  headers?: Readonly<Record<string, string>>
): Promise<void> {
  const output = new PassThrough();
  exportsInFlight.add(output);
  let firstByte = false,
    failed = false;
  const failure = () => {
    if (failed || reply.raw.destroyed || reply.raw.writableEnded) return;
    failed = true;
    if (firstByte || reply.raw.headersSent) {
      reply.log.error({ req: reply.request }, 'HTTP_STREAM_FAILED');
      reply.raw.destroy();
    } else writeHttpError(new Error('Record export failed'), { request: reply.request, reply });
    cancel();
  };
  // Observe delivery only once the HTTP consumer resumes the output, without
  // putting a data listener into flowing mode before the onSend handoff.
  const delivered = () => {
    firstByte = true;
  };
  const consuming = () => output.once('data', delivered);
  output.once('resume', consuming);
  const sourceFailure = () => {
    if (!source.readableEnded) failure();
  };
  source.once('error', sourceFailure);
  output.once('error', failure);
  const ready = Promise.withResolvers<void>();
  output.once('readable', ready.resolve);
  const cancel = () => {
    if (!output.readableEnded) {
      source.destroy();
      output.destroy();
    }
  };
  // A disconnect/replacement must also cancel a source that has not produced
  // its first chunk yet. Completion alone never releases disposal ownership.
  const completion = Promise.resolve(reply);
  void completion.then(cancel, cancel);
  // EOF ends the HTTP output independently of asynchronous source disposal.
  // Unlike pipeline(), pipe() cannot destroy that completed representation when
  // the source's later _destroy callback fails. Join BOTH disposal observations;
  // neither an early rejection nor response completion releases request ownership.
  const work = Promise.all([
    finished(source, { cleanup: true }).catch(() => {
      if (source.readableEnded) reply.log.error({ req: reply.request }, 'HTTP_STREAM_DISPOSAL_FAILED');
      else failure();
    }),
    finished(output, { cleanup: true }).catch(failure),
  ]);
  try {
    if (headers) reply.headers(headers);
    source.pipe(output);
    // Qualify an initial chunk or EOF before any success headers are committed.
    await Promise.race([ready.promise, work, completion]);
    if (failed || reply.raw.destroyed || reply.raw.writableEnded) return;
    reply.send(output);
    // Completion can mean a replacement response (for example a session-store
    // onSend failure), without Fastify consuming or destroying our output.
    await completion;
  } catch {
    failure();
    throw new Error('Record export failed');
  } finally {
    source.off('error', sourceFailure);
    output.off('error', failure);
    output.off('resume', consuming);
    output.off('data', delivered);
    output.off('readable', ready.resolve);
    // Every early/replaced/failed handoff cancels both ends. Await disposal even
    // when reply.send throws: an async source finalizer still borrows resources.
    cancel();
    try {
      await work;
    } finally {
      exportsInFlight.delete(output);
    }
  }
}
