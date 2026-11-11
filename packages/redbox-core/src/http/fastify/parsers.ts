import { MIMEType } from 'node:util';
import { METHODS } from 'node:http';
import { createGunzip, createInflate, createBrotliDecompress, createZstdDecompress } from 'node:zlib';
import type { Readable, Transform } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import qs from 'qs';
import iconv from 'iconv-lite';
import { requestPathname } from './router';
import { requestText } from '../requestValues';
import type { FastifyPreparation } from './preparation';
import { HttpFailure } from './errorBoundary';

const limit = 1024 * 1024;
// Header values must never select inherited Object.prototype properties.
const decoders = new Map<string, () => Transform>([
  ['gzip', createGunzip],
  ['deflate', createInflate],
  ['br', createBrotliDecompress],
  ['zstd', createZstdDecompress],
]);
export class NativeParserError extends HttpFailure {
  constructor(readonly status: 400 | 413 | 415) {
    super(status);
  }
}
export interface NativeParserOptions {
  /** Complete root-aware, segment-bounded prefixes owned by raw integrations. */
  readonly parserExclusions?: readonly string[];
  /** Companion's retained mount uses Express's flat form parser. */
  readonly flatFormPrefixes?: readonly string[];
}

/** Exact core plugin, handed native parser streams only by the sealed adapter.
 * The returned async operation owns decoding, cancellation and cleanup. */
export async function nativeBodyParserPlugin(app: Pick<FastifyInstance, 'addHook'>, options: NativeParserOptions) {
  const exclusions = options.parserExclusions?.map(path => path.toLowerCase());
  const flatForms = options.flatFormPrefixes?.map(path => path.toLowerCase());
  if (
    [...(exclusions ?? []), ...(flatForms ?? [])].some(
      path => !path.startsWith('/') || path.endsWith('/') || /[?#]/.test(path)
    )
  )
    throw new TypeError('Parser exclusions require complete segment-bounded prefixes.');
  const parse = async (request: FastifyRequest, payload: Readable): Promise<unknown> => {
    // Match type-is.hasBody: absent framing skips charset/encoding checks too.
    if (request.headers['transfer-encoding'] === undefined && request.headers['content-length'] === undefined) return;
    const path = requestPathname(request.raw.url ?? '/')?.toLowerCase();
    if (exclusions?.some(prefix => path === prefix || path?.startsWith(prefix + '/'))) {
      return;
    }
    let type: MIMEType;
    try {
      type = new MIMEType(requestText(request.headers['content-type']) ?? 'application/octet-stream');
    } catch {
      return;
    }
    const json = type.essence === 'application/json';
    if (!json && type.essence !== 'application/x-www-form-urlencoded') {
      return;
    }
    let stream = payload;
    const disconnected = () => {
      if (stream !== payload) stream.destroy(new NativeParserError(400));
    };
    try {
      const charset = (type.params.get('charset') || 'utf-8').toLowerCase();
      if (json ? !charset.startsWith('utf-') : !['utf-8', 'iso-8859-1'].includes(charset))
        throw new NativeParserError(415);
      if (!iconv.encodingExists(charset)) throw new NativeParserError(415);
      const encoded = requestText(request.headers['content-encoding']);
      if (request.headers['content-encoding'] !== undefined && encoded === undefined) throw new NativeParserError(415);
      const encoding = (encoded || 'identity').toLowerCase();
      const decompress = decoders.get(encoding);
      if (encoding !== 'identity') {
        if (!decompress) throw new NativeParserError(415);
        stream = payload.pipe(decompress());
        payload.once('error', disconnected);
        payload.once('aborted', disconnected);
      }
      const chunks: Buffer[] = [];
      let length = 0;
      // Do not destroy the socket on a bounded parse failure: publish its safe
      // error, detach the decoder and drain the remaining incoming bytes.
      for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > limit) throw new NativeParserError(413);
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks, length);
      const text = charset === 'iso-8859-1' ? bytes.toString('latin1') : iconv.decode(bytes, charset);
      let body: unknown;
      if (json) {
        if (!text) body = {};
        else {
          if (!/^[ \t\n\r]*[[{]/.test(text)) throw new NativeParserError(400);
          body = JSON.parse(text);
        }
      } else {
        const count = text ? text.split('&', 1001).length : 0;
        if (count > 1000) throw new NativeParserError(413);
        body = qs.parse(text, {
          allowPrototypes: true,
          arrayLimit: Math.max(100, count),
          depth: flatForms?.some(prefix => path === prefix || path?.startsWith(prefix + '/')) ? 0 : 32,
          parameterLimit: 1000,
          strictDepth: true,
          charset: charset as 'utf-8' | 'iso-8859-1',
        });
      }
      return body;
    } catch (error) {
      payload.resume();
      throw error instanceof NativeParserError ? error : new NativeParserError(400);
    } finally {
      if (stream !== payload) {
        payload.unpipe(stream as Transform);
        stream.destroy();
      }
      payload.off('error', disconnected);
      payload.off('aborted', disconnected);
    }
  };
  app.addHook('preParsing', async (request, _reply, payload) => {
    request.body = await parse(request, payload);
    return payload;
  });
}
// Same root-scope marker used by the pinned native cookie/session plugins.
Object.defineProperty(nativeBodyParserPlugin, Symbol.for('skip-override'), { value: true });

export function prepareNativeParsers(app: FastifyPreparation, options: NativeParserOptions = {}): void {
  // Express parses every method. Own parsing in preParsing, before session I/O,
  // and bypass native media-type/bodyless-method decisions entirely. Unsupported
  // types remain unconsumed, with the original headers available to policies.
  for (const method of METHODS) app.addHttpMethod(method, { hasBody: false, overrideExisting: true });
  app.register(nativeBodyParserPlugin, options);
}
