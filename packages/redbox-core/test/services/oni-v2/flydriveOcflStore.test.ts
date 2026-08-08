import { expect } from 'chai';
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import { createStorageManagerOcflStoreClass } from '../../../src/services/oni-v2/flydriveOcflStore';

class BaseStore {
  constructor(_options: Record<string, unknown>) {}
}

function harness(keyEncoding: 'flydrive' | 'raw' = 'flydrive') {
  const disk: any = {
    getMetaData: sinon.stub(),
    listAll: sinon.stub().resolves({ objects: [], paginationToken: undefined }),
    getStream: sinon.stub().returns(Readable.from('streamed')),
    get: sinon.stub().resolves('text'),
    getBytes: sinon.stub().resolves(Buffer.from('bytes')),
    put: sinon.stub().resolves(),
    putStream: sinon.stub().resolves(),
    copy: sinon.stub().resolves(),
    exists: sinon.stub().resolves(false),
    move: sinon.stub().resolves(),
    delete: sinon.stub().resolves(),
    deleteAll: sinon.stub().resolves(),
  };
  const Store = createStorageManagerOcflStoreClass(BaseStore);
  const store: any = new Store({
    disk,
    root: '/repo',
    workspace: '/work',
    prefix: '/oni/',
    keyEncoding,
  });
  return { disk, store };
}

function rawDriverHarness() {
  const result = harness('raw');
  const driver = {
    ...result.disk,
    get: sinon.stub().resolves('ocfl_1.1\n'),
    put: sinon.stub().resolves(),
  };
  result.disk.driver = driver;
  const Store = createStorageManagerOcflStoreClass(BaseStore);
  const store: any = new Store({
    disk: result.disk,
    root: '/repo',
    workspace: '/work',
    prefix: '/oni/',
    keyEncoding: 'raw',
  });
  return { disk: result.disk, driver, store };
}

