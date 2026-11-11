import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

/** Immutable FM-020 Companion implementation inside the actual Express portal. */
export async function retainedCompanionExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm021-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const relative = 'packages/redbox-core/src/http/express/companion.ts';
  const revision = '5ba59694e42f6c85b8f6bd892cd8175b1c90d08e';
  try {
    const source = execFileSync('git', ['show', revision + ':' + relative], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    const relocated = source.replace(
      /(['"])(\.\.?\/[^'"]+)\1/g,
      (_match, quote, specifier) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
    );
    const localRequire = createRequire(path.join(root, relative));
    const output = ts
      .transpileModule(relocated, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      })
      .outputText.replace(
        /require\((['"])([^'"]+)\1\)/g,
        (_match, quote, specifier) => 'require(' + quote + localRequire.resolve(specifier) + quote + ')'
      );
    await writeFile(path.join(directory, 'companion.cjs'), output);
    return {
      ...require(path.join(directory, 'companion.cjs')),
      revision,
      sha256: createHash('sha256').update(source).digest('hex'),
      close: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
