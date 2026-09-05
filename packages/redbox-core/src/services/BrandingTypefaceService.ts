import crypto from 'crypto';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import { getBrandingPositiveInt } from '../config/branding.config';
import {
  BRANDING_TYPEFACE_FACE_MAX_BYTES,
  BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
  BRANDING_TYPEFACE_ORPHAN_GRACE_MS,
  isBrandingTypefaceSlot,
  normalizeTypefaceState,
  orderedTypefaceFaces,
  type BrandingTypefaceFace,
  type BrandingTypefaceInspection,
  type BrandingTypefaceSlot,
  type BrandingTypefaceState,
} from '../model/BrandingTypeface';
import { inspectWoff2Buffer, Woff2InspectError } from './BrandingWoff2Inspector';
import type { BrandingConfigAttributes } from '../waterline-models/BrandingConfig';
import type { BrandingConfigHistoryAttributes } from '../waterline-models/BrandingConfigHistory';

export type BrandingTypefaceErrorCode =
  | 'typeface-invalid-slot'
  | 'typeface-empty'
  | 'typeface-invalid-font'
  | 'typeface-variable-font'
  | 'typeface-face-too-large'
  | 'typeface-family-too-large'
  | 'typeface-not-found'
  | 'typeface-corrupt'
  | 'typeface-storage-failed';

export class BrandingTypefaceError extends Error {
  readonly code: BrandingTypefaceErrorCode;
  constructor(code: BrandingTypefaceErrorCode, message: string) {
    super(message);
    this.name = 'BrandingTypefaceError';
    this.code = code;
  }
}

export interface BrandingTypefaceSlotDescriptor {
  weight: number;
  style: string;
}

export interface InspectAndStoreFaceInput {
  brandingId: string;
  slot: string;
  bytes: Buffer;
  originalFilename?: string;
  /** Current draft faces (for distinct-content family limit enforcement). */
  existingFaces?: BrandingTypefaceFace[];
}

export interface BrandingTypefaceReconciliationResult {
  scanned: number;
  referenced: number;
  deleted: number;
  skippedGrace: number;
  skippedUnexpected: number;
  failures: number;
}

const FONT_PREFIX = 'branding-fonts/';
const FONT_CONTENT_TYPE = 'font/woff2';
const SHA256_RE = /^[0-9a-f]{64}$/;
const STORAGE_KEY_RE = /^branding-fonts\/([^/]+)\/([0-9a-f]{64})\.woff2$/;

const SLOT_DESCRIPTORS: Record<BrandingTypefaceSlot, BrandingTypefaceSlotDescriptor> = {
  regular: { weight: 400, style: 'normal' },
  bold: { weight: 700, style: 'normal' },
  italic: { weight: 400, style: 'italic' },
  boldItalic: { weight: 700, style: 'italic' },
};

/** Subfamily keywords expected per slot; anything else present warns (slot stays authoritative). */
const SLOT_SUBFAMILY_KEYWORDS: Record<BrandingTypefaceSlot, string[]> = {
  regular: ['regular'],
  bold: ['bold'],
  italic: ['italic'],
  boldItalic: ['bold', 'italic'],
};

function readPositiveInt(
  key: 'typefaceFaceMaxBytes' | 'typefaceFamilyMaxBytes' | 'typefaceOrphanGraceMs',
  fallback: number
): number {
  return getBrandingPositiveInt(key, fallback);
}

function sha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    record.code === 'ENOENT' ||
    record.status === 404 ||
    record.statusCode === 404 ||
    message.includes('not found') ||
    message.includes('enoent') ||
    message.includes('nosuchkey')
  );
}

export namespace Services {
  @PopulateExportedMethods
  export class BrandingTypeface extends services.Core.Service {
    /** Fixed CSS descriptor for an explicit slot. */
    slotDescriptor(slot: BrandingTypefaceSlot): BrandingTypefaceSlotDescriptor {
      return { ...SLOT_DESCRIPTORS[slot] };
    }

    /** Canonical immutable storage key for one brand's face bytes. */
    storageKey(brandingId: string, sha256: string): string {
      return `${FONT_PREFIX}${brandingId}/${sha256}.woff2`;
    }

