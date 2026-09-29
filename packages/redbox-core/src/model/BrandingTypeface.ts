/**
 * Shared Brand Typeface contracts.
 *
 * Single source of truth for typeface slots, faces, and draft/active
 * invariants (see design.md section 5). This module has no storage or
 * controller dependencies so services, controllers, and Angular layers can
 * share it without import cycles.
 */

/** Fixed typeface face slot. Ordering is canonical: regular, bold, italic, boldItalic. */
export type BrandingTypefaceSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

/** Canonical slot ordering used for CSS emission, hashing, and UI rendering. */
export const BRANDING_TYPEFACE_SLOTS: readonly BrandingTypefaceSlot[] = ['regular', 'bold', 'italic', 'boldItalic'];

/** Best-effort metadata extracted during WOFF2 structural inspection. */
export interface BrandingTypefaceInspection {
  family?: string;
  subfamily?: string;
  embeddedWeight?: number;
  embeddedStyle?: string;
}

/** One stored typeface face: content-addressed metadata, never raw bytes. */
export interface BrandingTypefaceFace {
  slot: BrandingTypefaceSlot;
  /** Lowercase 64-char hex SHA-256 of the exact stored WOFF2 bytes. */
  sha256: string;
  /** Display metadata only; never a disk key, URL, CSS token, or MIME authority. */
  originalFilename: string;
  /** Compressed byte count of the stored face. */
  sizeBytes: number;
  /** ISO-8601 upload timestamp. */
  uploadedAt: string;
  inspection: BrandingTypefaceInspection;
  warnings: string[];
}

/** Brand-wide typeface state. `default` has no faces; custom drafts may omit Regular. */
export interface BrandingTypefaceState {
  mode: 'default' | 'custom';
  faces: Partial<Record<BrandingTypefaceSlot, BrandingTypefaceFace>>;
}

/** Default maximum compressed bytes for a newly uploaded face (2 MiB). */
export const BRANDING_TYPEFACE_FACE_MAX_BYTES = 2 * 1024 * 1024;

/** Default maximum distinct compressed bytes referenced by a resulting custom draft (8 MiB). */
export const BRANDING_TYPEFACE_FAMILY_MAX_BYTES = 8 * 1024 * 1024;

/** Default number of newest complete versions retained per brand. */
export const BRANDING_HISTORY_MAX_VERSIONS = 3;

/** Default minimum unreferenced object age before orphan deletion (24 hours). */
export const BRANDING_TYPEFACE_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** Type guard for the four fixed slot values. */
export function isBrandingTypefaceSlot(value: unknown): value is BrandingTypefaceSlot {
  return value === 'regular' || value === 'bold' || value === 'italic' || value === 'boldItalic';
}

/**
 * Normalise absent or legacy-null typeface data to Default Typography.
 * Unknown slots are dropped; non-object input also maps to default.
 */
export function normalizeTypefaceState(value: unknown): BrandingTypefaceState {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { mode: 'default', faces: {} };
  }
  const candidate = value as Partial<BrandingTypefaceState>;
  if (candidate.mode !== 'custom') {
    return { mode: 'default', faces: {} };
  }
  const faces: Partial<Record<BrandingTypefaceSlot, BrandingTypefaceFace>> = {};
  if (candidate.faces != null && typeof candidate.faces === 'object') {
    for (const slot of BRANDING_TYPEFACE_SLOTS) {
      const face = (candidate.faces as Record<string, unknown>)[slot];
      if (face != null && typeof face === 'object') {
        faces[slot] = face as BrandingTypefaceFace;
      }
    }
  }
  return { mode: 'custom', faces };
}

/** True when the state is Default Typography (no faces required). */
export function isDefaultTypefaceState(state: BrandingTypefaceState): boolean {
  return state.mode === 'default';
}

/**
 * Structural invariant for active or historical snapshots:
 * default has no faces; custom has a Regular face with a valid hash.
 */
export function isValidActiveTypefaceState(state: BrandingTypefaceState): boolean {
  if (state.mode === 'default') {
    return Object.keys(state.faces ?? {}).length === 0;
  }
  const regular = state.faces?.regular;
  if (regular == null) {
    return false;
  }
  if (regular.slot !== 'regular' || !SHA256_HEX_RE.test(regular.sha256)) {
    return false;
  }
  return Object.entries(state.faces ?? {}).every(([slot, face]) => {
    if (!isBrandingTypefaceSlot(slot) || face == null) {
      return false;
    }
    return face.slot === slot && SHA256_HEX_RE.test(face.sha256);
  });
}

/**
 * Structural invariant for drafts: custom drafts may temporarily omit
 * Regular so work can be saved, but every present face must be well-formed.
 */
export function isValidDraftTypefaceState(state: BrandingTypefaceState): boolean {
  if (state.mode === 'default') {
    return Object.keys(state.faces ?? {}).length === 0;
  }
  return Object.entries(state.faces ?? {}).every(([slot, face]) => {
    if (!isBrandingTypefaceSlot(slot) || face == null) {
      return false;
    }
    return face.slot === slot && SHA256_HEX_RE.test(face.sha256);
  });
}

/** True when a draft custom state carries every face needed for publication. */
export function isPublishableTypefaceState(state: BrandingTypefaceState): boolean {
  if (state.mode === 'default') {
    return true;
  }
  return isValidDraftTypefaceState(state) && state.faces?.regular != null;
}

/** Faces in canonical slot order, skipping absent optional faces. */
export function orderedTypefaceFaces(state: BrandingTypefaceState): BrandingTypefaceFace[] {
  const faces: BrandingTypefaceFace[] = [];
  for (const slot of BRANDING_TYPEFACE_SLOTS) {
    const face = state.faces?.[slot];
    if (face != null) {
      faces.push(face);
    }
  }
  return faces;
}
