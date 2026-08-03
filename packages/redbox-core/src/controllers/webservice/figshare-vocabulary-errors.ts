import { FigshareVocabularyError } from '../../services/figshare-v2/vocabulary-errors';

export interface FigshareVocabularyErrorResponse {
  status: number;
  title: string;
  detail: string;
}

/**
 * Translate service-level errors into HTTP statuses.
 *
 * Cross-brand identifiers deliberately produce 404 so the API never discloses that a
 * resource exists in another tenant, and no branch ever surfaces Figshare credentials
 * or raw request configuration.
 */
export function toFigshareVocabularyErrorResponse(error: unknown): FigshareVocabularyErrorResponse {
  if (error instanceof FigshareVocabularyError) {
    switch (error.code) {
      case 'relationship-boundary':
        return { status: 404, title: 'Not found', detail: error.message };
      case 'preview-expired':
        return { status: 410, title: 'Preview expired', detail: error.message };
      case 'stale-preview':
      case 'crosswalk-revision':
        return { status: 409, title: 'Conflict', detail: error.message };
      case 'catalogue-invalid':
        return { status: 422, title: 'Unprocessable request', detail: error.message };
      case 'snapshot-too-large':
        return { status: 422, title: 'Catalogue too large', detail: error.message };
      case 'transport':
        return {
          status: 502,
          title: 'Figshare unavailable',
          detail: error.message,
        };
      default:
        return { status: 400, title: 'Bad request', detail: error.message };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return { status: 400, title: 'Bad request', detail: message };
}
