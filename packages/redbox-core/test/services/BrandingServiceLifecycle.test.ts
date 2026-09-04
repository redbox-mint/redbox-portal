let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import zlib from 'zlib';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

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

function buildWoff2(compressedSize = 64): Buffer {
  const tables = [
    { tagIndex: 1, origLength: 54 },
    { tagIndex: 5, origLength: 128 },
    { tagIndex: 10, transformVersion: 3, origLength: 256 },
    { tagIndex: 11, transformVersion: 3, origLength: 32 },
  ];
  const dirBytes: number[] = [];
  for (const table of tables) {
    const transform = table.transformVersion ?? 0;
    dirBytes.push(((transform << 6) & 0xc0) | (table.tagIndex & 0x3f));
    for (const b of encodeBase128(table.origLength)) dirBytes.push(b);
  }
  void zlib;
  const fontData = Buffer.alloc(compressedSize, 0xa5);
  const header = Buffer.alloc(48);
  header.writeUInt32BE(0x774f4632, 0);
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(48 + dirBytes.length + compressedSize, 8);
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt16BE(0, 14);
  header.writeUInt32BE(1024, 16);
  header.writeUInt32BE(compressedSize, 20);
  header.writeUInt16BE(1, 24);
  header.writeUInt16BE(0, 26);
  return Buffer.concat([header, Buffer.from(dirBytes), fontData]);
}

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

function matches(row: FakeRow, criteria: Record<string, unknown>): boolean {
  return Object.entries(criteria).every(([key, value]) => (row[key] as unknown) === value);
}

class FakeDisk {
  objects = new Map<string, Buffer>();
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async getBytes(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);
    if (!bytes) {
      const error = new Error('NoSuchKey') as Error & { code?: string };
      error.code = 'NoSuchKey';
      throw error;
    }
    return bytes;
  }
  async getMetaData(key: string): Promise<{ contentLength: number; etag: string; lastModified: Date }> {
    const bytes = this.objects.get(key);
    if (!bytes) {
      const error = new Error('NoSuchKey') as Error & { code?: string };
      error.code = 'NoSuchKey';
      throw error;
    }
    return { contentLength: bytes.length, etag: 'etag', lastModified: new Date() };
  }
  async put(key: string, contents: Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(contents));
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async listAll(): Promise<{ paginationToken?: string; objects: Iterable<unknown> }> {
    return { objects: [...this.objects.keys()].map(key => ({ key })), paginationToken: undefined };
  }
}

function brandFixture(overrides: Record<string, unknown> = {}): FakeRow {
  return {
    id: 'brand-1',
    name: 'default',
    variables: { primary: '#112233' },
    css: '',
    hash: '',
    version: 0,
    typeface: null,
    draftTypeface: null,
    draftRevision: 0,
    ...overrides,
  };
}

