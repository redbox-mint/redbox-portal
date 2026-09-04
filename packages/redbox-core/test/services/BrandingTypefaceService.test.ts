let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import zlib from 'zlib';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';
import { BrandingTypefaceError } from '../../src/services/BrandingTypefaceService';
import type { BrandingTypefaceFace } from '../../src/model/BrandingTypeface';

function encodeBase128(value: number): number[] {
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
    if (isGlyfOrLoca ? transform !== 3 : transform !== 0) {
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
  header.writeUInt32BE(0x774f4632, 0);
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

function staticTables(): TableSpec[] {
  return [
    { tagIndex: 1, origLength: 54 },
    { tagIndex: 5, origLength: 128 },
    { tagIndex: 10, transformVersion: 3, origLength: 256 },
    { tagIndex: 11, transformVersion: 3, origLength: 32 },
  ];
}

function notFoundError(): Error & { code?: string } {
  const error = new Error('NoSuchKey') as Error & { code?: string };
  error.code = 'NoSuchKey';
  return error;
}

class FakeDisk {
  objects = new Map<string, { bytes: Buffer; lastModified: Date }>();
  puts: Array<{ key: string; options?: Record<string, unknown> }> = [];
  deletes: string[] = [];
  failPut = false;
  pageSize = 100;

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async getBytes(key: string): Promise<Uint8Array> {
    const entry = this.objects.get(key);
    if (!entry) throw notFoundError();
    return entry.bytes;
  }
  async getMetaData(
    key: string
  ): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }> {
    const entry = this.objects.get(key);
    if (!entry) throw notFoundError();
    return { contentLength: entry.bytes.length, etag: 'etag', lastModified: entry.lastModified };
  }
  async put(key: string, contents: Uint8Array, options?: Record<string, unknown>): Promise<void> {
    if (this.failPut) throw new Error('disk-down');
    this.objects.set(key, { bytes: Buffer.from(contents), lastModified: new Date() });
    this.puts.push({ key, options });
  }
  async delete(key: string): Promise<void> {
    if (!this.objects.has(key)) throw notFoundError();
    this.objects.delete(key);
    this.deletes.push(key);
  }
  async listAll(
    prefix?: string,
    options?: { recursive?: boolean; paginationToken?: string }
  ): Promise<{ paginationToken?: string; objects: Iterable<unknown> }> {
    const keys = [...this.objects.keys()].filter(key => key.startsWith(prefix ?? '')).sort();
    let start = 0;
    if (options?.paginationToken) start = parseInt(options.paginationToken, 10);
    const page = keys.slice(start, start + this.pageSize);
    const next = start + this.pageSize < keys.length ? String(start + this.pageSize) : undefined;
    return { objects: page.map(key => ({ key })), paginationToken: next };
  }
}

describe('BrandingTypefaceService', function () {
  let disk: FakeDisk;
  let service: {
    slotDescriptor(slot: 'regular' | 'bold' | 'italic' | 'boldItalic'): { weight: number; style: string };
    storageKey(brandingId: string, sha256: string): string;
    publicUrl(brandName: string, sha256: string): string;
    parseStorageKey(key: string): { brandingId: string; sha256: string } | null;
    inspectAndStoreFace(input: {
      brandingId: string;
      slot: string;
      bytes: Buffer;
      originalFilename?: string;
      existingFaces?: BrandingTypefaceFace[];
    }): Promise<BrandingTypefaceFace>;
    readFace(brandingId: string, sha256: string): Promise<Buffer>;
    assertTypefaceAvailable(brandingId: string, typeface: unknown): Promise<void>;
    collectReferencedKeys(): Promise<Map<string, { brandingId: string; sha256: string }>>;
    reconcileAssets(options?: { now?: number; graceMs?: number }): Promise<{
      scanned: number;
      referenced: number;
      deleted: number;
      skippedGrace: number;
      skippedUnexpected: number;
      failures: number;
    }>;
  };

  beforeEach(function () {
    const sails = {
      config: { branding: {}, http: { rootContext: '' } },
      log: {
        verbose: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    };
    setupServiceTestGlobals(sails);
    disk = new FakeDisk();
    (global as unknown as Record<string, unknown>).StorageManagerService = { primaryDisk: () => disk };
    (global as unknown as Record<string, unknown>).BrandingConfig = { find: async () => [], findOne: async () => null };
    (global as unknown as Record<string, unknown>).BrandingConfigHistory = { find: async () => [] };
    const { Services } = require('../../src/services/BrandingTypefaceService');
    service = new Services.BrandingTypeface();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
  });

  async function storeError(promise: Promise<unknown>): Promise<BrandingTypefaceError> {
    try {
      await promise;
    } catch (error) {
      return error as BrandingTypefaceError;
    }
    throw new Error('expected promise to reject');
  }

  it('derives canonical keys and root-aware public URLs', function () {
    const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(service.storageKey('brand-1', sha)).to.equal(`branding-fonts/brand-1/${sha}.woff2`);
    expect(service.publicUrl('default', sha)).to.equal(`/fonts/branding/default/${sha}.woff2`);
    expect(service.publicUrl('my brand', sha)).to.equal('/fonts/branding/my%20brand/' + sha + '.woff2');
    (global as unknown as { sails: { config: { http: { rootContext: string } } } }).sails.config.http.rootContext =
      'portal';
    expect(service.publicUrl('default', sha)).to.equal(`/portal/fonts/branding/default/${sha}.woff2`);
    expect(service.parseStorageKey(`branding-fonts/brand-1/${sha}.woff2`)).to.deep.equal({
      brandingId: 'brand-1',
      sha256: sha,
    });
    expect(service.parseStorageKey('branding-fonts/brand-1/junk.txt')).to.equal(null);
    expect(service.parseStorageKey('other/brand-1/' + sha + '.woff2')).to.equal(null);
  });

  it('exposes fixed slot descriptors', function () {
    expect(service.slotDescriptor('regular')).to.deep.equal({ weight: 400, style: 'normal' });
    expect(service.slotDescriptor('bold')).to.deep.equal({ weight: 700, style: 'normal' });
    expect(service.slotDescriptor('italic')).to.deep.equal({ weight: 400, style: 'italic' });
    expect(service.slotDescriptor('boldItalic')).to.deep.equal({ weight: 700, style: 'italic' });
  });

  it('stores a valid static face with hash metadata and no internal key', async function () {
    const bytes = buildWoff2(staticTables());
    const face = await service.inspectAndStoreFace({
      brandingId: 'brand-1',
      slot: 'regular',
      bytes,
      originalFilename: 'My Font.woff2',
    });
    expect(face.slot).to.equal('regular');
    expect(face.sha256).to.match(/^[0-9a-f]{64}$/);
    expect(face.sizeBytes).to.equal(bytes.length);
    expect(face.originalFilename).to.equal('My Font.woff2');
    expect(face.warnings).to.deep.equal([]);
    expect(face).to.not.have.property('storageKey');
    expect(face).to.not.have.property('bytes');
    expect(disk.puts).to.have.lengthOf(1);
    expect(disk.puts[0].options).to.deep.equal({ contentType: 'font/woff2' });
  });

  it('rejects invalid, truncated, variable, and bad-slot uploads', async function () {
    const bad = buildWoff2(staticTables());
    bad.writeUInt32BE(0xdeadbeef, 0);
    expect(
      (await storeError(service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes: bad }))).code
    ).to.equal('typeface-invalid-font');
    const truncated = buildWoff2(staticTables()).subarray(0, 20);
    expect(
      (await storeError(service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes: truncated }))).code
    ).to.equal('typeface-invalid-font');
    const variable = buildWoff2([...staticTables(), { tagIndex: 47, origLength: 64 }]);
    expect(
      (await storeError(service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes: variable }))).code
    ).to.equal('typeface-variable-font');
    expect(
      (
        await storeError(
          service.inspectAndStoreFace({ brandingId: 'b', slot: 'medium', bytes: buildWoff2(staticTables()) })
        )
      ).code
    ).to.equal('typeface-invalid-slot');
    expect(
      (await storeError(service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes: Buffer.alloc(0) }))).code
    ).to.equal('typeface-empty');
  });

  it('warns on embedded descriptor mismatch without rejecting', async function () {
    const xml = '<?xml version="1.0"?><metadata><name id="1">Mismatch</name><name id="2">Bold</name></metadata>';
    const bytes = buildWoff2(staticTables(), { metaXml: xml });
    const regular = await service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes });
    expect(regular.warnings).to.have.lengthOf(1);
    expect(regular.warnings[0]).to.contain('regular');
    const bold = await service.inspectAndStoreFace({ brandingId: 'b', slot: 'bold', bytes });
    expect(bold.warnings).to.deep.equal([]);
  });

  it('enforces face and distinct-family compressed limits', async function () {
    (
      global as unknown as { sails: { config: { branding: Record<string, number> } } }
    ).sails.config.branding.typefaceFaceMaxBytes = 10;
    const bytes = buildWoff2(staticTables());
    expect((await storeError(service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes }))).code).to.equal(
      'typeface-face-too-large'
    );
    delete (global as unknown as { sails: { config: { branding: Record<string, number> } } }).sails.config.branding
      .typefaceFaceMaxBytes;
    (
      global as unknown as { sails: { config: { branding: Record<string, number> } } }
    ).sails.config.branding.typefaceFamilyMaxBytes = 200;
    const first = await service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes });
    expect(
      (
        await storeError(
          service.inspectAndStoreFace({
            brandingId: 'b',
            slot: 'bold',
            bytes: buildWoff2(staticTables(), { compressedSize: 65 }),
            existingFaces: [first],
          })
        )
      ).code
    ).to.equal('typeface-family-too-large');
    // Same content deduplicated across slots counts once.
    const same = await service.inspectAndStoreFace({ brandingId: 'b', slot: 'bold', bytes, existingFaces: [first] });
    expect(same.sha256).to.equal(first.sha256);
  });

  it('dedupes same-brand content and isolates brands', async function () {
    const bytes = buildWoff2(staticTables());
    const first = await service.inspectAndStoreFace({ brandingId: 'brand-1', slot: 'regular', bytes });
    const second = await service.inspectAndStoreFace({ brandingId: 'brand-1', slot: 'bold', bytes });
    expect(second.sha256).to.equal(first.sha256);
    expect(disk.puts).to.have.lengthOf(1);
    await service.inspectAndStoreFace({ brandingId: 'brand-2', slot: 'regular', bytes });
    expect(disk.puts).to.have.lengthOf(2);
  });

  it('maps disk failures without mutating state', async function () {
    disk.failPut = true;
    const error = await storeError(
      service.inspectAndStoreFace({ brandingId: 'b', slot: 'regular', bytes: buildWoff2(staticTables()) })
    );
    expect(error.code).to.equal('typeface-storage-failed');
    expect(disk.objects.size).to.equal(0);
  });

  it('reads back verified bytes and reports missing/corrupt faces', async function () {
    const bytes = buildWoff2(staticTables());
    const face = await service.inspectAndStoreFace({ brandingId: 'brand-1', slot: 'regular', bytes });
    expect((await service.readFace('brand-1', face.sha256)).equals(bytes)).to.equal(true);
    expect((await storeError(service.readFace('brand-1', 'f'.repeat(64)))).code).to.equal('typeface-not-found');
    expect((await storeError(service.readFace('brand-1', 'not-a-hash'))).code).to.equal('typeface-not-found');
    disk.objects.get(service.storageKey('brand-1', face.sha256))!.bytes = Buffer.from('tampered');
    expect((await storeError(service.readFace('brand-1', face.sha256))).code).to.equal('typeface-corrupt');
  });

  it('checks whole-snapshot availability', async function () {
    const bytes = buildWoff2(staticTables());
    const face = await service.inspectAndStoreFace({ brandingId: 'brand-1', slot: 'regular', bytes });
    await service.assertTypefaceAvailable('brand-1', { mode: 'custom', faces: { regular: face } });
    await service.assertTypefaceAvailable('brand-1', { mode: 'default', faces: {} });
    const missing = { ...face, sha256: 'a'.repeat(64) };
    expect(
      (await storeError(service.assertTypefaceAvailable('brand-1', { mode: 'custom', faces: { regular: missing } })))
        .code
    ).to.equal('typeface-not-found');
  });

  it('reconciles orphans safely with grace, pagination, and unexpected keys', async function () {
    const refBytes = buildWoff2(staticTables());
    const refFace = await service.inspectAndStoreFace({ brandingId: 'brand-1', slot: 'regular', bytes: refBytes });
    const oldAge = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const newAge = new Date(Date.now() - 60 * 1000);
    const orphanBytes = buildWoff2(staticTables(), { compressedSize: 65 });
    const orphanSha = require('crypto').createHash('sha256').update(orphanBytes).digest('hex');
    const orphanKey = `branding-fonts/brand-1/${orphanSha}.woff2`;
    const recentBytes = buildWoff2(staticTables(), { compressedSize: 66 });
    const recentSha = require('crypto').createHash('sha256').update(recentBytes).digest('hex');
    disk.objects.set(orphanKey, { bytes: orphanBytes, lastModified: oldAge });
    disk.objects.set(`branding-fonts/brand-1/${recentSha}.woff2`, { bytes: recentBytes, lastModified: newAge });
    disk.objects.set('branding-fonts/brand-1/junk.txt', { bytes: Buffer.from('junk'), lastModified: oldAge });
    disk.pageSize = 2;
    (global as unknown as Record<string, unknown>).BrandingConfig = {
      find: async () => [
        { id: 'brand-1', typeface: { mode: 'custom', faces: { regular: refFace } }, draftTypeface: null },
      ],
      findOne: async () => ({
        id: 'brand-1',
        typeface: { mode: 'custom', faces: { regular: refFace } },
        draftTypeface: null,
      }),
    };
    (global as unknown as Record<string, unknown>).BrandingConfigHistory = { find: async () => [] };
    const result = await service.reconcileAssets({ graceMs: 24 * 60 * 60 * 1000 });
    expect(result.scanned).to.equal(4);
    expect(result.deleted).to.equal(1);
    expect(disk.deletes).to.deep.equal([orphanKey]);
    expect(result.skippedGrace).to.equal(1);
    expect(result.skippedUnexpected).to.equal(1);
    expect(result.failures).to.equal(0);
    expect(disk.objects.has(service.storageKey('brand-1', refFace.sha256))).to.equal(true);
  });

  it('rechecks references before delete and counts failures', async function () {
    const orphanBytes = buildWoff2(staticTables());
    const orphanSha = require('crypto').createHash('sha256').update(orphanBytes).digest('hex');
    const orphanKey = `branding-fonts/brand-1/${orphanSha}.woff2`;
    const oldAge = new Date(Date.now() - 48 * 60 * 60 * 1000);
    disk.objects.set(orphanKey, { bytes: orphanBytes, lastModified: oldAge });
    (global as unknown as Record<string, unknown>).BrandingConfig = { find: async () => [], findOne: async () => null };
    (global as unknown as Record<string, unknown>).BrandingConfigHistory = { find: async () => [] };
    // Race: the key becomes referenced between scan and delete.
    const racedFace = {
      slot: 'regular',
      sha256: orphanSha,
      originalFilename: 'r.woff2',
      sizeBytes: 1,
      uploadedAt: '',
      inspection: {},
      warnings: [],
    };
    (service as unknown as { isKeyReferenced: () => Promise<boolean> }).isKeyReferenced = async () => true;
    const raced = await service.reconcileAssets({ graceMs: 1 });
    expect(raced.deleted).to.equal(0);
    expect(disk.objects.has(orphanKey)).to.equal(true);
    void racedFace;
    // Failure: metadata read explodes for an unreferenced key.
    (service as unknown as { isKeyReferenced: (b: string, s: string) => Promise<boolean> }).isKeyReferenced =
      async () => false;
    const originalMeta = disk.getMetaData.bind(disk);
    disk.getMetaData = async () => {
      throw new Error('meta-down');
    };
    const failed = await service.reconcileAssets({ graceMs: 1 });
    expect(failed.failures).to.equal(1);
    expect(failed.deleted).to.equal(0);
    disk.getMetaData = originalMeta;
  });
});
