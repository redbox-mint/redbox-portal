import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import sinon from 'sinon';
import * as pages from '../../../src/http/express/pages';

/** Retain the complete pre-FM029 production mounts, not a fixture dispatcher. */
export async function retainedPageExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm029-retained-'));
  try {
    const root = path.resolve(__dirname, '../../../../..');
    const relative = 'packages/redbox-core/src/http/express/pages.ts';
    const source = execFileSync('git', ['show', 'd2dc30b1ee21f540784f3344664ce5becf1df219:' + relative], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    const sourceRequire = createRequire(path.join(root, relative));
    const relocated = source.replace(
      /(['"])(\.\.?\/[^'"]+)\1/g,
      (_match, quote, specifier) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
    );
    const output = ts
      .transpileModule(relocated, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      })
      .outputText.replace(
        /require\((['"])([^'"]+)\1\)/g,
        (_match, quote, specifier) => 'require(' + quote + sourceRequire.resolve(specifier) + quote + ')'
      );
    const file = path.join(directory, 'pages.cjs');
    await writeFile(file, output);
    const retained = require(file) as typeof pages;
    return {
      hash: createHash('sha256').update(source).digest('hex'),
      close: () => rm(directory, { recursive: true, force: true }),
      install() {
        const stubs = [
          sinon.stub(pages, 'mountPageRoutes').callsFake(retained.mountPageRoutes),
          sinon.stub(pages, 'mountPageNotFound').callsFake(retained.mountPageNotFound),
          sinon.stub(pages, 'preparePage').callsFake(retained.preparePage),
          sinon.stub(pages, 'sendPageAuthenticationFailure').callsFake(retained.sendPageAuthenticationFailure),
        ];
        return () => stubs.forEach(stub => stub.restore());
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
