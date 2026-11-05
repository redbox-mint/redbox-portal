import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const packagePath = path.resolve(__dirname, '../../..');
function compile(config: string) {
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', config], {
    cwd: packagePath,
    timeout: 120_000,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  return result;
}

describe('public controller author type contract', function () {
  this.timeout(180_000);
  it('compiles different concrete inputs, inherited/native Fastify actions and checked misuse', () => {
    const result = compile('test/tsconfig.controllers.json');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
  it('fails compilation for every misuse when expected-error annotations are removed', () => {
    const fixture = path.join(__dirname, 'fixtures/controllers.types.ts');
    const source = readFileSync(fixture, 'utf8');
    const annotations = /^\s*\/\/ @ts-expect-error[^\n]*\n/gm;
    const expectedErrors = [...source.matchAll(annotations)].length;
    assert(expectedErrors > 0);
    const temporary = mkdtempSync(path.join(__dirname, 'fixtures/.misuse-'));
    try {
      writeFileSync(path.join(temporary, 'controllers.types.ts'), source.replace(annotations, ''));
      writeFileSync(
        path.join(temporary, 'tsconfig.json'),
        JSON.stringify({
          extends: path.join(packagePath, 'test/tsconfig.controllers.json'),
          include: ['controllers.types.ts'],
        })
      );
      const result = compile(path.join(temporary, 'tsconfig.json'));
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.equal((result.stdout.match(/error TS\d+:/g) ?? []).length, expectedErrors, result.stdout + result.stderr);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