function historyFixture(version: number, overrides: Record<string, unknown> = {}): FakeRow {
  return {
    id: `history-${version}`,
    branding: 'brand-1',
    version,
    hash: `hash-${version}`,
    css: `css-${version}`,
    variables: { primary: '#112233' },
    typeface: null,
    dateCreated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BrandingService lifecycle', function () {
  let disk: FakeDisk;
  let brands: FakeRow[];
  let histories: FakeRow[];
  let previews: Map<string, { data: Record<string, unknown> }>;
  let brandWrites = 0;
  let historyWrites = 0;
  let transactionCalls = 0;
  let datastoreMode: 'none' | 'tx' | 'unsupported' = 'none';
  let failNextBrandUpdate = false;
  let failNextHistoryCreate: null | 'unique' = null;
  let service: {
    brandings: Array<Record<string, unknown>>;
    getAdminState(branding: string): Promise<Record<string, unknown>>;
    listVersions(branding: string): Promise<Array<Record<string, unknown>>>;
    saveDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    uploadTypefaceFace(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    removeTypefaceFace(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    useDefaultTypography(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    revertTypefaceDraft(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    preview(branding: string, portal: string, expectedDraftRevision?: number): Promise<Record<string, unknown>>;
    previewVersion(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    fetchPreview(token: string): Promise<Record<string, unknown>>;
    publish(
      branding: string,
      portal: string,
      actor: unknown,
      opts?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    restore(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    rollback(versionId: string, actor: unknown, opts?: Record<string, unknown>): Promise<Record<string, unknown>>;
  };

  function brandQuery(value: unknown) {
    return {
      populate: () => Promise.resolve(value),
      then: (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(value).then(resolve, reject),
    };
  }

  beforeEach(function () {
    const mockSails = createMockSails({
      config: {
        appPath: '/app',
        http: { rootContext: '' },
        appUrl: 'http://localhost:1500',
        auth: { defaultBrand: 'default', defaultPortal: 'portal' },
        branding: {},
      },
    });
    setupServiceTestGlobals(mockSails);
    disk = new FakeDisk();
    brands = [brandFixture()];
    histories = [];
    previews = new Map();
    brandWrites = 0;
    historyWrites = 0;
    transactionCalls = 0;
    datastoreMode = 'none';
    failNextBrandUpdate = false;
    failNextHistoryCreate = null;
    let historySeq = 100;

    (global as unknown as Record<string, unknown>).StorageManagerService = { primaryDisk: () => disk };
    const themeCss = require('../../src/services/BrandingThemeCssService');
    (global as unknown as Record<string, unknown>).BrandingThemeCssService = new themeCss.Services.BrandingThemeCss();
    const typeface = require('../../src/services/BrandingTypefaceService');
    (global as unknown as Record<string, unknown>).BrandingTypefaceService = new typeface.Services.BrandingTypeface();
    (global as unknown as Record<string, unknown>).BrandingConfig = {
      findOne: (criteria: Record<string, unknown>) => brandQuery(brands.find(row => matches(row, criteria)) ?? null),
      find: () => Promise.resolve(brands.map(row => ({ ...row }))),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: async (patch: Record<string, unknown>) => {
          if (failNextBrandUpdate) {
            failNextBrandUpdate = false;
            return undefined;
          }
          const row = brands.find(candidate => matches(candidate, criteria));
          if (!row) return undefined;
          Object.assign(row, patch);
          brandWrites += 1;
          return { ...row };
        },
        usingConnection: function () {
          return this;
        },
      }),
      getDatastore: () => {
        if (datastoreMode === 'none') return undefined;
        if (datastoreMode === 'unsupported') {
          return {
            transaction: async () => {
              throw new Error('The adapter does not support transactional operations');
            },
          };
        }
        return {
          transaction: async (work: (conn: unknown) => Promise<unknown>) => {
            transactionCalls += 1;
            return work({});
          },
        };
      },
    };
    (global as unknown as Record<string, unknown>).BrandingConfigHistory = {
      find: (criteria: Record<string, unknown>) => {
        const rows = histories.filter(row => matches(row, criteria));
        return {
          sort: (spec: string) => {
            const desc = spec.includes('DESC');
            const sorted = [...rows].sort((a, b) =>
              desc ? (b.version as number) - (a.version as number) : (a.version as number) - (b.version as number)
            );
            return Promise.resolve(sorted.map(row => ({ ...row })));
          },
        };
      },
      findOne: (criteria: Record<string, unknown>) =>
        Promise.resolve(histories.find(row => matches(row, criteria)) ?? null),
      create: async (values: Record<string, unknown>) => {
        if (failNextHistoryCreate === 'unique') {
          failNextHistoryCreate = null;
          const error = new Error('E_UNIQUE: duplicate key') as Error & { code?: string };
          error.code = 'E_UNIQUE';
          throw error;
        }
        const key = `${String(values.branding)}:${String(values.version)}`;
        if (histories.some(row => `${String(row.branding)}:${String(row.version)}` === key)) {
          const error = new Error('E_UNIQUE: duplicate key') as Error & { code?: string };
          error.code = 'E_UNIQUE';
          throw error;
        }
        const row: FakeRow = { id: `history-new-${historySeq++}`, dateCreated: new Date().toISOString(), ...values };
        histories.push(row);
        historyWrites += 1;
        return { ...row };
      },
      destroy: async (criteria: Record<string, unknown>) => {
        histories = histories.filter(row => !matches(row, criteria));
        historyWrites += 1;
      },
    };
    (global as unknown as Record<string, unknown>).CacheEntry = {
      create: async (values: { name: string; data: Record<string, unknown> }) => {
        previews.set(values.name, { data: values.data });
        return values;
      },
      findOne: async (criteria: { name: string }) =>
        previews.has(criteria.name)
          ? { id: criteria.name, ts_added: Math.floor(Date.now() / 1000), data: previews.get(criteria.name)?.data }
          : null,
      destroy: async (criteria: { id: string }) => {
        previews.delete(criteria.id);
      },
    };
    const { Services } = require('../../src/services/BrandingService');
    service = new Services.Branding();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as unknown as Record<string, unknown>).BrandingConfig;
    delete (global as unknown as Record<string, unknown>).BrandingConfigHistory;
    delete (global as unknown as Record<string, unknown>).CacheEntry;
    delete (global as unknown as Record<string, unknown>).BrandingThemeCssService;
    delete (global as unknown as Record<string, unknown>).BrandingTypefaceService;
    delete (global as unknown as Record<string, unknown>).StorageManagerService;
  });

  async function conflictOf(
    promise: Promise<unknown>
  ): Promise<{ code?: string; current?: { version: number; draftRevision: number } }> {
    try {
      await promise;
    } catch (error) {
      return error as { code?: string; current?: { version: number; draftRevision: number } };
    }
    throw new Error('expected conflict');
  }

  function adminStateOf(state: Record<string, unknown>): {
    active: { version: number; typeface: { mode: string; faces: Record<string, unknown> } };
    draft: {
      revision: number;
      variables: Record<string, unknown>;
      typeface: { mode: string; faces: Record<string, unknown> };
      dirty: { colours: boolean; typeface: boolean };
    };
    versions: Array<Record<string, unknown>>;
    healthWarnings: Array<Record<string, unknown>>;
  } {
    return state as unknown as {
      active: { version: number; typeface: { mode: string; faces: Record<string, unknown> } };
      draft: {
        revision: number;
        variables: Record<string, unknown>;
        typeface: { mode: string; faces: Record<string, unknown> };
        dirty: { colours: boolean; typeface: boolean };
      };
      versions: Array<Record<string, unknown>>;
      healthWarnings: Array<Record<string, unknown>>;
    };
  }

  it('increments revision once per colour mutation and rejects stale or missing revisions', async function () {
    const state = adminStateOf(
      await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 0 })
    );
    expect(state.draft.revision).to.equal(1);
    expect(state.draft.variables).to.deep.equal({ primary: '#ffffff' });
    const conflict = await conflictOf(
      service.saveDraft({ branding: 'default', variables: { primary: '#000000' }, expectedDraftRevision: 0 })
    );
    expect(conflict.code).to.equal('branding-conflict');
    expect(conflict.current).to.deep.equal({ version: 0, draftRevision: 1 });
    expect(brands[0].variables).to.deep.equal({ primary: '#ffffff' });
    const missing = await conflictOf(service.saveDraft({ branding: 'default', variables: {} }));
    expect(missing.code).to.equal('branding-conflict');
  });

  it('keeps colour and typeface drafts independent', async function () {
    const bytes = buildWoff2();
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 0,
    });
    const afterColour = adminStateOf(
      await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 1 })
    );
    expect(afterColour.draft.typeface.mode).to.equal('custom');
    expect(afterColour.draft.variables).to.deep.equal({ primary: '#ffffff' });
    const afterRevert = adminStateOf(
      await service.revertTypefaceDraft({ branding: 'default', expectedDraftRevision: 2 })
    );
    expect(afterRevert.draft.typeface.mode).to.equal('default');
    expect(afterRevert.draft.variables).to.deep.equal({ primary: '#ffffff' });
  });

  it('holds an incomplete custom draft but refuses to publish it', async function () {
    const bytes = buildWoff2(65);
    const state = adminStateOf(
      await service.uploadTypefaceFace({
        branding: 'default',
        slot: 'bold',
        bytes,
        originalFilename: 'b.woff2',
        expectedDraftRevision: 0,
      })
    );
    expect(state.draft.typeface.mode).to.equal('custom');
    expect(state.draft.typeface.faces.regular).to.equal(undefined);
    try {
      await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 1 });
      throw new Error('expected publish to fail');
    } catch (error) {
      expect((error as Error).message).to.contain('branding-invalid');
    }
    expect(brands[0].version).to.equal(0);
    expect(histories).to.have.lengthOf(0);
  });

  it('publishes Default Typography without faces and is idempotent on repeat', async function () {
    const actor = { id: 'u1', displayName: 'Admin User' };
    const first = await service.publish('default', 'portal', actor, { expectedVersion: 0, expectedDraftRevision: 0 });
    expect(first.version).to.equal(1);
    expect(first.idempotent).to.equal(undefined);
    expect(histories).to.have.lengthOf(1);
    expect(histories[0].actorId).to.equal('u1');
    expect(histories[0].actorDisplayName).to.equal('Admin User');
    const state = adminStateOf(await service.getAdminState('default'));
    expect(state.active.version).to.equal(1);
    expect(state.draft.revision).to.equal(1);
    expect(state.draft.dirty).to.deep.equal({ colours: false, typeface: false });
    const second = await service.publish('default', 'portal', actor, { expectedVersion: 1, expectedDraftRevision: 1 });
    expect(second.version).to.equal(1);
    expect(second.idempotent).to.equal(true);
    expect(histories).to.have.lengthOf(1);
  });

  it('publishes a custom typeface and reports health without failing config', async function () {
    const bytes = buildWoff2();
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 0,
    });
    const published = await service.publish(
      'default',
      'portal',
      { id: 'u1' },
      { expectedVersion: 0, expectedDraftRevision: 1 }
    );
    expect(published.version).to.equal(1);
    const state = adminStateOf(await service.getAdminState('default'));
    expect(state.active.typeface.mode).to.equal('custom');
    expect(state.healthWarnings).to.deep.equal([]);
    expect(state.versions).to.have.lengthOf(1);
    expect(state.versions[0].typeface).to.deep.equal(state.active.typeface);
    // Corrupt the stored bytes: config retrieval still succeeds with a warning.
    const key = `branding-fonts/brand-1/${(state.active.typeface.faces.regular as { sha256: string }).sha256}.woff2`;
    disk.objects.set(key, Buffer.from('tampered'));
    const degraded = adminStateOf(await service.getAdminState('default'));
    expect(degraded.healthWarnings).to.have.lengthOf(1);
    expect(degraded.healthWarnings[0].code).to.equal('face-corrupt');
    // Missing object reports unavailability instead.
    disk.objects.delete(key);
    const missing = adminStateOf(await service.getAdminState('default'));
    expect(missing.healthWarnings[0].code).to.equal('face-unavailable');
  });

  it('fails publish on integrity errors without mutating active state', async function () {
    const bytes = buildWoff2();
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 0,
    });
    const key = `branding-fonts/brand-1/${(adminStateOf(await service.getAdminState('default')).draft.typeface.faces.regular as { sha256: string }).sha256}.woff2`;
    disk.objects.delete(key);
    try {
      await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 1 });
      throw new Error('expected publish to fail');
    } catch (error) {
      expect((error as { code?: string }).code).to.equal('typeface-not-found');
    }
    expect(brands[0].version).to.equal(0);
    expect(histories).to.have.lengthOf(0);
  });

  it('binds preview to an exact revision and previews history without mutation', async function () {
    await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 0 });
    const preview = await service.preview('default', 'portal', 1);
    expect(preview.revision).to.equal(1);
    const fetched = await service.fetchPreview(preview.token as string);
    expect(fetched.css).to.contain('#ffffff');
    const conflict = await conflictOf(service.preview('default', 'portal', 0));
    expect(conflict.code).to.equal('branding-conflict');
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 1 });
    await service.saveDraft({ branding: 'default', variables: { primary: '#000000' }, expectedDraftRevision: 2 });
    const historical = await service.previewVersion({
      branding: 'default',
      portal: 'portal',
      versionId: 'history-new-100',
    });
    const historicalFetched = await service.fetchPreview(historical.token as string);
    expect(historicalFetched.css).to.contain('#ffffff');
    const state = adminStateOf(await service.getAdminState('default'));
    expect(state.draft.variables).to.deep.equal({ primary: '#000000' });
    expect(state.draft.revision).to.equal(3);
  });

  it('restores with same-brand scoping, fresh versions, and aligned drafts', async function () {
    await service.publish(
      'default',
      'portal',
      { id: 'u1', displayName: 'U One' },
      { expectedVersion: 0, expectedDraftRevision: 0 }
    );
    await service.saveDraft({ branding: 'default', variables: { primary: '#000000' }, expectedDraftRevision: 1 });
    await service.publish(
      'default',
      'portal',
      { id: 'u2', displayName: 'U Two' },
      { expectedVersion: 1, expectedDraftRevision: 2 }
    );
    const firstId = histories.find(row => row.version === 1)?.id as string;
    const restored = await service.restore({
      branding: 'default',
      versionId: firstId,
      expectedVersion: 2,
      expectedDraftRevision: 3,
      actor: { id: 'u3', displayName: 'U Three' },
    });
    expect(restored.version).to.equal(3);
    const created = histories.find(row => row.version === 3);
    expect(created?.restoredFromVersion).to.equal(1);
    expect(created?.actorId).to.equal('u3');
    const state = adminStateOf(await service.getAdminState('default'));
    expect(state.active.version).to.equal(3);
    expect(state.draft.revision).to.equal(4);
    expect(state.draft.dirty).to.deep.equal({ colours: false, typeface: false });
    // Restoring the currently active snapshot still creates an audited version.
    const activeId = histories.find(row => row.version === 3)?.id as string;
    const repeat = await service.restore({
      branding: 'default',
      versionId: activeId,
      expectedVersion: 3,
      expectedDraftRevision: 4,
      actor: { id: 'u3' },
    });
    expect(repeat.version).to.equal(4);
    // Cross-brand restore is rejected.
    brands.push(brandFixture({ id: 'brand-2', name: 'other' }));
    histories.push(historyFixture(1, { id: 'history-other-1', branding: 'brand-2' }));
    try {
      await service.restore({
        branding: 'default',
        versionId: 'history-other-1',
        expectedVersion: 4,
        expectedDraftRevision: 5,
        actor: {},
      });
      throw new Error('expected restore to fail');
    } catch (error) {
      expect((error as Error).message).to.contain('history-not-found');
    }
    const stale = await conflictOf(
      service.restore({
        branding: 'default',
        versionId: firstId,
        expectedVersion: 0,
        expectedDraftRevision: 5,
        actor: {},
      })
    );
    expect(stale.code).to.equal('branding-conflict');
  });

  it('regenerates restore CSS and rechecks bytes before mutation', async function () {
    const bytes = buildWoff2();
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 0,
    });
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 1 });
    await service.useDefaultTypography({ branding: 'default', expectedDraftRevision: 2 });
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 1, expectedDraftRevision: 3 });
    const firstId = histories.find(row => row.version === 1)?.id as string;
    const stored = histories.find(row => row.version === 1);
    if (stored) stored.css = 'stale-css';
    const restored = await service.restore({
      branding: 'default',
      versionId: firstId,
      expectedVersion: 2,
      expectedDraftRevision: 4,
      actor: { id: 'u1' },
    });
    expect(restored.version).to.equal(3);
    expect(histories.find(row => row.version === 3)?.css).to.contain('ReDBox Brand Typeface');
    // Delete the underlying bytes: restore must fail before any active mutation.
    const sha = (
      adminStateOf(await service.getAdminState('default')).active.typeface.faces.regular as { sha256: string }
    ).sha256;
    disk.objects.delete(`branding-fonts/brand-1/${sha}.woff2`);
    const otherId = histories.find(row => row.version === 1)?.id as string;
    try {
      await service.restore({
        branding: 'default',
        versionId: otherId,
        expectedVersion: 3,
        expectedDraftRevision: 5,
        actor: { id: 'u1' },
      });
      throw new Error('expected restore to fail');
    } catch (error) {
      expect((error as { code?: string }).code).to.equal('typeface-not-found');
    }
    expect(brands[0].version).to.equal(3);
  });

  it('prunes to the newest three versions', async function () {
    const colours = ['#111111', '#222222', '#333333', '#444444'];
    let version = 0;
    let revision = 0;
    for (const colour of colours) {
      await service.saveDraft({ branding: 'default', variables: { primary: colour }, expectedDraftRevision: revision });
      revision += 1;
      const published = await service.publish(
        'default',
        'portal',
        { id: 'u1' },
        { expectedVersion: version, expectedDraftRevision: revision }
      );
      version = published.version as number;
      revision += 1;
    }
    expect(version).to.equal(4);
    expect(histories.map(row => row.version).sort()).to.deep.equal([2, 3, 4]);
    expect((await service.listVersions('default')).map(entry => entry.version)).to.deep.equal([4, 3, 2]);
  });

  it('maps version-allocation conflicts to 409 and supports transactions', async function () {
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 0 });
    await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 1 });
    // A concurrent publisher wins the next version: the duplicate insert maps to 409.
    histories.push(historyFixture(2, { id: 'history-racing-2' }));
    failNextHistoryCreate = 'unique';
    const conflict = await conflictOf(
      service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 1, expectedDraftRevision: 2 })
    );
    expect(conflict.code).to.equal('branding-conflict');
    expect(brands[0].version).to.equal(1);
    datastoreMode = 'tx';
    await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 2 });
    const published = await service.publish(
      'default',
      'portal',
      { id: 'u1' },
      { expectedVersion: 1, expectedDraftRevision: 3 }
    );
    expect(published.version).to.equal(3);
    expect(transactionCalls).to.be.greaterThan(0);
    datastoreMode = 'unsupported';
    await service.saveDraft({ branding: 'default', variables: { primary: '#000000' }, expectedDraftRevision: 4 });
    const fallback = await service.publish(
      'default',
      'portal',
      { id: 'u1' },
      { expectedVersion: 3, expectedDraftRevision: 5 }
    );
    expect(fallback.version).to.equal(4);
  });

  it('cleans up the history row when the active update fails without transactions', async function () {
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 0 });
    await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 1 });
    failNextBrandUpdate = true;
    const conflict = await conflictOf(
      service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 1, expectedDraftRevision: 2 })
    );
    expect(conflict.code).to.equal('branding-conflict');
    expect(brands[0].version).to.equal(1);
    expect(histories.map(row => row.version).sort()).to.deep.equal([1]);
  });

  it('refreshes the cache only after a committed active change', async function () {
    service.brandings = [{ ...brands[0] }];
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 0 });
    expect((service.brandings[0] as { version?: number }).version).to.equal(1);
    await service.saveDraft({ branding: 'default', variables: { primary: '#ffffff' }, expectedDraftRevision: 1 });
    failNextBrandUpdate = true;
    await conflictOf(
      service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 1, expectedDraftRevision: 2 })
    );
    expect((service.brandings[0] as { version?: number }).version).to.equal(1);
  });

  it('keeps rollback as a restore-semantics alias', async function () {
    await service.publish('default', 'portal', { id: 'u1' }, { expectedVersion: 0, expectedDraftRevision: 0 });
    const firstId = histories.find(row => row.version === 1)?.id as string;
    const rolled = await service.rollback(
      firstId,
      { id: 'u9' },
      { branding: 'default', expectedVersion: 1, expectedDraftRevision: 1 }
    );
    expect(rolled.version).to.equal(2);
    expect(histories.find(row => row.version === 2)?.restoredFromVersion).to.equal(1);
  });

  it('supports face removal, default switch, and slot validation', async function () {
    const bytes = buildWoff2();
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 0,
    });
    try {
      await service.uploadTypefaceFace({ branding: 'default', slot: 'medium', bytes, expectedDraftRevision: 1 });
      throw new Error('expected upload to fail');
    } catch (error) {
      expect((error as Error).message).to.contain('branding-invalid');
    }
    const removed = adminStateOf(
      await service.removeTypefaceFace({ branding: 'default', slot: 'regular', expectedDraftRevision: 1 })
    );
    expect(removed.draft.typeface.mode).to.equal('default');
    try {
      await service.removeTypefaceFace({ branding: 'default', slot: 'regular', expectedDraftRevision: 2 });
      throw new Error('expected remove to fail');
    } catch (error) {
      expect((error as Error).message).to.contain('branding-face-not-found');
    }
    await service.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes,
      originalFilename: 'r.woff2',
      expectedDraftRevision: 2,
    });
    const defaulted = adminStateOf(
      await service.useDefaultTypography({ branding: 'default', expectedDraftRevision: 3 })
    );
    expect(defaulted.draft.typeface.mode).to.equal('default');
    expect(defaulted.draft.revision).to.equal(4);
  });
});
