import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sinon from 'sinon';
import type { RequestHandler, Router } from 'express';
import * as progress from '../../../src/http/express/progressOperations';
import * as sockets from '../../../src/http/express/progressSockets';
export const progressBaseline = '5cc027e11d95994e1dc9d549427a883d65b3269d';
/** Immutable preceding adapters, installed only during production preparation. */
export async function retainedProgressExpress(beforeAction?: RequestHandler) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm035-retained-'));
  try {
    const root = path.resolve(__dirname, '../../../../..');
    const modules: Record<string, object> = {},
      hashes: Record<string, string> = {};
    for (const name of ['progressOperations', 'progressSockets']) {
      const relative = 'packages/redbox-core/src/http/express/' + name + '.ts';
      const source = execFileSync('git', ['show', progressBaseline + ':' + relative], {
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
        const oldProgress = modules.progressOperations as typeof progress,
          oldSockets = modules.progressSockets as typeof sockets;
        const stubs = [
          sinon.stub(progress, 'mountProgressOperationRoutes').callsFake((router, input) => {
            const boundary = beforeAction
              ? (new Proxy(router, {
                  get(target, key, receiver) {
                    const value = Reflect.get(target, key, receiver);
                    if (!['get', 'post', 'put', 'delete'].includes(String(key))) return value;
                    return (...args: unknown[]) => {
                      args.splice(args.length - 1, 0, beforeAction);
                      return Reflect.apply(value, target, args);
                    };
                  },
                }) as Router)
              : router;
            oldProgress.mountProgressOperationRoutes(boundary, input);
          }),
          sinon.stub(sockets, 'ProgressSockets').callsFake(input => new oldSockets.ProgressSockets(input)),
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
