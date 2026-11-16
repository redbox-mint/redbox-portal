export const GENERATION_DOCUMENT_FORMATS = ['pdf', 'docx', 'txt'] as const;
export type GenerationDocumentFormat = (typeof GENERATION_DOCUMENT_FORMATS)[number];

export interface GenerationDocumentPolicy {
  formats: GenerationDocumentFormat[];
  maxFiles: number;
  maxFileBytes: number;
  maxTextBytes: number;
}

/** Extracted project evidence. Original files are discarded after extraction. */
export interface GenerationDocument {
  id: string;
  name: string;
  contentHash: string;
  passages: Array<{ text: string; location: string }>;
}
