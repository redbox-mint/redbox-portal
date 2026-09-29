let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import zlib from 'zlib';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';
import { BrandingTypefaceError } from '../../src/services/BrandingTypefaceService';
import type { BrandingTypefaceFace } from '../../src/model/BrandingTypeface';

function buildWoff2(
  tables: Array<{ tagIndex: number; origLength?: number }>,
  opts: { compressedSize?: number; metaXml?: string } = {}
): Buffer {
  const name = tables.some(table => table.tagIndex === 47)
    ? 'variable'
    : opts.compressedSize === 65
      ? 'bold'
      : opts.compressedSize === 66
        ? 'italic'
        : 'regular';
  let font = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../../../../test/resources/fonts/test-font-' + name + '.woff2')
  ) as Buffer;
  if (opts.metaXml) {
    const metadata = zlib.brotliCompressSync(Buffer.from(opts.metaXml));
    const offset = Math.ceil(font.length / 4) * 4;
    font = Buffer.concat([font, Buffer.alloc(offset - font.length), metadata]);
    font.writeUInt32BE(font.length, 8);
    font.writeUInt32BE(offset, 28);
    font.writeUInt32BE(metadata.length, 32);
    font.writeUInt32BE(Buffer.byteLength(opts.metaXml), 36);
  }
  return font;
}
function staticTables(): Array<{ tagIndex: number }> {
  return [];
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

  for (const [name, variant, matching] of [
    ['regular', 64, 'regular'],
    ['bold', 65, 'bold'],
    ['italic', 66, 'italic'],
  ] as const) {
    it(`extracts real ${name} metadata and warns for mismatched slots without rejecting`, async function () {
      const bytes = buildWoff2(staticTables(), { compressedSize: variant });
      for (const slot of ['regular', 'bold', 'italic', 'boldItalic']) {
        const face = await service.inspectAndStoreFace({ brandingId: 'b', slot, bytes });
        expect(face.inspection.family).to.equal('Roboto');
        expect(face.inspection.subfamily).to.equal(name[0].toUpperCase() + name.slice(1));
        expect(face.inspection.embeddedWeight).to.equal(name === 'bold' ? 700 : 400);
        expect(face.inspection.embeddedStyle).to.equal(name === 'italic' ? 'italic' : 'normal');
        expect(face.slot).to.equal(slot);
        expect(face.warnings.length).to.equal(slot === matching ? 0 : 1);
      }
    });
  }

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
    ).sails.config.branding.typefaceFamilyMaxBytes = bytes.length + 1;
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
