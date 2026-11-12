import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import * as identityAdministration from '../../../src/http/express/identityAdministration';
import * as identityLinks from '../../../src/http/express/identityLinks';
import * as adminOperations from '../../../src/http/express/adminOperations';
import * as siemWrites from '../../../src/http/express/siemWrites';

/** Immutable pre-extraction production adapters, installed only while the preceding
 * production PortalHttp prepares its own registrations. No test dispatch table. */
export async function retainedIdentityExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm025-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = '81f43a869';
  const hashes: Record<string, string> = {};
  try {
    for (const name of ['identityAdministration', 'identityLinks', 'adminOperations', 'siemWrites']) {
      const relative = 'packages/redbox-core/src/' + 'http/express/' + name + '.ts';
      const source = execFileSync('git', ['show', revision + ':' + relative], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      hashes[name] = createHash('sha256').update(source).digest('hex');
      const relocated = source.replace(
        /(['"])(\.\.?\/[^'"]+)\1/g,
        (_match, quote, specifier) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
      );
      const sourceRequire = createRequire(path.join(root, relative));
      const output = ts
        .transpileModule(relocated, {
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        })
        .outputText.replace(
          /require\((['"])([^'"]+)\1\)/g,
          (_match, quote, specifier) => 'require(' + quote + sourceRequire.resolve(specifier) + quote + ')'
        );
      await writeFile(path.join(directory, name + '.js'), output);
    }
    return {
      hashes,
      close: () => rm(directory, { recursive: true, force: true }),
      install: () => {
        const stubs = [
          sinon
            .stub(siemWrites, 'mountSiemWriteRoutes')
            .callsFake(require(path.join(directory, 'siemWrites.js')).mountSiemWriteRoutes),
          sinon
            .stub(identityAdministration, 'mountIdentityAdministrationRoutes')
            .callsFake(require(path.join(directory, 'identityAdministration.js')).mountIdentityAdministrationRoutes),
          sinon
            .stub(identityLinks, 'mountIdentityLinkRoutes')
            .callsFake(require(path.join(directory, 'identityLinks.js')).mountIdentityLinkRoutes),
          sinon
            .stub(adminOperations, 'mountAdminOperationRoutes')
            .callsFake(require(path.join(directory, 'adminOperations.js')).mountAdminOperationRoutes),
        ];
        return () => {
          try {
            for (const stub of stubs)
              assert.equal(stub.callCount, 1, 'Retained production mount must run exactly once');
          } finally {
            stubs.forEach(stub => stub.restore());
          }
        };
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
