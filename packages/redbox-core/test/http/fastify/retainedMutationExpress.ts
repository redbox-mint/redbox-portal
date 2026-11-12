import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import * as recordMutations from '../../../src/http/express/recordMutations';
import * as configurationWrites from '../../../src/http/express/configurationWrites';
import * as queryWrites from '../../../src/http/express/queryWrites';
import * as harvestMutations from '../../../src/http/express/harvestMutations';
import * as configuredActions from '../../../src/http/express/configuredActions';

/** Immutable pre-extraction production adapters, installed only while the preceding
 * production PortalHttp prepares its own registrations. No test dispatch table. */
export async function retainedMutationExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm026-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = '368565a99';
  const hashes: Record<string, string> = {};
  try {
    for (const name of [
      'recordMutations',
      'configurationWrites',
      'queryWrites',
      'harvestMutations',
      'configuredActions',
    ]) {
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
            .stub(recordMutations, 'mountRecordMutationRoutes')
            .callsFake(require(path.join(directory, 'recordMutations.js')).mountRecordMutationRoutes),
          sinon
            .stub(configurationWrites, 'mountConfigurationWriteRoutes')
            .callsFake(require(path.join(directory, 'configurationWrites.js')).mountConfigurationWriteRoutes),
          sinon
            .stub(queryWrites, 'mountQueryWriteRoutes')
            .callsFake(require(path.join(directory, 'queryWrites.js')).mountQueryWriteRoutes),
          sinon
            .stub(harvestMutations, 'mountHarvestMutationRoutes')
            .callsFake(require(path.join(directory, 'harvestMutations.js')).mountHarvestMutationRoutes),
          sinon
            .stub(configuredActions, 'mountConfiguredActionRoutes')
            .callsFake(require(path.join(directory, 'configuredActions.js')).mountConfiguredActionRoutes),
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
