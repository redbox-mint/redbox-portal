import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sinon from 'sinon';
import * as reads from '../../../src/http/express/datastreamReads';

export const datastreamBaseline = '45ae57c16dcb00c36357bd0dd00f330d4f4ad0d4';
/** Install the actual immutable preceding adapter during production preparation. */
export async function retainedDatastreamExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm033-retained-'));
  try {
    const root = path.resolve(__dirname, '../../../../..');
    const relative = 'packages/redbox-core/src/http/express/datastreamReads.ts';
    const source = execFileSync('git', ['show', datastreamBaseline + ':' + relative], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    const hash = createHash('sha256').update(source).digest('hex');
    const loader = createRequire(path.join(root, relative));
    const relocated = source.replace(
      /(['"])(\.\.?\/[^'"]+)\1/g,
      (_match, quote, specifier: string) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
    );
    const compiled = ts
      .transpileModule(relocated, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      })
      .outputText.replace(
        /require\((['"])([^'"]+)\1\)/g,
        (_match, quote, specifier: string) => 'require(' + quote + loader.resolve(specifier) + quote + ')'
      );
    const file = path.join(directory, 'datastreamReads.cjs');
    await writeFile(file, compiled);
    const retained = require(file) as typeof reads;
    return {
      hash,
      install: () => {
        const stub = sinon.stub(reads, 'mountDatastreamReadRoutes').callsFake(retained.mountDatastreamReadRoutes);
        return () => {
          try {
            assert.equal(stub.callCount, 1, 'One retained production mount');
          } finally {
            stub.restore();
          }
        };
      },
      close: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
