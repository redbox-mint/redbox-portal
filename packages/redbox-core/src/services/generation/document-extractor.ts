import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
  GenerationDocument,
  GenerationDocumentFormat,
  GenerationDocumentPolicy,
} from '@researchdatabox/sails-ng-common';
import { GenerationError } from '../../model/generation';

let activeExtractions = 0;

/** Bound expensive parsers separately from the application event loop. No file is retained. */
export async function extractGenerationDocument(
  filename: string,
  bytes: Buffer,
  policy: GenerationDocumentPolicy
): Promise<GenerationDocument> {
  const limits = sails.config.generation.documents;
  if (!bytes.length || bytes.length > Math.min(policy.maxFileBytes, limits.maxFileBytes)) {
    throw new GenerationError('GENERATION_DOCUMENT_LIMIT', 'Document exceeds its upload limit');
  }
  const name = [...(filename.split(/[\\/]/).at(-1) ?? '')]
    .filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 150);
  const format = extname(name).slice(1).toLowerCase() as GenerationDocumentFormat;
  if (
    !policy.formats.includes(format) ||
    (format === 'pdf' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') ||
    (format === 'docx' && !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])))
  ) {
    throw new GenerationError('GENERATION_DOCUMENT_INVALID', 'Document format is not supported');
  }
  if (activeExtractions >= limits.concurrency) {
    throw new GenerationError('GENERATION_RATE_LIMITED', 'Document extraction is busy', true);
  }
  activeExtractions++;
  try {
    const passages = await new Promise<GenerationDocument['passages']>((resolve, reject) => {
      const worker = new Worker(require.resolve('./document-extractor-worker'), {
        workerData: {
          bytes,
          format,
          maxTextBytes: Math.min(policy.maxTextBytes, limits.maxTextBytes),
          maxPages: limits.maxPages,
        },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
        execArgv: __filename.endsWith('.ts')
          ? ['--no-experimental-strip-types', '--require', 'ts-node/register/transpile-only']
          : [],
        stdout: true,
        stderr: true,
      });
      // Parser diagnostics can include source text; discard them rather than logging uploads.
      worker.stdout.resume();
      worker.stderr.resume();
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new GenerationError('GENERATION_DOCUMENT_LIMIT', 'Document extraction exceeded its time limit'));
      }, limits.timeoutMs);
      worker.once('message', (result: { passages?: GenerationDocument['passages']; error?: string }) => {
        clearTimeout(timer);
        void worker.terminate();
        if (result.passages?.length) resolve(result.passages);
        else
          reject(
            new GenerationError(
              result.error === 'limit' ? 'GENERATION_DOCUMENT_LIMIT' : 'GENERATION_DOCUMENT_UNREADABLE',
              'Document text could not be extracted'
            )
          );
      });
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new GenerationError('GENERATION_DOCUMENT_UNREADABLE', 'Document text could not be extracted'));
      });
      worker.once('exit', () => {
        clearTimeout(timer);
        reject(new GenerationError('GENERATION_DOCUMENT_UNREADABLE', 'Document extraction stopped'));
      });
    });
    return { id: randomUUID(), name, contentHash: createHash('sha256').update(bytes).digest('hex'), passages };
  } finally {
    activeExtractions--;
  }
}
