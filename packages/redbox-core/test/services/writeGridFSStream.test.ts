import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { writeGridFSStream } from '../../src/storage/writeGridFSStream';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('GridFS upload ownership', () => {
  it('waits for a dispatched write after source failure and preserves the original error', async () => {
    const entered = deferred(),
      held = deferred();
    const marker = new Error('source failed');
    const source = new Readable({
      read() {
        this.push(Buffer.from('abcdefgh'));
        this._read = () => {};
      },
    });
    let written = false,
      settled = false;
    const upload = new Writable({
      write(_chunk, _encoding, callback) {
        entered.resolve();
        void held.promise.then(() => {
          written = true;
          callback();
        });
      },
    });
    const work = writeGridFSStream(source, upload, 4).then(
      () => {
        throw Error('expected failure');
      },
      error => {
        settled = true;
        assert.equal(error, marker);
      }
    );
    try {
      await entered.promise;
      source.destroy(marker);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(settled, false);
      assert.equal(written, false);
    } finally {
      held.resolve();
      await work;
    }
    assert.equal(written, true);
    assert.equal(source.destroyed, true);
    assert.equal(upload.destroyed, true);
  });
  it('keeps the source error when its pending destination write also fails', async () => {
    const entered = deferred(),
      held = deferred();
    const sourceError = new Error('source failed first'),
      destinationError = new Error('write failed later');
    const source = new Readable({
      read() {
        this.push(Buffer.from('abcd'));
        this._read = () => {};
      },
    });
    const upload = new Writable({
      write(_chunk, _encoding, callback) {
        entered.resolve();
        void held.promise.then(() => callback(destinationError));
      },
    });
    const work = writeGridFSStream(source, upload, 4);
    await entered.promise;
    source.destroy(sourceError);
    await new Promise<void>(resolve => setImmediate(resolve));
    held.resolve();
    await assert.rejects(work, error => error === sourceError);
  });
  it('bounds writes to one physical chunk and preserves byte order', async () => {
    const writes: Buffer[] = [];
    const upload = new Writable({
      write(chunk, _encoding, callback) {
        writes.push(Buffer.from(chunk));
        callback();
      },
    });
    await writeGridFSStream(Readable.from(['ab', Buffer.from('cdefghijk')]), upload, 4);
    assert(writes.every(chunk => chunk.length <= 4));
    assert.equal(Buffer.concat(writes).toString(), 'abcdefghijk');
  });
  it('cancels an idle input when upload construction fails', async () => {
    const marker = new Error('construction failed before source data');
    const source = new Readable({ read() {} });
    const upload = new Writable({
      construct(callback) {
        callback(marker);
      },
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    await assert.rejects(writeGridFSStream(source, upload, 4), error => error === marker);
    assert.equal(source.destroyed, true);
  });
  it('preserves Node binary views including byte offsets', async () => {
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5]);
    for (const chunk of [new Uint16Array([0x1234, 0x5678]), new DataView(backing.buffer, 1, 3)]) {
      const baseline: Buffer[] = [],
        actual: Buffer[] = [];
      await pipeline(
        Readable.from([chunk]),
        new Writable({
          write(value, _encoding, callback) {
            baseline.push(Buffer.from(value));
            callback();
          },
        })
      );
      await writeGridFSStream(
        Readable.from([chunk]),
        new Writable({
          write(value, _encoding, callback) {
            actual.push(Buffer.from(value));
            callback();
          },
        }),
        3
      );
      assert.deepEqual(Buffer.concat(actual), Buffer.concat(baseline));
    }
  });
  it('preserves Node refusal of object chunks instead of coercing them into bytes', async () => {
    for (const chunk of [[1, 2, 3], {}]) {
      await assert.rejects(
        writeGridFSStream(
          Readable.from([chunk]),
          new Writable({
            write(_value, _encoding, callback) {
              callback();
            },
          }),
          4
        ),
        error => error instanceof TypeError && 'code' in error && error.code === 'ERR_INVALID_ARG_TYPE'
      );
    }
  });
  for (const failure of ['write', 'final', 'construct'] as const) {
    it(`preserves ${failure} failure and destroys the input`, async () => {
      const marker = new Error(failure);
      const source = Readable.from([Buffer.from('abcdefgh')]);
      const upload = new Writable({
        construct(callback) {
          callback(failure === 'construct' ? marker : undefined);
        },
        write(_chunk, _encoding, callback) {
          callback(failure === 'write' ? marker : undefined);
        },
        final(callback) {
          callback(failure === 'final' ? marker : undefined);
        },
      });
      await assert.rejects(writeGridFSStream(source, upload, 4), error => error === marker);
      assert.equal(source.destroyed, true);
      assert.equal(upload.destroyed, true);
    });
  }
});
