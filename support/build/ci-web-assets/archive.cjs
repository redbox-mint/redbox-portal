// A deliberately narrow portable ustar/gzip format: regular files only. No tar
// subprocess, extraction flags, links, devices, PAX overrides or ownership.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip, createInflateRaw, crc32 } = require('node:zlib');
const { createHash } = require('node:crypto');
const { check } = require('./identity.cjs');

const MAX_BYTES = 4 * 1024 ** 3;
const MAX_FILE = 1024 ** 3;
const MAX_FILES = 100000;
function safeName(name) {
  check(typeof name === 'string' && !/[\\\x00-\x1f\x7f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..') &&
    (name.startsWith('assets/') || name.startsWith('.tmp/public/') ||
      ['.redbox-ci/integration-assets.json', '.redbox-ci/integration-image.json'].includes(name)),
  `Unsafe archive path: ${name}`);
  return name;
}
function header(name, size) {
  safeName(name);
  const result = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf('/');
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
  }
  check(Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155, 'Path too long for ustar');
  const put = (value, offset, length) => result.write(value, offset, length, 'utf8');
  const octal = (value, length) => `${value.toString(8).padStart(length - 1, '0')}\0`;
  put(name, 0, 100); put(octal(0o644, 8), 100, 8);
  put(octal(0, 8), 108, 8); put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12); put(octal(0, 12), 136, 12);
  result.fill(32, 148, 156); result[156] = 48;
  put('ustar\0', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
  const sum = result.reduce((a, b) => a + b, 0);
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return result;
}
async function pack(root, files, filename) {
  check(files.length <= MAX_FILES && files.every(file => Number.isSafeInteger(file.size) &&
    file.size >= 0 && file.size <= MAX_FILE) &&
    files.reduce((total, file) => total + 512 + Math.ceil(file.size / 512) * 512, 1024) <= MAX_BYTES,
  'Asset inventory exceeds archive limits');
  async function* blocks() {
    for (const file of files) {
      const absolute = path.join(root, safeName(file.path));
      check(fs.lstatSync(absolute).isFile(), `Archive input is not regular: ${file.path}`);
      yield header(file.path, file.size);
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of fs.createReadStream(absolute)) {
        size += chunk.length; hash.update(chunk); yield chunk;
      }
      check(size === file.size && hash.digest('hex') === file.sha256, `Archive input changed: ${file.path}`);
      const padding = (512 - size % 512) % 512;
      if (padding) yield Buffer.alloc(padding);
    }
    yield Buffer.alloc(1024);
  }
  await pipeline(Readable.from(blocks()), createGzip({ level: 6 }), fs.createWriteStream(filename, { flags: 'wx', mode: 0o644 }));
}
async function fileHash(filename) {
  check(fs.lstatSync(filename).isFile(), 'Artifact must be a regular file');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function* gzipPayload(filename) {
  // The producer emits a ten-byte gzip header without optional fields, exactly
  // one deflate stream and an eight-byte trailer. Gunzip alone accepts multiple
  // members and some trailing garbage, so check the compressed boundary too.
  const descriptor = fs.openSync(filename, 'r');
  let size;
  const header = Buffer.alloc(10);
  const trailer = Buffer.alloc(8);
  try {
    size = fs.fstatSync(descriptor).size;
    check(size >= 20, 'Truncated gzip framing');
    fs.readSync(descriptor, header, 0, 10, 0);
    fs.readSync(descriptor, trailer, 0, 8, size - 8);
    check(header.subarray(0, 4).equals(Buffer.from([0x1f, 0x8b, 8, 0])), 'Unsupported gzip header');
  } finally { fs.closeSync(descriptor); }
  const input = fs.createReadStream(filename, { start: 10, end: size - 9 });
  const inflate = createInflateRaw();
  input.on('error', error => inflate.destroy(error));
  input.pipe(inflate);
  let checksum = 0;
  let length = 0;
  try {
    for await (const chunk of inflate) {
      checksum = crc32(chunk, checksum);
      length += chunk.length;
      check(length <= MAX_BYTES, 'Archive exceeds extraction size limit');
      yield chunk;
    }
    check(inflate.bytesWritten === size - 18, 'Invalid gzip framing: trailing data or multiple members');
    check(checksum === trailer.readUInt32LE(0) && (length >>> 0) === trailer.readUInt32LE(4),
      'Gzip checksum/size mismatch');
  } finally { input.destroy(); inflate.destroy(); }
}

async function unpack(filename, destination) {
  check(fs.lstatSync(destination).isDirectory() && fs.readdirSync(destination).length === 0,
    'Extraction requires a private empty directory');
  const iterator = gzipPayload(filename)[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  let done = false;
  let consumed = 0;
  async function read(size) {
    while (pending.length < size && !done) {
      const next = await iterator.next();
      done = next.done;
      if (!done) pending = Buffer.concat([pending, next.value]);
    }
    check(pending.length >= size, 'Truncated asset archive');
    const result = pending.subarray(0, size);
    pending = pending.subarray(size);
    consumed += size;
    check(consumed <= MAX_BYTES, 'Archive exceeds extraction size limit');
    return result;
  }
  function field(block, offset, length) {
    const bytes = block.subarray(offset, offset + length);
    const end = bytes.indexOf(0);
    if (end !== -1) check(bytes.subarray(end).every(byte => byte === 0), 'Invalid ustar string padding');
    const value = bytes.subarray(0, end === -1 ? length : end).toString('utf8');
    check(Buffer.from(value).equals(bytes.subarray(0, end === -1 ? length : end)), 'Invalid UTF-8 path');
    return value;
  }
  const seen = new Set();
  const directories = new Set();
  try {
    while (true) {
      const block = await read(512);
      if (block.every(byte => byte === 0)) {
        check((await read(512)).every(byte => byte === 0), 'Invalid archive trailer');
        // Only zero tar block padding may follow the trailer inside the member.
        while (!done || pending.length) {
          if (!pending.length) {
            const next = await iterator.next(); done = next.done;
            if (done) break;
            pending = next.value;
          }
          check((await read(Math.min(pending.length, 65536))).every(byte => byte === 0), 'Data after archive trailer');
        }
        break;
      }
      const checksum = block.subarray(148, 156).toString('ascii');
      check(/^[0-7]{6}\0 $/.test(checksum), 'Invalid ustar checksum field');
      const sum = block.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
      check(sum === parseInt(checksum, 8), 'Archive header checksum mismatch');
      check(block.subarray(257, 265).equals(Buffer.from('ustar\0' + '00')), 'Only plain ustar archives are supported');
      check(block[156] === 48 && field(block, 157, 100) === '', 'Only regular files allowed (no symlink/hardlink/extensions)');
      const prefix = field(block, 345, 155);
      const name = safeName(`${prefix ? `${prefix}/` : ''}${field(block, 0, 100)}`);
      check(!seen.has(name), `Duplicate archive entry: ${name}`);
      seen.add(name);
      check(seen.size <= MAX_FILES, 'Too many archive entries');
      const sizeField = block.subarray(124, 136).toString('ascii');
      check(/^[0-7]{11}\0$/.test(sizeField), 'Invalid archive file size');
      const size = parseInt(sizeField, 8);
      check(size <= MAX_FILE, 'Archive file exceeds size limit');
      const absolute = path.join(destination, name);
      // mkdir/open modes are filtered by umask. Explicitly restore portable
      // payload permissions while leaving the private staging root untouched.
      let directory = destination;
      for (const component of name.split('/').slice(0, -1)) {
        directory = path.join(directory, component);
        if (!directories.has(directory)) {
          fs.mkdirSync(directory);
          fs.chmodSync(directory, 0o755);
          directories.add(directory);
        }
      }
      const descriptor = fs.openSync(absolute, 'wx', 0o644);
      try {
        fs.fchmodSync(descriptor, 0o644);
        let remaining = size;
        while (remaining) {
          const bytes = await read(Math.min(remaining, 65536));
          let written = 0;
          while (written < bytes.length) written += fs.writeSync(descriptor, bytes, written);
          remaining -= bytes.length;
        }
      } finally { fs.closeSync(descriptor); }
      const padding = (512 - size % 512) % 512;
      check((await read(padding)).every(byte => byte === 0), 'Nonzero archive padding');
    }
  } finally { await iterator.return(); }
}

module.exports = { pack, unpack, fileHash, header, safeName };
