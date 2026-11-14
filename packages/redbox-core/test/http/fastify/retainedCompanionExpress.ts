import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

/** Immutable preceding Companion implementation inside the actual Express portal. */
export async function retainedCompanionExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm021-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = '5cc027e11d95994e1dc9d549427a883d65b3269d';
  const files = [
    'http/express/companion.ts',
    'http/integrations/companion/uploads.ts',
    'http/integrations/companion/actions.ts',
  ];
  const hashes: Record<string, string> = {};
  try {
    for (const file of files) {
      const relative = 'packages/redbox-core/src/' + file;
      const source = execFileSync('git', ['show', revision + ':' + relative], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      hashes[file] = createHash('sha256').update(source).digest('hex');
      const relocated = source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_match, quote, specifier) => {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier + '.ts'));
        return (
          quote +
          (files.includes(target)
            ? path.join(directory, path.basename(target, '.ts') + '.cjs')
            : path.resolve(root, path.dirname(relative), specifier)) +
          quote
        );
      });
      const localRequire = createRequire(path.join(root, relative));
      const output = ts
        .transpileModule(relocated, {
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        })
        .outputText.replace(
          /require\((['"])([^'"]+)\1\)/g,
          (_match, quote, specifier) =>
            'require(' +
            quote +
            (specifier.startsWith(directory) ? specifier : localRequire.resolve(specifier)) +
            quote +
            ')'
        );
      await writeFile(path.join(directory, path.basename(file, '.ts') + '.cjs'), output);
    }
    return {
      ...require(path.join(directory, 'companion.cjs')),
      revision,
      sha256: hashes['http/express/companion.ts'],
      hashes,
      close: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
