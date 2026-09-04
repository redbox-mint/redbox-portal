/**
 * Minimal dependency-free WOFF2 structural inspector (T00 decision).
 *
 * Why no `fontkit`: fontkit@2.0.4 is the only maintained Node candidate with
 * WOFF2 + variable detection, but it carries an open crafted-font
 * denial-of-service report (foliojs/fontkit#368, April 2026: a small crafted
 * TrueType font crashes the Node process via composite glyph path access),
 * has had no release since Aug 2024, pulls Brotli/restructure transitive
 * dependencies with semver ranges, and parses full glyph outlines we never
 * need. Using it would expose glyph-path attack surface for a task that only
 * needs container validation, `fvar` detection, and best-effort metadata.
 *
 * This inspector therefore validates only the WOFF2 container (W3C WOFF2
 * REC 2024, sections 3-4): 48-byte header, table directory with UIntBase128
 * lengths, known-tag table (fvar = flag 47), collection rejection, and
 * offset/length overlap checks. It never decompresses the font data block
 * and never touches glyph outlines, so the fontkit composite-glyph crash
 * class cannot trigger. Best-effort family metadata comes only from the
 * optional Extended Metadata XML block (decompressed with Node's built-in
 * zlib, capped at 1 MiB by metaOrigLength), otherwise fields stay undefined.
 *
 * See docs/adr/0002-woff2-internal-inspector.md for the full decision.
 */
import zlib from 'zlib';
import type { BrandingTypefaceInspection } from '../model/BrandingTypeface';

export const WOFF2_SIGNATURE = 0x774f4632;
const WOFF2_HEADER_SIZE = 48;
const MAX_TABLES = 256;
const MAX_METADATA_ORIG_BYTES = 1024 * 1024;

/** Known WOFF2 table tags indexed by flag bits [0..5] (spec Table 4.1). */
const KNOWN_TABLE_TAGS: readonly string[] = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
];

export type Woff2InspectErrorCode =
  | 'EMPTY'
  | 'TRUNCATED'
  | 'BAD_SIGNATURE'
  | 'BAD_FLAVOR'
  | 'BAD_TABLE_COUNT'
  | 'BAD_DIRECTORY'
  | 'OVERLAP'
  | 'COLLECTION_UNSUPPORTED';

export class Woff2InspectError extends Error {
  readonly code: Woff2InspectErrorCode;
  constructor(code: Woff2InspectErrorCode, message: string) {
    super(message);
    this.name = 'Woff2InspectError';
    this.code = code;
  }
}

export interface Woff2InspectResult {
  /** True when an `fvar` table entry is present (variable font). */
  isVariable: boolean;
  /** Resolved table tags in directory order. */
  tableTags: string[];
  /** Best-effort metadata (family/subfamily) from the metadata block, if any. */
  inspection: BrandingTypefaceInspection;
}

interface Cursor {
  offset: number;
}

function readU8(buf: Buffer, cursor: Cursor): number {
  if (cursor.offset + 1 > buf.length) {
    throw new Woff2InspectError('TRUNCATED', 'Truncated WOFF2 data reading UInt8');
  }
  const value = buf.readUInt8(cursor.offset);
  cursor.offset += 1;
  return value;
}

function readU16(buf: Buffer, cursor: Cursor): number {
  if (cursor.offset + 2 > buf.length) {
    throw new Woff2InspectError('TRUNCATED', 'Truncated WOFF2 data reading UInt16');
  }
  const value = buf.readUInt16BE(cursor.offset);
  cursor.offset += 2;
  return value;
}

function readU32(buf: Buffer, cursor: Cursor): number {
  if (cursor.offset + 4 > buf.length) {
    throw new Woff2InspectError('TRUNCATED', 'Truncated WOFF2 data reading UInt32');
  }
  const value = buf.readUInt32BE(cursor.offset);
  cursor.offset += 4;
  return value;
}

