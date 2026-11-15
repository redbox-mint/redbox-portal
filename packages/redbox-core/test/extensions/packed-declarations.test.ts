import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { packageDeclarations } = require('../../scripts/package-declarations.cjs');

describe('FM-039 packed public declarations', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'fm039-declarations-'));
    mkdirSync(path.join(directory, 'dist'));
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'fm039-types',
        exports: { '.': { types: './types/index.d.ts', default: './dist/index.js' } },
      })
    );
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const put = (name: string, source: string) => writeFileSync(path.join(directory, 'dist', name), source);

  it('follows namespace, star, type-only and import-type declaration edges', () => {
    put(
      'index.d.ts',
      `export * as Names from './namespace'; export type * from './types';
      export declare function result(): import('./result').Result;`
    );
    put('namespace.d.ts', "export * from './nested';");
    put('nested.d.ts', 'export interface Nested { value: string }');
    put('types.d.ts', 'export type Value = number;');
    put('result.d.ts', 'export interface Result { success: boolean }');
    assert.equal(packageDeclarations(directory), 5);
    for (const name of ['index', 'namespace', 'nested', 'types', 'result'])
      assert(existsSync(path.join(directory, 'types', name + '.d.ts')));
  });
  it('omits explicit pre-cutover declarations and their unused imports while retaining native types', () => {
    put(
      'index.d.ts',
      `import type { Request } from 'express';
      import type { Native } from './native';
      /** Retained executable only. @preCutover */
      export declare function legacy(request: Request): void;
      export declare function current(input: Native): Native;`
    );
    put('native.d.ts', 'export interface Native { value: string }');
    put('private.d.ts', "export type Request = import('express').Request;");
    put('index.js', 'exports.legacy = () => {};');
    assert.equal(packageDeclarations(directory), 2);
    const published = readFileSync(path.join(directory, 'types/index.d.ts'), 'utf8');
    assert(!published.includes('express'));
    assert(!published.includes('legacy'));
    assert(published.includes('current(input: Native): Native'));
    assert(!existsSync(path.join(directory, 'types/private.d.ts')));
    assert.equal(readFileSync(path.join(directory, 'dist/index.js'), 'utf8'), 'exports.legacy = () => {};');
  });
  it('rejects a reachable stale Express declaration', () => {
    put('index.d.ts', "export * as Hidden from './hidden';");
    put('hidden.d.ts', "export type Bad = import('express').Request;");
    assert.throws(() => packageDeclarations(directory), /Express declaration/);
  });
  it('rejects a missing declaration instead of accepting a JavaScript-only resolution', () => {
    put('index.d.ts', "export * as Missing from './missing';");
    put('missing.js', 'exports.value = true;');
    assert.throws(() => packageDeclarations(directory), /Unresolved declaration/);
  });
  it('rejects relative references outside the package declaration tree', () => {
    put('index.d.ts', "export * from '../outside';");
    writeFileSync(path.join(directory, 'outside.d.ts'), 'export interface Outside {}');
    assert.throws(() => packageDeclarations(directory), /Declaration escaped package/);
  });
});
