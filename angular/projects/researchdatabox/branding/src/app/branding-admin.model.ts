/**
 * Branding Admin client model.
 *
 * Angular representation of the canonical Admin state served by
 * BrandingService.getAdminState (design.md section 5.3). The component keeps
 * one instance of {@link BrandingAdminState} as its canonical state source:
 * every mutation response replaces it wholesale rather than merging fields
 * locally. Counters for optimistic concurrency always come from that state.
 */

export type BrandingTypefaceSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

export const BRANDING_TYPEFACE_SLOTS: readonly BrandingTypefaceSlot[] = ['regular', 'bold', 'italic', 'boldItalic'];

export interface BrandingTypefaceInspection {
  family?: string;
  subfamily?: string;
  embeddedWeight?: number;
  embeddedStyle?: string;
}

export interface BrandingTypefaceFace {
  slot: BrandingTypefaceSlot;
  sha256: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  inspection: BrandingTypefaceInspection;
  warnings: string[];
}

export interface BrandingTypefaceState {
  mode: 'default' | 'custom';
  faces: Partial<Record<BrandingTypefaceSlot, BrandingTypefaceFace>>;
}

export interface BrandingVersionEntry {
  id: string;
  version: number;
  hash: string;
  dateCreated: string;
  actorId?: string;
  actorDisplayName?: string;
  restoredFromVersion?: number;
  variables: Record<string, string>;
  typeface: BrandingTypefaceState;
}

export interface BrandingAdminState {
  branding: { id: string; name: string };
  active: {
    version: number;
    hash: string;
    variables: Record<string, string>;
    typeface: BrandingTypefaceState;
  };
  draft: {
    revision: number;
    variables: Record<string, string>;
    typeface: BrandingTypefaceState;
    dirty: { colours: boolean; typeface: boolean };
  };
  versions: BrandingVersionEntry[];
  limits: { faceMaxBytes: number; familyMaxBytes: number; historyMaxVersions: number };
  healthWarnings: Array<{ code: string; slot?: BrandingTypefaceSlot; sha256?: string }>;
  idempotent?: boolean;
  version?: number;
  hash?: string;
}

export interface BrandingPreview {
  token: string;
  url: string;
  hash: string;
  revision?: number;
  previewToken: string;
  previewUrl: string;
}

/** Normalised stale-write conflict: the UI offers a reload (which re-fetches canonical state). */
export interface BrandingConflictError {
  kind: 'conflict';
  status: 409;
  message: string;
}

/** Normalised upload-limit error carrying the server message for display. */
export interface BrandingLimitError {
  kind: 'limit';
  status: 413;
  message: string;
}

export type BrandingMutationError = BrandingConflictError | BrandingLimitError;