    /** Portal-independent public URL so all portals under a brand share the browser cache. */
    publicUrl(brandName: string, sha256: string): string {
      const rootContext = sails?.config?.http?.rootContext as string | undefined;
      const root = rootContext ? `/${rootContext}` : '';
      return `${root}/fonts/branding/${encodeURIComponent(brandName)}/${sha256}.woff2`;
    }

    /** Strict parse of a storage key; returns null for unexpected entries (logged + skipped). */
    parseStorageKey(key: string): { brandingId: string; sha256: string } | null {
      const match = STORAGE_KEY_RE.exec(key);
      if (!match) {
        return null;
      }
      return { brandingId: match[1], sha256: match[2] };
    }

    private mismatchWarnings(slot: BrandingTypefaceSlot, inspection: BrandingTypefaceInspection): string[] {
      const warnings: string[] = [];
      const subfamily = inspection.subfamily?.trim();
      if (subfamily) {
        const keywords = SLOT_SUBFAMILY_KEYWORDS[slot];
        const lowered = subfamily.toLowerCase();
        const matches = keywords.some(keyword => lowered.includes(keyword));
        if (!matches) {
          warnings.push(`embedded subfamily "${subfamily}" differs from slot "${slot}"; slot remains authoritative`);
        }
      }
      return warnings;
    }

    private enforceFamilyLimit(
      slot: BrandingTypefaceSlot,
      bytes: Buffer,
      sha256: string,
      existingFaces: BrandingTypefaceFace[]
    ): void {
      const familyMax = readPositiveInt('typefaceFamilyMaxBytes', BRANDING_TYPEFACE_FAMILY_MAX_BYTES);
      const sizeByHash = new Map<string, number>();
      for (const face of existingFaces) {
        if (face.slot !== slot && !sizeByHash.has(face.sha256)) {
          sizeByHash.set(face.sha256, face.sizeBytes);
        }
      }
      if (!sizeByHash.has(sha256)) {
        sizeByHash.set(sha256, bytes.length);
      }
      let total = 0;
      for (const size of sizeByHash.values()) {
        total += size;
      }
      if (total > familyMax) {
        throw new BrandingTypefaceError(
          'typeface-family-too-large',
          `Typeface family size ${total} exceeds the configured maximum ${familyMax}`
        );
      }
    }

    /**
     * Validate, hash, store (or reuse), and describe one uploaded face.
     * Transport size limits are re-enforced here so Skipper is never the only boundary.
     */
    async inspectAndStoreFace(input: InspectAndStoreFaceInput): Promise<BrandingTypefaceFace> {
      if (!isBrandingTypefaceSlot(input.slot)) {
        throw new BrandingTypefaceError('typeface-invalid-slot', `Invalid typeface slot: ${String(input.slot)}`);
      }
      const slot = input.slot;
      const bytes = input.bytes;
      if (!bytes || !Buffer.isBuffer(bytes) || bytes.length === 0) {
        throw new BrandingTypefaceError('typeface-empty', 'Empty font upload');
      }
      const faceMax = readPositiveInt('typefaceFaceMaxBytes', BRANDING_TYPEFACE_FACE_MAX_BYTES);
      if (bytes.length > faceMax) {
        throw new BrandingTypefaceError(
          'typeface-face-too-large',
          `Typeface face size ${bytes.length} exceeds the configured maximum ${faceMax}`
        );
      }
      let inspection: BrandingTypefaceInspection;
      try {
        const result = await inspectWoff2Buffer(bytes);
        if (result.isVariable) {
          throw new BrandingTypefaceError('typeface-variable-font', 'Variable fonts are not supported');
        }
        inspection = result.inspection;
      } catch (error) {
        if (error instanceof BrandingTypefaceError) {
          throw error;
        }
        const reason = error instanceof Woff2InspectError ? error.message : 'unparseable font data';
        throw new BrandingTypefaceError('typeface-invalid-font', `Invalid WOFF2 font: ${reason}`);
      }
      const sha256 = sha256Hex(bytes);
      this.enforceFamilyLimit(slot, bytes, sha256, input.existingFaces ?? []);

      const key = this.storageKey(input.brandingId, sha256);
      const disk = StorageManagerService.primaryDisk();
      try {
        if (await disk.exists(key)) {
          const stored = Buffer.from(await disk.getBytes(key));
          if (sha256Hex(stored) !== sha256) {
            sails.log.error(`BrandingTypefaceService hash mismatch for brand ${input.brandingId} face ${sha256}`);
            throw new BrandingTypefaceError('typeface-corrupt', 'Stored font bytes failed integrity verification');
          }
        } else {
          await disk.put(key, bytes, { contentType: FONT_CONTENT_TYPE });
        }
      } catch (error) {
        if (error instanceof BrandingTypefaceError) {
          throw error;
        }
        throw new BrandingTypefaceError(
          'typeface-storage-failed',
          'Font storage failed; the typeface draft was not changed'
        );
      }
      return {
        slot,
        sha256,
        originalFilename: String(input.originalFilename ?? 'face.woff2').slice(0, 256),
        sizeBytes: bytes.length,
        uploadedAt: new Date().toISOString(),
        inspection,
        warnings: this.mismatchWarnings(slot, inspection),
      };
    }

