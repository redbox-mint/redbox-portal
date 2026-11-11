import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { mountDatastreamWriteRoutes } from '../../../src/http/express/datastreamWrites';
import type { ProgressSockets } from '../../../src/http/express/progressSockets';
import type { mountProgressOperationRoutes } from '../../../src/http/express/progressOperations';

/** Immutable, FM-019 production adapters. Real services and HTTP still
 * run; only the old upload/grant dispatchers and socket owner are retained to detect shared regressions. */
export async function retainedRawExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm020-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = '7c15c19c395251b1136d3e6f2691ef6dd88a8b87';
  const hashes: Record<string, string> = {};
  try {
    for (const name of ['datastreamWrites', 'progressSockets', 'progressOperations']) {
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
    const uploads: typeof mountDatastreamWriteRoutes = require(
      path.join(directory, 'datastreamWrites.js')
    ).mountDatastreamWriteRoutes;
    const Sockets: typeof ProgressSockets = require(path.join(directory, 'progressSockets.js')).ProgressSockets;
    const grants: typeof mountProgressOperationRoutes = require(
      path.join(directory, 'progressOperations.js')
    ).mountProgressOperationRoutes;
    return { uploads, Sockets, grants, hashes, close: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
