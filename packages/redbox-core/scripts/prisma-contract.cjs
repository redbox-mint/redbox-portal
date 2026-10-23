// All paths are relative to this package, including when invoked from another cwd.
const { spawnSync } = require('node:child_process');
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
for (const [config, directory] of [
  ['prisma.config.ts', 'generated'],
  ['prisma.storage.config.ts', 'storage-generated'],
]) {
  const committed = join(root, 'src/persistence/prisma', directory);
  const artifacts = ['contract.json', 'contract.d.ts'];
  const mode = process.argv[2];
  if (!['generate', 'check', 'copy'].includes(mode)) {
    throw new Error('Usage: node scripts/prisma-contract.cjs generate|check|copy');
  }

  if (mode === 'copy') {
    const destination = join(root, 'dist/persistence/prisma', directory);
    mkdirSync(destination, { recursive: true });
    for (const name of artifacts) copyFileSync(join(committed, name), join(destination, name));
  } else {
    // Never emit into the committed directory during a check. Missing/stale files
    // must fail CI before a build can regenerate and conceal them.
    // Prisma resolves public type imports from the output ancestry, so keep the
    // temporary output inside this package rather than the system temp directory.
    const temporary = mkdtempSync(join(root, '.prisma-contract-'));
    try {
      const prismaPackage = require.resolve('prisma/package.json');
      const cli = join(dirname(prismaPackage), require(prismaPackage).bin.prisma);
      const result = spawnSync(
        process.execPath,
        [cli, 'contract', 'emit', '--config', config, '--output-path', temporary],
        {
          cwd: root,
          env: { ...process.env, DO_NOT_TRACK: '1' },
          stdio: 'inherit',
        }
      );
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Prisma contract generation failed (${result.status})`);
      if (mode === 'generate') mkdirSync(committed, { recursive: true });
      for (const name of artifacts) {
        const generated = readFileSync(join(temporary, name));
        if (mode === 'generate') {
          copyFileSync(join(temporary, name), join(committed, name));
        } else {
          let existing;
          try {
            existing = readFileSync(join(committed, name));
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          if (!existing || !generated.equals(existing)) {
            throw new Error(
              `Missing or stale ${name}. Run npm --prefix packages/redbox-core run generate:prisma and commit both artifacts.`
            );
          }
        }
      }
      console.log(`Prisma contracts: ${mode} passed`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}