describe('Oni Flydrive OCFL store', () => {
  it('maps root, workspace, encoded, and raw keys', () => {
    const { store } = harness();
    expect(store.keyFor('/repo')).to.equal('oni');
    expect(store.keyFor('/work')).to.equal('oni/__workspace__');
    expect(store.keyFor('/repo/object/inventory.json')).to.equal('oni/object/inventory.json');
    expect(store.keyFor('/work/staging/a=b')).to.equal('oni/__workspace__/staging/a%3Db');

    const raw = harness('raw').store;
    expect(raw.keyFor('/repo/a=b')).to.equal('oni/a=b');
  });

  it('stats files, directories, and missing paths', async () => {
    const { disk, store } = harness();
    const modified = new Date('2025-01-01T00:00:00Z');
    disk.getMetaData.resolves({ contentLength: 12, lastModified: modified });
    const file = await store.stat('/repo/file.txt');
    expect(file.size).to.equal(12);
    expect(file.mtime).to.equal(modified);
    expect(file.isFile()).to.equal(true);

    disk.getMetaData.rejects(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    disk.listAll.resolves({ objects: [{ key: 'oni/folder/child.txt' }] });
    const directory = await store.stat('/repo/folder');
    expect(directory.isDirectory()).to.equal(true);

    disk.listAll.resolves({ objects: [] });
    try {
      await store.stat('/repo/missing');
      expect.fail('Expected ENOENT');
    } catch (error: any) {
      expect(error.code).to.equal('ENOENT');
    }
  });

  it('reads, writes, streams, and copies objects', async () => {
    const { disk, store } = harness();
    expect(await store.readFile('/repo/a.txt', 'utf8')).to.equal('text');
    expect(Buffer.from(await store.readFile('/repo/a.bin')).toString()).to.equal('bytes');
    await store.writeFile('/repo/a.txt', 'value', { contentType: 'text/plain' });
    await store.writeFile('/repo/a.bin', Readable.from('value'));
    await store.copyFile('/repo/a.txt', '/repo/b.txt');
    expect(disk.put.calledOnce).to.equal(true);
    expect(disk.putStream.calledOnce).to.equal(true);
    expect(disk.copy.calledOnceWith('oni/a.txt', 'oni/b.txt')).to.equal(true);
    expect(await store.createReadable('/repo/a.txt')).to.equal(disk.getStream.returnValues[0]);

    disk.get.rejects(Object.assign(new Error('cannot read file'), { code: 'CANNOT_READ_FILE' }));
    try {
      await store.readFile('/repo/missing', 'utf8');
      expect.fail('Expected ENOENT');
    } catch (error: any) {
      expect(error.code).to.equal('ENOENT');
    }
  });

  it('bypasses the Flydrive key normalizer for explicitly configured raw OCFL keys', async () => {
    const { disk, driver, store } = rawDriverHarness();

    expect(await store.readFile('/repo/0=ocfl_1.1', 'utf8')).to.equal('ocfl_1.1\n');
    await store.writeFile('/repo/0=ocfl_1.1', 'ocfl_1.1\n');

    expect(driver.get.calledOnceWithExactly('oni/0=ocfl_1.1')).to.equal(true);
    expect(driver.put.calledOnceWith('oni/0=ocfl_1.1', 'ocfl_1.1\n')).to.equal(true);
    expect(disk.get.called).to.equal(false);
    expect(disk.put.called).to.equal(false);

    driver.get.rejects(Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }));
    try {
      await store.readFile('/repo/missing=key', 'utf8');
      expect.fail('Expected ENOENT');
    } catch (error: any) {
      expect(error.code).to.equal('ENOENT');
    }
  });

  it('lists paginated directory entries and exposes opendir', async () => {
    const { disk, store } = harness();
    disk.listAll.onFirstCall().resolves({
      objects: [
        { key: 'oni/folder/a%3Db.txt', isFile: true, contentLength: 4 },
        { key: 'oni/folder/sub/child.txt', isFile: true },
      ],
      paginationToken: 'next',
    });
    disk.listAll.onSecondCall().resolves({
      objects: [{ key: 'oni/folder/c.txt', isFile: true }],
      paginationToken: undefined,
    });

    const entries = await store.readDirectoryEntries('/repo/folder');
    expect(entries).to.deep.include.members([
      { name: 'a=b.txt', isFile: true, isDirectory: false },
      { name: 'sub', isFile: true, isDirectory: true },
      { name: 'c.txt', isFile: true, isDirectory: false },
    ]);
    disk.listAll.resetBehavior();
    disk.listAll.resolves({
      objects: [{ key: 'oni/folder/a%3Db.txt', isFile: true }],
      paginationToken: undefined,
    });
    const dir = await store.opendir('/repo/folder');
    expect((await dir.read()).name).to.equal('a=b.txt');
    await dir.close();

    disk.listAll.resetBehavior();
    disk.listAll.resolves({
      objects: [{ key: 'oni/folder/a%3Db.txt', contentLength: 4 }],
      paginationToken: undefined,
    });
    const listed: any[] = [];
    for await (const item of await store.list('/repo/folder', { recursive: true })) listed.push(item);
    expect(listed[0]).to.include({ name: 'a=b.txt', path: 'a=b.txt', size: 4 });
  });

  it('moves and removes both files and directory trees', async () => {
    const { disk, store } = harness();
    disk.exists.resolves(true);
    await store.move('/repo/source', '/repo/target');
    await store.remove('/repo/target');
    expect(disk.move.calledWith('oni/source', 'oni/target')).to.equal(true);
    expect(disk.delete.calledWith('oni/target')).to.equal(true);

    disk.exists.resolves(false);
    disk.listAll.resolves({
      objects: [{ key: 'oni/source/a.txt' }, { key: 'oni/source/sub/b.txt' }],
      paginationToken: undefined,
    });
    await store.move('/repo/source', '/repo/target');
    await store.remove('/repo/source');
    expect(disk.move.calledWith('oni/source/a.txt', 'oni/target/a.txt')).to.equal(true);
    expect(disk.deleteAll.calledWith('oni/source/')).to.equal(true);
    expect(await store.mkdir('/repo/new')).to.equal('/repo/new');
  });
});