    /** Lightweight existence probe for advisory health checks (no byte reads, no hashing). */
    async faceExists(brandingId: string, sha256: string): Promise<boolean> {
      if (!SHA256_RE.test(sha256)) {
        return false;
      }
      try {
        return await StorageManagerService.primaryDisk().exists(this.storageKey(brandingId, sha256));
      } catch {
        return false;
      }
    }

    /** Read and hash-verify one stored face. Never substitutes another font. */
    async readFace(brandingId: string, sha256: string): Promise<Buffer> {
      if (!SHA256_RE.test(sha256)) {
        throw new BrandingTypefaceError('typeface-not-found', 'Font not found');
      }
      const key = this.storageKey(brandingId, sha256);
      let stored: Buffer;
      try {
        stored = Buffer.from(await StorageManagerService.primaryDisk().getBytes(key));
      } catch (error) {
        if (!isStorageNotFoundError(error)) {
          sails.log.warn(`BrandingTypefaceService storage read failed for brand ${brandingId}:`, error);
        }
        throw new BrandingTypefaceError('typeface-not-found', 'Font not found');
      }
      if (sha256Hex(stored) !== sha256) {
        sails.log.error(`BrandingTypefaceService hash mismatch for brand ${brandingId} face ${sha256}`);
        throw new BrandingTypefaceError('typeface-corrupt', 'Stored font bytes failed integrity verification');
      }
      return stored;
    }

    /** Verify every face referenced by a candidate snapshot before publish/restore. */
    async assertTypefaceAvailable(
      brandingId: string,
      typeface: BrandingTypefaceState | null | undefined
    ): Promise<void> {
      const state = normalizeTypefaceState(typeface);
      for (const face of orderedTypefaceFaces(state)) {
        await this.readFace(brandingId, face.sha256);
      }
    }

    /** Collect every storage key referenced by any brand's active/draft typeface or retained history. */
    async collectReferencedKeys(): Promise<Map<string, { brandingId: string; sha256: string }>> {
      const referenced = new Map<string, { brandingId: string; sha256: string }>();
      const addState = (brandingId: string, typeface: unknown): void => {
        for (const face of orderedTypefaceFaces(normalizeTypefaceState(typeface))) {
          const key = this.storageKey(brandingId, face.sha256);
          referenced.set(key, { brandingId, sha256: face.sha256 });
        }
      };
      const brands = (await BrandingConfig.find({})) as BrandingConfigAttributes[];
      for (const brand of brands) {
        const brandingId = String(brand.id);
        addState(brandingId, brand.typeface);
        addState(brandingId, brand.draftTypeface);
      }
      const histories = (await BrandingConfigHistory.find({})) as BrandingConfigHistoryAttributes[];
      for (const history of histories) {
        const branding = history.branding;
        const brandingId = String(
          typeof branding === 'object' && branding !== null ? ((branding as { id?: unknown }).id ?? '') : branding
        );
        if (brandingId) {
          addState(brandingId, history.typeface);
        }
      }
      return referenced;
    }

