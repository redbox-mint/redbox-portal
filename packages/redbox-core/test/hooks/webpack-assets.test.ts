import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Compiler } from 'webpack';
import { webpack as configuration } from '../../src/config/webpack.config';
const { runWebpack } = require('../../../redbox-dev-tools/bin/wrapper-webpack.js');
const webpack: typeof import('webpack') = createRequire(
  require.resolve('../../../redbox-dev-tools/bin/wrapper-webpack.js')
)('webpack');

describe('production asset ownership', () => {
  it('preserves Angular HTML while minifying shared JavaScript and CSS', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'redbox-webpack-assets-'));
    const html = '<html><body onload="return false"><script>console.log(1 + 2);</script></body></html>';
    try {
      await writeFile(join(directory, 'entry.js'), 'console.log(1 + 2);');
      const config = {
        ...configuration.config[0],
        context: directory,
        entry: './entry.js',
        output: { path: join(directory, 'output'), filename: 'main.js' },
        plugins: [
          {
            apply(compiler: Compiler) {
              compiler.hooks.thisCompilation.tap('AngularFixture', compilation => {
                compilation.hooks.processAssets.tap(
                  {
                    name: 'AngularFixture',
                    stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                  },
                  () => {
                    compilation.emitAsset('angular/form/browser/index.html', new webpack.sources.RawSource(html));
                    compilation.emitAsset('shared.css', new webpack.sources.RawSource('body { color: red; }'));
                  }
                );
              });
            },
          },
        ],
      };
      await runWebpack(webpack, { config: [config] }, { WEBPACK_CSS_MINI: 'true' }, { log() {} });
      assert.equal(await readFile(join(directory, 'output/angular/form/browser/index.html'), 'utf8'), html);
      assert.match(await readFile(join(directory, 'output/main.js'), 'utf8'), /console\.log\(3\)/);
      assert.equal(await readFile(join(directory, 'output/shared.css'), 'utf8'), 'body{color:red}');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
