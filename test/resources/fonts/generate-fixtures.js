#!/usr/bin/env node
/**
 * Generates deterministic minimal WOFF2 fixtures for branding typeface tests.
 *
 * The files are synthesized locally (valid container structure only, no
 * outlines or third-party bytes), so there is no licence encumbrance.
 * Regenerate with: node test/resources/fonts/generate-fixtures.js
 */
const fs = require('node:fs');
const path = require('node:path');

function encodeBase128(value) {
  if (value === 0) return [0];
  const groups = [];
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

function buildWoff2({ tables, compressedSize, seed }) {
  const dirBytes = [];
  for (const table of tables) {
    const transform = table.transformVersion ?? 0;
    dirBytes.push(((transform << 6) & 0xc0) | (table.tagIndex & 0x3f));
    for (const b of encodeBase128(table.origLength ?? 64)) dirBytes.push(b);
  }
  const fontData = Buffer.alloc(compressedSize, seed);
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

const STATIC_TABLES = [
  { tagIndex: 1, origLength: 54 },
  { tagIndex: 5, origLength: 128 },
  { tagIndex: 10, transformVersion: 3, origLength: 256 },
  { tagIndex: 11, transformVersion: 3, origLength: 32 },
];

const VARIABLE_TABLES = [...STATIC_TABLES, { tagIndex: 47, origLength: 64 }];

const fixtures = [
  ['test-font-regular.woff2', { tables: STATIC_TABLES, compressedSize: 64, seed: 0xa5 }],
  ['test-font-bold.woff2', { tables: STATIC_TABLES, compressedSize: 65, seed: 0x5a }],
  ['test-font-italic.woff2', { tables: STATIC_TABLES, compressedSize: 66, seed: 0x3c }],
  ['test-font-variable.woff2', { tables: VARIABLE_TABLES, compressedSize: 64, seed: 0xa5 }],
  ['test-font-truncated.woff2', null],
];

const dir = __dirname;
const regular = buildWoff2(fixtures[0][1]);
fs.writeFileSync(path.join(dir, fixtures[0][0]), regular);
for (const [name, spec] of fixtures.slice(1, 4)) {
  fs.writeFileSync(path.join(dir, name), buildWoff2(spec));
}
fs.writeFileSync(path.join(dir, fixtures[4][0]), regular.subarray(0, 20));
console.log(`Wrote ${fixtures.length} fixtures to ${dir}`);
