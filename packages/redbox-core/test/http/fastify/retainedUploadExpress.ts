import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sinon from 'sinon';
import * as branding from '../../../src/http/express/brandingUploads';
import * as datastream from '../../../src/http/express/datastreamWrites';
import * as tus from '../../../src/http/express/resumableUploads';
export const uploadBaseline = '6f5b125758fb068976aa1ad13529ed6c681604cd';
/** Immutable preceding adapters, installed only during production preparation. */
export async function retainedUploadExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm034-retained-'));
  try {
    const root = path.resolve(__dirname, '../../../../..');
    const modules: Record<string, object> = {},
      hashes: Record<string, string> = {};
    for (const name of ['brandingUploads', 'datastreamWrites', 'resumableUploads']) {
      const relative = 'packages/redbox-core/src/http/express/' + name + '.ts';
      const source = execFileSync('git', ['show', uploadBaseline + ':' + relative], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      hashes[name] = createHash('sha256').update(source).digest('hex');
      const loader = createRequire(path.join(root, relative));
      const relocated = source.replace(
        /(['"])(\.\.?\/[^'"]+)\1/g,
        (_m, quote, specifier: string) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
      );
      const compiled = ts
        .transpileModule(relocated, {
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        })
        .outputText.replace(
          /require\((['"])([^'"]+)\1\)/g,
          (_m, quote, specifier: string) => 'require(' + quote + loader.resolve(specifier) + quote + ')'
        );
      const file = path.join(directory, name + '.cjs');
      await writeFile(file, compiled);
      modules[name] = require(file);
    }
    return {
      hashes,
      install() {
        const oldBrand = modules.brandingUploads as typeof branding,
          oldData = modules.datastreamWrites as typeof datastream,
          oldTus = modules.resumableUploads as typeof tus;
        const stubs = [
          sinon.stub(branding, 'mountBrandingUploadRoutes').callsFake(oldBrand.mountBrandingUploadRoutes),
          sinon.stub(datastream, 'mountDatastreamWriteRoutes').callsFake(oldData.mountDatastreamWriteRoutes),
          sinon.stub(tus, 'mountResumableUploadRoutes').callsFake(oldTus.mountResumableUploadRoutes),
          sinon.stub(tus, 'ResumableUploads').callsFake(input => new oldTus.ResumableUploads(input)),
        ];
        return () => {
          try {
            for (const stub of stubs) assert.equal(stub.callCount, 1, 'One retained production acquisition/mount');
          } finally {
            for (const stub of stubs) stub.restore();
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
