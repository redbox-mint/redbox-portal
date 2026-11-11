import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import * as recordTypes from '../../../src/http/express/recordTypes';
import * as metadata from '../../../src/http/express/metadata';
import * as configuration from '../../../src/http/express/configuration';
import * as formDelivery from '../../../src/http/express/formDelivery';

/** Immutable pre-extraction production adapters, installed only while the preceding
 * production PortalHttp prepares its own registrations. No test dispatch table. */
export async function retainedReferenceExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm023-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = 'c2ad51d5c260d408639e3151380542b60a138a1c';
  const hashes: Record<string, string> = {};
  try {
    for (const name of ['recordTypes', 'metadata', 'configuration', 'formDelivery']) {
      const relative = 'packages/redbox-core/src/http/express/' + name + '.ts';
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
            .stub(recordTypes, 'mountRecordTypeRoutes')
            .callsFake(require(path.join(directory, 'recordTypes.js')).mountRecordTypeRoutes),
          sinon
            .stub(metadata, 'mountMetadataReadRoutes')
            .callsFake(require(path.join(directory, 'metadata.js')).mountMetadataReadRoutes),
          sinon
            .stub(configuration, 'mountConfigurationReadRoutes')
            .callsFake(require(path.join(directory, 'configuration.js')).mountConfigurationReadRoutes),
          sinon
            .stub(formDelivery, 'mountFormDeliveryRoutes')
            .callsFake(require(path.join(directory, 'formDelivery.js')).mountFormDeliveryRoutes),
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
