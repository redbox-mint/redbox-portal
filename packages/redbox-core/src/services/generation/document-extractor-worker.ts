import { parentPort, workerData } from 'node:worker_threads';
import type { GenerationDocumentFormat } from '@researchdatabox/sails-ng-common';

interface ExtractionInput {
  bytes: Uint8Array;
  format: GenerationDocumentFormat;
  maxTextBytes: number;
  maxPages: number;
}

async function extract(input: ExtractionInput): Promise<Array<{ text: string; location: string }>> {
  const passages: Array<{ text: string; location: string }> = [];
  let total = 0;
  const add = (text: string, location: string) => {
    text = text.replace(/\r\n/g, '\n').trim();
    total += Buffer.byteLength(text, 'utf8');
    if (total > input.maxTextBytes) throw new Error('limit');
    if (text) passages.push({ text, location });
  };
  if (input.format === 'pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(input.bytes),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > input.maxPages) throw new Error('limit');
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        add(
          content.items.map(item => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')).join(''),
          `Page ${number}`
        );
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else {
    let text: string;
    if (input.format === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) })).value;
    } else {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
      if (
        [...text].some(character => {
          const code = character.charCodeAt(0);
          return code < 9 || (code > 13 && code < 32);
        })
      )
        throw new Error('unreadable');
    }
    text.split(/\n\s*\n/).forEach((paragraph, index) => add(paragraph, `Paragraph ${index + 1}`));
  }
  if (!passages.length) throw new Error('unreadable');
  return passages;
}

void extract(workerData as ExtractionInput).then(
  passages => parentPort?.postMessage({ passages }),
  (error: unknown) =>
    parentPort?.postMessage({ error: error instanceof Error && error.message === 'limit' ? 'limit' : 'unreadable' })
);
