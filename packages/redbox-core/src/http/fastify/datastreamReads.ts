import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Readable } from 'node:stream';
import { executeDatastreamRead, datastreamReadPrelude, type DatastreamReadInput } from '../actions/datastreamReads';
import { readRequest } from './readActions';
import { sendReadStream } from './readStreams';
import { sendSerializedJson } from './responses';

/** No second stream owner: the existing qualified helper owns delivery,
 * cancellation and asynchronous disposal, including generated HEAD responses. */
export async function datastreamReadAction(
  request: FastifyRequest,
  reply: FastifyReply,
  input: DatastreamReadInput,
  action: string,
  browser: boolean,
  notFound?: () => Promise<unknown>
) {
  const result = await executeDatastreamRead(input, readRequest(request), action, browser, !!notFound);
  if (result.kind === 'missing-attachment') return notFound!();
  if (result.kind === 'stream') {
    await sendReadStream(reply, result.body as Readable, result.headers);
    return;
  }
  if (result.kind === 'json') return sendSerializedJson(request, reply, result);
  reply.headers(result.headers);
  return reply.send(Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.body));
}

export async function datastreamReadGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  input: DatastreamReadInput,
  action: string
) {
  const result = await datastreamReadPrelude(input, readRequest(request), action);
  if (result.kind === 'json') return sendSerializedJson(request, reply, result);
}