/** Strict UIntBase128 per spec 3.1: max 5 bytes, no leading 0x80, no overflow. */
function readUIntBase128(buf: Buffer, cursor: Cursor): number {
  let accum = 0;
  for (let i = 0; i < 5; i += 1) {
    if (cursor.offset >= buf.length) {
      throw new Woff2InspectError('TRUNCATED', 'Truncated WOFF2 data reading UIntBase128');
    }
    const byte = buf.readUInt8(cursor.offset);
    cursor.offset += 1;
    if (i === 0 && byte === 0x80) {
      throw new Woff2InspectError('BAD_DIRECTORY', 'Non-minimal UIntBase128 encoding (leading zero)');
    }
    if (accum & 0xfe000000) {
      throw new Woff2InspectError('BAD_DIRECTORY', 'UIntBase128 value overflows UInt32');
    }
    accum = (accum << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return accum >>> 0;
    }
  }
  throw new Woff2InspectError('BAD_DIRECTORY', 'UIntBase128 sequence exceeds 5 bytes');
}

function tagToString(tagValue: number): string {
  return String.fromCharCode(
    (tagValue >>> 24) & 0xff,
    (tagValue >>> 16) & 0xff,
    (tagValue >>> 8) & 0xff,
    tagValue & 0xff
  );
}

