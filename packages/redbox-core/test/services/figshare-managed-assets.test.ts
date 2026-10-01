import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import type { FigshareSyncModel } from '../../src/model/storage/FigshareSyncModel';
import type { FigshareFile } from '../../src/services/figshare-v2/types';
const requireTest = createRequire(import.meta.url);
const { createMockSails } = requireTest('./testHelper');
const { FigsharePublishing } = requireTest('../../src/configmodels/FigsharePublishing');
const { mirrorManagedAssets, cleanupProjection } = requireTest('../../src/services/figshare-v2/managed-assets');
const { FigshareWaiting, FigshareRepairRequired } = requireTest('../../src/services/figshare-v2/execution');

describe('Figshare managed asset receipts and retained-byte cleanup', () => {
  let state: FigshareSyncModel;
  let bytes: Buffer;
  let files: FigshareFile[];
  let uploads: number;
  let initialisations: number;
  let deleted: string[];
  let failInit: boolean;
  let pending: boolean;
  let config: InstanceType<typeof FigsharePublishing>;
  let savedManager: unknown;
  let savedServices: unknown;
  let savedSails: unknown;
  const staged = new Map<string, Buffer>();
  const checkpoint = async (change: (s: FigshareSyncModel) => void) => { change(state); return state; };
  const record = () => ({ redboxOid: 'oid', metadata: { dataLocations: [{ type: 'attachment', fileId: 'local', name: 'same.txt', selected: true }] } });
  const client = () => ({
    listArticleFiles: async () => files,
    createArticleFile: async (_articleId: string, payload: { name: string; size: number }) => {
      initialisations++; const id = 100 + initialisations;
      files.push({ id, name: payload.name, size: payload.size, status: 'created', download_url: `https://files.test/${id}` });
      if (failInit) throw new Error('Response lost after initialisation');
      return { location: `https://api.test/account/articles/51/files/${id}`, entity_id: id };
    },
    getLocation: async (location: string) => location.startsWith('https://uploader.test/')
      ? { parts: [{ partNo: 1, startOffset: 0, endOffset: bytes.length - 1 }] }
      : { id: Number(location.split('/').pop()), upload_url: `https://uploader.test/${location.split('/').pop()}` },
    uploadFilePart: async (_url: string, _part: number, stream: Readable) => { uploads++; for await (const _chunk of stream) { /* consume streamed part */ } return {}; },
    completeFileUpload: async (_articleId: string, id: string) => { if (!pending) files.find(f => String(f.id) === id)!.status = 'available'; return {}; },
    deleteArticleFile: async (_articleId: string, id: string) => { deleted.push(id); files = files.filter(f => String(f.id) !== id); return {}; },
    getPublicArticle: async () => ({ id: 51, files })
  });
  beforeEach(() => {
    savedSails = Reflect.get(globalThis, 'sails');
    Reflect.set(globalThis, 'sails', createMockSails());
    config = new FigsharePublishing(); bytes = Buffer.from('first content'); initialisations = 0; uploads = 0; deleted = []; failInit = false; pending = false;
    files = [{ id: 9, name: 'same.txt', size: bytes.length, status: 'available', download_url: 'https://files.test/9' }];
    const work = () => ({ requested: 0, processed: 0, sourceGeneration: 0, dueAt: null, policies: [], requestedBy: '' });
    state = { oid: 'oid', brandId: 'brand', revision: 0, importedGeneration: 0, work: { sync: work(), cleanup: work(), observe: work() },
      nextActionAt: null, dispatchUntil: 0, leaseOwner: null, leaseUntil: 0, receipts: [], checkpoints: {}, status: 'running' };
    const disk = {
      putStream: async (key: string, stream: Readable) => { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); staged.set(key, Buffer.concat(chunks)); },
      getMetaData: async (key: string) => ({ contentLength: staged.get(key)!.length }),
      getStream: async (key: string) => Readable.from(staged.get(key)!), delete: async (key: string) => { staged.delete(key); }
    };
    savedManager = Reflect.get(globalThis, 'StorageManagerService'); savedServices = sails.services;
    Reflect.set(globalThis, 'StorageManagerService', { disk: () => disk, stagingDisk: () => disk });
    Object.assign(sails.config, { record: { datastreamService: 'teststreams' } });
    Reflect.set(sails, 'services', { teststreams: { getDatastream: async () => ({ size: bytes.length, readstream: Readable.from(bytes) }), removeDatastream: async () => { throw new Error('Local bytes must never be deleted'); } } });
  });
  afterEach(() => { Reflect.set(globalThis, 'StorageManagerService', savedManager); Reflect.set(sails, 'services', savedServices); staged.clear(); Reflect.set(globalThis, 'sails', savedSails); });
  it('replaces changed content with the same filename while preserving foreign files', async () => {
    const current = record(); const remote = client();
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    assert.equal(initialisations, 1); assert.equal(uploads, 1); assert.equal(files.length, 2);
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    assert.equal(initialisations, 1);
    bytes = Buffer.from('changed bytes');
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    assert.equal(initialisations, 2); assert.deepEqual(deleted, ['101']); assert.ok(files.some(f => f.id === 9));
  });
  it('removes only receipt-owned files when deselected', async () => {
    const current = record(); const remote = client();
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    current.metadata.dataLocations[0].selected = false;
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    assert.deepEqual(deleted, ['101']); assert.equal(files[0].id, 9);
  });
  it('never repeats uncertain file initialisation or deletes a foreign slow upload', async () => {
    failInit = true;
    await assert.rejects(mirrorManagedAssets(client(), config, record(), '51', state, checkpoint), /Response lost/);
    failInit = false;
    await assert.rejects(mirrorManagedAssets(client(), config, record(), '51', state, checkpoint), FigshareRepairRequired);
    assert.equal(initialisations, 1); assert.deepEqual(deleted, []);
  });
  it('resumes only an explicitly approved existing upload without initialising another file', async () => {
    failInit = true;
    await assert.rejects(mirrorManagedAssets(client(), config, record(), '51', state, checkpoint), /Response lost/);
    failInit = false;
    Object.assign(state.receipts[0], { fileId: '101', state: 'uploading', resumeApproved: true });
    await mirrorManagedAssets(client(), config, record(), '51', state, checkpoint);
    assert.equal(initialisations, 1); assert.equal(uploads, 1);
    assert.equal(state.receipts[0].state, 'available'); assert.equal(state.receipts[0].resumeApproved, false);
    assert.deepEqual(deleted, []);
  });
  it('observes pending completion without another upload or completion POST', async () => {
    pending = true;
    await assert.rejects(mirrorManagedAssets(client(), config, record(), '51', state, checkpoint), FigshareWaiting);
    await assert.rejects(mirrorManagedAssets(client(), config, record(), '51', state, checkpoint), FigshareWaiting);
    assert.equal(initialisations, 1); assert.equal(uploads, 1);
    files[1].status = 'available';
    await mirrorManagedAssets(client(), config, record(), '51', state, checkpoint);
    assert.equal(state.receipts[0].state, 'available');
  });
  it('projects verified public links while retaining bytes and remote desired identity', async () => {
    const current = record(); const remote = client();
    config.selection.attachmentMode = 'all'; config.selection.urlMode = 'selectedOnly'; current.metadata.dataLocations[0].selected = false;
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    const locations = await cleanupProjection(remote, config, current, { id: 51, is_public: true, published_date: '2026-01-01' }, state);
    assert.equal(locations[0].type, 'url'); assert.equal(locations[0].localBytesRetained, true); assert.equal(bytes.toString(), 'first content');
    await mirrorManagedAssets(remote, config, { ...current, metadata: { dataLocations: locations } }, '51', state, checkpoint);
    assert.deepEqual(deleted, []); assert.equal(initialisations, 1);
  });
  it('defers cleanup for embargo, unavailable public files and changed local bytes', async () => {
    const current = record(); const remote = client();
    await mirrorManagedAssets(remote, config, current, '51', state, checkpoint);
    const article = { id: 51, is_public: true, published_date: '2026-01-01' };
    await assert.rejects(cleanupProjection(remote, config, current, { ...article, is_embargoed: true }, state), FigshareWaiting);
    bytes = Buffer.from('new local edit');
    await assert.rejects(cleanupProjection(remote, config, current, article, state), FigshareWaiting);
    assert.equal(current.metadata.dataLocations[0].type, 'attachment');
    assert.deepEqual(deleted, []);
  });
  it('publishes selected URLs when hosted files are disabled for a record that also has attachments', async () => {
    config.assets.enableHostedFiles = false;
    const current = record();
    current.metadata.dataLocations.push({ type: 'url', location: 'https://example.org/data', selected: true } as never);
    await mirrorManagedAssets(client(), config, current, '51', state, checkpoint);
    assert.equal(initialisations, 1); assert.equal(uploads, 0);
    assert.equal(state.receipts.find(r => r.kind === 'link')?.link, 'https://example.org/data');
  });
  it('reuses a legacy linked file without a receipt instead of creating a duplicate', async () => {
    files.push({ id: 77, name: 'legacy', size: 0, is_link_only: true, download_url: 'https://example.org/data' });
    const current = { redboxOid: 'oid', metadata: { dataLocations: [{ type: 'url', location: 'https://example.org/data', selected: true }] } };
    await mirrorManagedAssets(client(), config, current, '51', state, checkpoint);
    assert.equal(initialisations, 0); assert.equal(state.receipts.length, 0); assert.deepEqual(deleted, []);
  });
});
