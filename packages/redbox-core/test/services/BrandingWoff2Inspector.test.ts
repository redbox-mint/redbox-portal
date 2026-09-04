let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import zlib from 'zlib';
import { inspectWoff2Buffer, Woff2InspectError, WOFF2_SIGNATURE } from '../../src/services/BrandingWoff2Inspector';

function encodeBase128(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('out of range');
  if (value === 0) return [0];
  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.unshift(rest % 128);
    rest = Math.floor(rest / 128);
  }
  for (let i = 0; i < groups.length - 1; i += 1) {
    groups[i] |= 0x80;
  }
  return groups;
}

interface TableSpec {
  tagIndex: number;
  transformVersion?: number;
  origLength?: number;
}

function buildWoff2(
  tables: TableSpec[],
  opts: { flavor?: number; compressedSize?: number; metaXml?: string } = {}
): Buffer {
  const dirBytes: number[] = [];
  for (const table of tables) {
    const transform = table.transformVersion ?? 0;
    dirBytes.push(((transform << 6) & 0xc0) | (table.tagIndex & 0x3f));
    for (const b of encodeBase128(table.origLength ?? 64)) dirBytes.push(b);
    const isGlyfOrLoca = table.tagIndex === 10 || table.tagIndex === 11;
    const transformed = isGlyfOrLoca ? transform !== 3 : transform !== 0;
    if (transformed) {
      for (const b of encodeBase128(32)) dirBytes.push(b);
    }
  }
  const compressedSize = opts.compressedSize ?? 64;
  const fontData = Buffer.alloc(compressedSize, 0xa5);

  let metaCompressed = Buffer.alloc(0);
  let metaOrigLength = 0;
  if (opts.metaXml) {
    const orig = Buffer.from(opts.metaXml, 'utf8');
    metaOrigLength = orig.length;
    metaCompressed = zlib.brotliCompressSync(orig);
  }

  const headerSize = 48;
  const metaOffset = metaCompressed.length > 0 ? headerSize + dirBytes.length + compressedSize : 0;
  const totalLength = headerSize + dirBytes.length + compressedSize + metaCompressed.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt32BE(WOFF2_SIGNATURE, 0);
  header.writeUInt32BE(opts.flavor ?? 0x00010000, 4);
  header.writeUInt32BE(totalLength, 8);
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt16BE(0, 14);
  header.writeUInt32BE(1024, 16);
  header.writeUInt32BE(compressedSize, 20);
  header.writeUInt16BE(1, 24);
  header.writeUInt16BE(0, 26);
  header.writeUInt32BE(metaOffset, 28);
  header.writeUInt32BE(metaCompressed.length, 32);
  header.writeUInt32BE(metaOrigLength, 36);
  header.writeUInt32BE(0, 40);
  header.writeUInt32BE(0, 44);

  return Buffer.concat([header, Buffer.from(dirBytes), fontData, metaCompressed]);
}

/** Synthesised fixtures: no third-party font bytes, no licence encumbrance. */
function staticTables(): TableSpec[] {
  return [
    { tagIndex: 1, origLength: 54 },
    { tagIndex: 5, origLength: 128 },
    { tagIndex: 10, transformVersion: 3, origLength: 256 },
    { tagIndex: 11, transformVersion: 3, origLength: 32 },
  ];
}

describe('BrandingWoff2Inspector (T00 decision)', function () {
  it('accepts a valid static WOFF2 and reports no variable flag', function () {
    const result = inspectWoff2Buffer(buildWoff2(staticTables()));
    expect(result.isVariable).to.equal(false);
    expect(result.tableTags).to.include('glyf');
    expect(result.tableTags).to.not.include('fvar');
  });

  it('detects a variable WOFF2 via the fvar table entry', function () {
    const result = inspectWoff2Buffer(buildWoff2([...staticTables(), { tagIndex: 47, origLength: 64 }]));
    expect(result.isVariable).to.equal(true);
    expect(result.tableTags).to.include('fvar');
  });

  it('rejects malformed input with a controlled error', function () {
    const bad = buildWoff2(staticTables());
    bad.writeUInt32BE(0xdeadbeef, 0);
    expect(() => inspectWoff2Buffer(bad)).to.throw(Woff2InspectError, /signature/);
    expect(() => inspectWoff2Buffer(Buffer.from([0x01, 0x02]))).to.throw(Woff2InspectError);
    expect(() => inspectWoff2Buffer(Buffer.alloc(0))).to.throw(Woff2InspectError);
  });

  it('rejects truncated input without crashing', function () {
    const full = buildWoff2(staticTables());
    for (const end of [10, 47, 48, full.length - 1]) {
      expect(() => inspectWoff2Buffer(full.subarray(0, end))).to.throw(Woff2InspectError);
    }
    // Crafted-input loop: many malformed buffers must not terminate the process.
    for (let i = 0; i < 50; i += 1) {
      const crafted = Buffer.alloc(64, i & 0xff);
      expect(() => inspectWoff2Buffer(crafted)).to.throw(Woff2InspectError);
    }
  });

  it('extracts best-effort family metadata only from the metadata block', function () {
    const xml = '<?xml version="1.0"?><metadata><name id="1">Mismatch Family</name><name id="2">Bold</name></metadata>';
    const result = inspectWoff2Buffer(buildWoff2(staticTables(), { metaXml: xml }));
    expect(result.inspection.family).to.equal('Mismatch Family');
    expect(result.inspection.subfamily).to.equal('Bold');
    const plain = inspectWoff2Buffer(buildWoff2(staticTables()));
    expect(plain.inspection.family).to.equal(undefined);
  });

  it('rejects collections and bad flavors closed', function () {
    expect(() => inspectWoff2Buffer(buildWoff2(staticTables(), { flavor: 0x74746366 }))).to.throw(Woff2InspectError);
    expect(() => inspectWoff2Buffer(buildWoff2(staticTables(), { flavor: 0x12345678 }))).to.throw(Woff2InspectError);
  });
});
