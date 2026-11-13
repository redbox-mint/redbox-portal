import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import sinon from 'sinon';
import * as assets from '../../../src/http/express/pageAssets';

export const assetBaseline = '5f8eeaf566be71faf96b122a1cb763945ea38fb8';
/** Complete retained production adapters and their original branding operation. */
export async function retainedAssetExpress() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm031-retained-'));
  try {
    const root = path.resolve(__dirname, '../../../../..');
    const hashes: Record<string, string> = {};
    for (const name of ['brandingDelivery', 'pageAssets']) {
      const relative = `packages/redbox-core/src/http/express/${name}.ts`;
      const source = execFileSync('git', ['show', `${assetBaseline}:${relative}`], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      hashes[name] = createHash('sha256').update(source).digest('hex');
      const originalRequire = createRequire(path.join(root, relative));
      const relocated = source.replace(
        /(['"])(\.\.?\/[^'"]+)\1/g,
        (_match, quote, specifier: string) =>
          quote +
          (specifier === './brandingDelivery'
            ? path.join(directory, 'brandingDelivery.cjs')
            : path.resolve(root, path.dirname(relative), specifier)) +
          quote
      );
      const output = ts
        .transpileModule(relocated, {
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        })
        .outputText.replace(
          /require\((['"])([^'"]+)\1\)/g,
          (_match, quote, specifier: string) => 'require(' + quote + originalRequire.resolve(specifier) + quote + ')'
        );
      await writeFile(path.join(directory, name + '.cjs'), output);
    }
    const retained = require(path.join(directory, 'pageAssets.cjs')) as typeof assets;
    return {
      hashes,
      close: () => rm(directory, { recursive: true, force: true }),
      install() {
        const stubs = [
          sinon.stub(assets, 'mountBrandingDeliveryRoutes').callsFake(retained.mountBrandingDeliveryRoutes),
          sinon.stub(assets, 'mountDynamicPageAssets').callsFake(retained.mountDynamicPageAssets),
          sinon.stub(assets, 'mountStaticPageArtifacts').callsFake(retained.mountStaticPageArtifacts),
        ];
        return () => stubs.forEach(stub => stub.restore());
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