    /** Fresh per-key reference check used immediately before each deletion (scan/delete race). */
    async isKeyReferenced(brandingId: string, sha256: string): Promise<boolean> {
      const brand = await BrandingConfig.findOne({ id: brandingId });
      if (brand) {
        for (const source of [brand.typeface, brand.draftTypeface]) {
          if (orderedTypefaceFaces(normalizeTypefaceState(source)).some(face => face.sha256 === sha256)) {
            return true;
          }
        }
      }
      const histories = (await BrandingConfigHistory.find({
        branding: brandingId,
      })) as BrandingConfigHistoryAttributes[];
      for (const history of histories) {
        if (orderedTypefaceFaces(normalizeTypefaceState(history.typeface)).some(face => face.sha256 === sha256)) {
          return true;
        }
      }
      return false;
    }

    /**
     * Delete only objects that remain unreferenced and outside the grace period.
     * Individual failures are logged and retried on the next run; they never abort the scan.
     */
    async reconcileAssets(options?: { now?: number; graceMs?: number }): Promise<BrandingTypefaceReconciliationResult> {
      const now = options?.now ?? Date.now();
      const graceMs = options?.graceMs ?? readPositiveInt('typefaceOrphanGraceMs', BRANDING_TYPEFACE_ORPHAN_GRACE_MS);
      const referenced = await this.collectReferencedKeys();
      const disk = StorageManagerService.primaryDisk();
      const result: BrandingTypefaceReconciliationResult = {
        scanned: 0,
        referenced: referenced.size,
        deleted: 0,
        skippedGrace: 0,
        skippedUnexpected: 0,
        failures: 0,
      };
      let paginationToken: string | undefined;
      // Collect keys first, then mutate: offset-based listings shift when an
      // earlier page entry is deleted mid-scan, which would skip entries.
      const keys: string[] = [];
      for (;;) {
        const listing = await disk.listAll(FONT_PREFIX, {
          recursive: true,
          ...(paginationToken ? { paginationToken } : {}),
        });
        for (const entry of listing.objects) {
          const record = entry as Record<string, unknown> | string;
          keys.push(typeof record === 'string' ? record : String(record.key ?? record.name ?? ''));
        }
        paginationToken = listing.paginationToken;
        if (!paginationToken) {
          break;
        }
      }
      for (const key of keys) {
        result.scanned += 1;
        const parsed = this.parseStorageKey(key);
        if (!parsed) {
          result.skippedUnexpected += 1;
          sails.log.warn(`BrandingTypefaceService reconciliation skipping unexpected key under ${FONT_PREFIX}`);
          continue;
        }
        if (referenced.has(key)) {
          continue;
        }
        let lastModified: Date;
        try {
          const meta = await disk.getMetaData(key);
          lastModified = meta.lastModified;
        } catch (error) {
          if (isStorageNotFoundError(error)) {
            continue;
          }
          result.failures += 1;
          sails.log.warn(
            `BrandingTypefaceService reconciliation metadata failed for brand ${parsed.brandingId}:`,
            error
          );
          continue;
        }
        if (now - lastModified.getTime() < graceMs) {
          result.skippedGrace += 1;
          continue;
        }
        // Close the scan/delete race with a fresh reference read.
        try {
          if (await this.isKeyReferenced(parsed.brandingId, parsed.sha256)) {
            continue;
          }
        } catch (error) {
          result.failures += 1;
          sails.log.warn(
            `BrandingTypefaceService reconciliation recheck failed for brand ${parsed.brandingId}:`,
            error
          );
          continue;
        }
        try {
          await disk.delete(key);
          result.deleted += 1;
        } catch (error) {
          if (isStorageNotFoundError(error)) {
            continue;
          }
          result.failures += 1;
          sails.log.warn(`BrandingTypefaceService reconciliation delete failed for brand ${parsed.brandingId}:`, error);
        }
      }
      sails.log.info(
        `BrandingTypefaceService reconciliation: scanned=${result.scanned} referenced=${result.referenced} ` +
          `deleted=${result.deleted} skippedGrace=${result.skippedGrace} skippedUnexpected=${result.skippedUnexpected} failures=${result.failures}.`
      );
      return result;
    }
  }
}

declare global {
  let BrandingTypefaceService: Services.BrandingTypeface;
}
