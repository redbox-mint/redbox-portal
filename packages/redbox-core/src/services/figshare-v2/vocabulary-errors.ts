/**
 * Typed errors raised by the Figshare vocabulary workflow. Controllers translate these
 * into HTTP statuses; none of them ever carry connection configuration or tokens.
 */

export type FigshareVocabularyErrorCode =
  | 'catalogue-invalid'
  | 'crosswalk-revision'
  | 'preview-expired'
  | 'relationship-boundary'
  | 'snapshot-too-large'
  | 'stale-preview'
  | 'transport';

export class FigshareVocabularyError extends Error {
  public readonly code: FigshareVocabularyErrorCode;

  constructor(code: FigshareVocabularyErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Figshare returned something that is not a usable category catalogue. */
export class CatalogueInvalidError extends FigshareVocabularyError {
  constructor(message: string) {
    super('catalogue-invalid', message);
  }
}

/** The normalized snapshot exceeds the configured row/byte limits. */
export class SnapshotTooLargeError extends FigshareVocabularyError {
  constructor(message: string) {
    super('snapshot-too-large', message);
  }
}

/** The preview passed its 24 hour expiry and can no longer be applied. */
export class PreviewExpiredError extends FigshareVocabularyError {
  constructor(message = 'The synchronisation preview has expired. Generate a new preview.') {
    super('preview-expired', message);
  }
}

/** Remote or local state moved after the preview was reviewed. */
export class StalePreviewError extends FigshareVocabularyError {
  constructor(message = 'The reviewed data changed since this preview was generated.') {
    super('stale-preview', message);
  }
}

/** Optimistic concurrency failure on a crosswalk working revision. */
export class CrosswalkRevisionError extends FigshareVocabularyError {
  constructor(message = 'The crosswalk was modified by another editor. Reload and review.') {
    super('crosswalk-revision', message);
  }
}

/** An identifier crossed a brand, vocabulary or source ownership boundary. */
export class RelationshipBoundaryError extends FigshareVocabularyError {
  constructor(message: string) {
    super('relationship-boundary', message);
  }
}

/** Figshare could not be reached, or rejected the request. */
export class FigshareTransportError extends FigshareVocabularyError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super('transport', message);
    this.statusCode = statusCode;
  }
}
