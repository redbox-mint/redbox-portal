import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import * as recordReads from '../../../src/http/express/recordReads';
import * as queryReads from '../../../src/http/express/queryReads';
import * as recordSchemaReads from '../../../src/http/express/recordSchemaReads';

/** Immutable pre-extraction production adapters, installed only while the preceding
 * production PortalHttp prepares its own registrations. No test dispatch table. */
export async function retainedReadExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm024-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = 'e0a41f5d9';
  const hashes: Record<string, string> = {};
  try {
    for (const name of ['recordReads', 'queryReads', 'recordSchemaReads', 'NamedQueries']) {
      const relative =
        'packages/redbox-core/src/' + (name === 'NamedQueries' ? 'queries/' : 'http/express/') + name + '.ts';
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
      parameterSubstitution: require(path.join(directory, 'NamedQueries.js')).Services.NamedQueryService.prototype
        .setParamsInQuery,
      close: () => rm(directory, { recursive: true, force: true }),
      install: () => {
        const stubs = [
          sinon
            .stub(recordReads, 'mountRecordReadRoutes')
            .callsFake(require(path.join(directory, 'recordReads.js')).mountRecordReadRoutes),
          sinon
            .stub(queryReads, 'mountQueryReadRoutes')
            .callsFake(require(path.join(directory, 'queryReads.js')).mountQueryReadRoutes),
          sinon
            .stub(recordSchemaReads, 'mountRecordSchemaReadRoutes')
            .callsFake(require(path.join(directory, 'recordSchemaReads.js')).mountRecordSchemaReadRoutes),
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