/** Best-effort family extraction from Extended Metadata XML (spec section 6). */
function extractMetadataFamily(metaBytes: Buffer): BrandingTypefaceInspection {
  const inspection: BrandingTypefaceInspection = {};
  try {
    const xml = metaBytes.toString('utf8');
    // WOFF2 metadata uses <metadata><description>/<vendor> and <name> entries;
    // accept common shapes without a full XML parser (no new dependency).
    const familyMatch =
      /<name[^>]*\b(id|nameID)\s*=\s*["']1["'][^>]*>([^<]{1,256})<\/name>/i.exec(xml) ??
      /<family[^>]*>([^<]{1,256})<\/family>/i.exec(xml);
    const family = (familyMatch?.[familyMatch.length - 1] ?? '').trim();
    if (family) {
      inspection.family = family.slice(0, 256);
    }
    const subfamilyMatch = /<name[^>]*\b(id|nameID)\s*=\s*["']2["'][^>]*>([^<]{1,256})<\/name>/i.exec(xml);
    const subfamily = (subfamilyMatch?.[subfamilyMatch.length - 1] ?? '').trim();
    if (subfamily) {
      inspection.subfamily = subfamily.slice(0, 256);
    }
  } catch {
    // Metadata is advisory only; ignore parse failures.
  }
  return inspection;
}

/**
 * Structurally inspect WOFF2 bytes.
 *
 * Throws {@link Woff2InspectError} for malformed/truncated/unsupported input.
 * Variable fonts are NOT thrown here; they are reported via `isVariable` so
 * the caller can reject with the domain-appropriate error.
 */
export function inspectWoff2Buffer(input: Buffer): Woff2InspectResult {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input as Uint8Array);
  if (buf.length === 0) {
    throw new Woff2InspectError('EMPTY', 'Empty font data');
  }
  if (buf.length < WOFF2_HEADER_SIZE) {
    throw new Woff2InspectError('TRUNCATED', 'WOFF2 header truncated');
  }
  const cursor: Cursor = { offset: 0 };
  const signature = readU32(buf, cursor);
  if (signature !== WOFF2_SIGNATURE) {
    throw new Woff2InspectError('BAD_SIGNATURE', 'Not a WOFF2 file (bad signature)');
  }
  const flavor = readU32(buf, cursor);
  // 0x74746366 'ttcf' / 0x74746370? collections are out of scope: fail closed.
  if (flavor === 0x74746366) {
    throw new Woff2InspectError('COLLECTION_UNSUPPORTED', 'WOFF2 font collections are not supported');
  }
  if (flavor !== 0x00010000 && flavor !== 0x4f54544f) {
    throw new Woff2InspectError('BAD_FLAVOR', 'Unsupported sfnt flavor');
  }
  const length = readU32(buf, cursor);
  if (length !== buf.length) {
    throw new Woff2InspectError('BAD_DIRECTORY', 'WOFF2 total length mismatch');
  }
  const numTables = readU16(buf, cursor);
  if (numTables < 1 || numTables > MAX_TABLES) {
    throw new Woff2InspectError('BAD_TABLE_COUNT', 'Invalid WOFF2 table count');
  }
  readU16(buf, cursor); // reserved (must be zero on encode; tolerated on decode per spec)
  readU32(buf, cursor); // totalSfntSize (reference only)
  const totalCompressedSize = readU32(buf, cursor);
  readU16(buf, cursor); // majorVersion
  readU16(buf, cursor); // minorVersion
  const metaOffset = readU32(buf, cursor);
  const metaLength = readU32(buf, cursor);
  const metaOrigLength = readU32(buf, cursor);
  const privOffset = readU32(buf, cursor);
  const privLength = readU32(buf, cursor);

  const tableTags: string[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = readU8(buf, cursor);
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >>> 6) & 0x03;
    let tag: string;
    if (tagIndex === 63) {
      const tagValue = readU32(buf, cursor);
      tag = tagToString(tagValue);
    } else if (tagIndex < KNOWN_TABLE_TAGS.length) {
      tag = KNOWN_TABLE_TAGS[tagIndex];
    } else {
      throw new Woff2InspectError('BAD_DIRECTORY', `Unknown WOFF2 known-tag index ${tagIndex}`);
    }
    // origLength always present.
    readUIntBase128(buf, cursor);
    // transformLength present iff non-null transform:
    // null = v0 generally, v3 for glyf/loca (spec 4.1).
    const isGlyfOrLoca = tag === 'glyf' || tag === 'loca';
    const isTransformed = isGlyfOrLoca ? transformVersion !== 3 : transformVersion !== 0;
    if (isTransformed) {
      // Unknown transform versions fail closed: only v0 is defined for
      // glyf/loca/hmtx-style transforms in practice; anything else cannot
      // be decoded by this inspector's callers.
      if (isGlyfOrLoca ? transformVersion !== 0 : transformVersion > 0) {
        if (!isGlyfOrLoca || transformVersion !== 0) {
          // Non-glyf/loca tables must use null transform; glyf/loca must
          // use v0 (transformed) or v3 (null).
          if (!(isGlyfOrLoca && (transformVersion === 0 || transformVersion === 3))) {
            throw new Woff2InspectError('BAD_DIRECTORY', `Unsupported transform for table ${tag}`);
          }
        }
      }
      readUIntBase128(buf, cursor);
    } else if (isGlyfOrLoca && transformVersion !== 3 && transformVersion !== 0) {
      throw new Woff2InspectError('BAD_DIRECTORY', `Unsupported transform for table ${tag}`);
    }
    tableTags.push(tag);
  }

  // Bounds/overlap checks for optional blocks (spec section 3).
  const directoryEnd = cursor.offset;
  const dataStart = directoryEnd;
  const dataEnd = dataStart + totalCompressedSize;
  if (dataEnd > buf.length) {
    throw new Woff2InspectError('TRUNCATED', 'WOFF2 compressed data extends beyond end of file');
  }
  const ranges: Array<{ start: number; end: number; label: string }> = [
    { start: dataStart, end: dataEnd, label: 'fontdata' },
  ];
  if (metaLength > 0 || metaOffset !== 0) {
    if (metaOffset < dataEnd || metaOffset + metaLength > buf.length) {
      throw new Woff2InspectError('OVERLAP', 'WOFF2 metadata block out of bounds or overlapping');
    }
    ranges.push({ start: metaOffset, end: metaOffset + metaLength, label: 'metadata' });
  }
  if (privLength > 0 || privOffset !== 0) {
    if (privOffset < dataEnd || privOffset + privLength > buf.length) {
      throw new Woff2InspectError('OVERLAP', 'WOFF2 private block out of bounds or overlapping');
    }
    ranges.push({ start: privOffset, end: privOffset + privLength, label: 'private' });
  }
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) {
      throw new Woff2InspectError('OVERLAP', 'WOFF2 data blocks overlap');
    }
  }

  let inspection: BrandingTypefaceInspection = {};
  if (metaLength > 0) {
    if (metaOrigLength > 0 && metaOrigLength <= MAX_METADATA_ORIG_BYTES) {
      try {
        const compressed = buf.subarray(metaOffset, metaOffset + metaLength);
        const decompressed = zlib.brotliDecompressSync(compressed);
        inspection = extractMetadataFamily(decompressed.subarray(0, MAX_METADATA_ORIG_BYTES));
      } catch {
        // Metadata is advisory; a corrupt metadata block does not invalidate
        // an otherwise structurally sound font.
        inspection = {};
      }
    }
  }

  return { isVariable: tableTags.includes('fvar'), tableTags, inspection };
}
