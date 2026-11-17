import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { startBoundedDocumentParser } from './bounded-document-parser';
import type {
  GenerationDocument,
  GenerationDocumentFormat,
  GenerationDocumentPolicy,
} from '@researchdatabox/sails-ng-common';
import { GenerationError } from '../../model/generation';

let activeExtractions = 0;

/** Bound parsers by Linux address space, V8 heap, time, and concurrency. No file is retained. */
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
  if (process.platform !== 'linux') {
    throw new GenerationError(
      'GENERATION_DOCUMENT_UNREADABLE',
      'Document extraction requires the bounded Linux parser runtime'
    );
  }
  if (activeExtractions >= limits.concurrency) {
    throw new GenerationError('GENERATION_RATE_LIMITED', 'Document extraction is busy', true);
  }
  activeExtractions++;
  try {
    const passages = await new Promise<GenerationDocument['passages']>((resolve, reject) => {
      const parser = startBoundedDocumentParser(require.resolve('./document-extractor-worker'));
      let result: { passages?: GenerationDocument['passages']; error?: string } | undefined;
      let failure: GenerationError | undefined;
      const stop = (error?: GenerationError) => {
        failure ??= error;
        parser.kill('SIGKILL');
      };
      const timer = setTimeout(() => {
        stop(new GenerationError('GENERATION_DOCUMENT_LIMIT', 'Document extraction exceeded its time limit'));
      }, limits.timeoutMs);
      parser.once('message', (message: typeof result) => {
        clearTimeout(timer);
        result = message;
        stop();
      });
      parser.once('error', () => {
        stop(new GenerationError('GENERATION_DOCUMENT_UNREADABLE', 'Document extraction could not start'));
      });
      // Keep the concurrency slot until the bounded process has actually been reaped.
      parser.once('close', (code, signal) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (result?.passages?.length) resolve(result.passages);
        else if (result)
          reject(
            new GenerationError(
              result.error === 'limit' ? 'GENERATION_DOCUMENT_LIMIT' : 'GENERATION_DOCUMENT_UNREADABLE',
              'Document text could not be extracted'
            )
          );
        else
          reject(
            new GenerationError(
              signal || (code !== 0 && code !== 70 && code !== 127)
                ? 'GENERATION_DOCUMENT_LIMIT'
                : 'GENERATION_DOCUMENT_UNREADABLE',
              code === 70 || code === 127
                ? 'Document extraction sandbox could not start'
                : 'Document extraction stopped'
            )
          );
      });
      parser.send(
        {
          bytes,
          format,
          maxTextBytes: Math.min(policy.maxTextBytes, limits.maxTextBytes),
          maxPages: limits.maxPages,
        },
        error => {
          if (error) stop(new GenerationError('GENERATION_DOCUMENT_UNREADABLE', 'Document extraction could not start'));
        }
      );
    });
    return { id: randomUUID(), name, contentHash: createHash('sha256').update(bytes).digest('hex'), passages };
  } finally {
    activeExtractions--;
  }
}
