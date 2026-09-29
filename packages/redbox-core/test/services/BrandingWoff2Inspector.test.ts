let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { inspectWoff2Buffer, Woff2InspectError } from '../../src/services/BrandingWoff2Inspector';

function fixture(name = 'regular'): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '../../../../test/resources/fonts/test-font-' + name + '.woff2'));
}
async function rejects(bytes: Buffer): Promise<void> {
  let error: unknown;
  try {
    await inspectWoff2Buffer(bytes);
  } catch (caught) {
    error = caught;
  }
  expect(error).to.be.instanceOf(Woff2InspectError);
}
describe('BrandingWoff2Inspector genuine decoding', function () {
  for (const name of ['regular', 'bold', 'italic', 'variable']) {
    it(`decodes real licensed ${name} bytes`, async function () {
      const result = await inspectWoff2Buffer(fixture(name));
      expect(result.isVariable).to.equal(name === 'variable');
      expect(result.tableTags).to.include('head');
    });
  }
  it('rejects the zero-payload header that previously passed', async function () {
    const bytes = Buffer.alloc(50);
    bytes.writeUInt32BE(0x774f4632, 0);
    bytes.writeUInt32BE(0x10000, 4);
    bytes.writeUInt32BE(50, 8);
    bytes.writeUInt16BE(1, 12);
    bytes[48] = 1;
    bytes[49] = 54;
    await rejects(bytes);
  });
  it('rejects filler data with an otherwise real header and directory', async function () {
    const bytes = fixture();
    bytes.fill(0xa5, bytes.length - 1000);
    await rejects(bytes);
  });
  it('rejects truncated input and crafted headers without crashing', async function () {
    const full = fixture();
    for (const size of [0, 10, 47, 48, full.length - 1]) await rejects(full.subarray(0, size));
    for (let i = 0; i < 50; i++) await rejects(Buffer.alloc(64, i));
  });
  it('rejects collections and unsupported flavors', async function () {
    for (const flavor of [0x74746366, 0x12345678]) {
      const bytes = fixture();
      bytes.writeUInt32BE(flavor, 4);
      await rejects(bytes);
    }
  });
  it('retains bounded advisory metadata handling on a genuine font', async function () {
    const bytes = fixture();
    const xml = '<name '.repeat(174762);
    const compressed = zlib.brotliCompressSync(Buffer.from(xml));
    const offset = Math.ceil(bytes.length / 4) * 4;
    const font = Buffer.concat([bytes, Buffer.alloc(offset - bytes.length), compressed]);
    font.writeUInt32BE(font.length, 8);
    font.writeUInt32BE(offset, 28);
    font.writeUInt32BE(compressed.length, 32);
    font.writeUInt32BE(Buffer.byteLength(xml), 36);
    expect((await inspectWoff2Buffer(font)).inspection).to.deep.equal((await inspectWoff2Buffer(bytes)).inspection);
    font.writeUInt32BE(1024, 36);
    expect((await inspectWoff2Buffer(font)).inspection).to.deep.equal((await inspectWoff2Buffer(bytes)).inspection);
  });
  it('rejects invalid directory transforms and absurd expanded table sizes within deadline', async function () {
    const transform = fixture();
    transform[48] |= 0x80;
    await rejects(transform);
    const huge = fixture();
    huge.writeUInt32BE(0xffffffff, 16);
    // A header size is advisory; changing it must never allocate that amount.
    const started = Date.now();
    try {
      await inspectWoff2Buffer(huge);
    } catch (error) {
      expect(error).to.be.instanceOf(Woff2InspectError);
    }
    expect(Date.now() - started).to.be.lessThan(2500);
  });
  it('keeps the event loop responsive while decoding', async function () {
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    await inspectWoff2Buffer(fixture('variable'));
    clearTimeout(timer);
    expect(ticked).to.equal(true);
  });
});
