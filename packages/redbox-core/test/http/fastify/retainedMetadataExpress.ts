import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { mountRecordReadRoutes } from '../../../src/http/express/recordReads';
import type { mountRecordMutationRoutes } from '../../../src/http/express/recordMutations';

/** Immutable, pre-extraction production adapters. Real services and HTTP still
 * run; only the two old dispatchers are retained to detect shared regressions. */
export async function retainedMetadataExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm019-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = 'c28eb67cbd66dab01b93d4128b2db6c9a2a84f7b';
  const hashes: Record<string, string> = {};
  try {
    for (const name of ['recordReads', 'recordMutations']) {
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
    const read: typeof mountRecordReadRoutes = require(path.join(directory, 'recordReads.js')).mountRecordReadRoutes;
    const write: typeof mountRecordMutationRoutes = require(
      path.join(directory, 'recordMutations.js')
    ).mountRecordMutationRoutes;
    return { read, write, hashes, close: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
