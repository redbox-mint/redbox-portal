import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'sails-ng-common-browser-'));
const options = {
  absWorkingDir: packageDirectory,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  metafile: true,
  outExtension: { '.js': '.mjs' },
};

function retainedInputs(result) {
  return [
    ...new Set(
      Object.values(result.metafile.outputs).flatMap(output =>
        Object.entries(output.inputs)
          .filter(([, input]) => input.bytesInOutput > 0)
          .map(([name]) => name)
      )
    ),
  ];
}

try {
  const result = await build({
    ...options,
    stdin: {
      contents: `import { handlebarsTemplate, diffRecordValues } from '@researchdatabox/sails-ng-common';
        globalThis.packageBrowserProbe = [handlebarsTemplate, diffRecordValues];`,
      resolveDir: packageDirectory,
    },
    write: false,
    splitting: true,
    outdir: join(temporaryDirectory, 'runtime'),
  });
  const retained = retainedInputs(result);
  assert.ok(retained.some(name => name.includes('dist/esm/handlebars-runtime.js')));
  assert.ok(retained.some(name => name.includes('lodash-es/')));
  assert.ok(
    !retained.some(name =>
      /handlebars[\\/]compiler[\\/]|source-map[\\/]|lodash[\\/]lodash\.js|luxon[\\/]build[\\/]node/.test(name)
    ),
    retained.join('\n')
  );
  const entry =
    result.metafile.outputs[
      Object.keys(result.metafile.outputs).find(name => result.metafile.outputs[name].entryPoint)
    ];
  assert.ok(!Object.keys(entry.inputs).some(name => name.includes('marked/')));

  const focused = await build({
    ...options,
    stdin: {
      contents: `export { escapeHtmlText } from '@researchdatabox/sails-ng-common/html-helpers';`,
      resolveDir: packageDirectory,
    },
    write: false,
    outfile: join(temporaryDirectory, 'html.mjs'),
  });
  assert.ok(focused.outputFiles[0].contents.byteLength < 1000);
  assert.ok(!retainedInputs(focused).some(name => /handlebars|luxon|lodash|dictionary/.test(name)));

  // Test evaluation timing and failed chunk fallback in fresh bundles. The
  // module stub records *evaluation*, not just presence in the build graph.
  for (const fail of [false, true]) {
    const directory = join(temporaryDirectory, fail ? 'failed-markdown' : 'markdown');
    await build({
      ...options,
      stdin: {
        contents: `export { handlebarsHelperDefinitions, loadMarkdownParser } from '@researchdatabox/sails-ng-common/handlebars-runtime';`,
        resolveDir: packageDirectory,
      },
      outdir: directory,
      splitting: true,
      plugins: [
        {
          name: 'observe-markdown-evaluation',
          setup(plugin) {
            plugin.onResolve({ filter: /^marked$/ }, () => ({ path: 'marked', namespace: 'markdown-probe' }));
            plugin.onLoad({ filter: /.*/, namespace: 'markdown-probe' }, () => ({
              contents: `globalThis.markdownEvaluations = (globalThis.markdownEvaluations ?? 0) + 1;
             ${fail ? 'throw new Error("unavailable chunk");' : ''}
             export const parse = input => '<parsed>' + input + '</parsed>';`,
            }));
          },
        },
      ],
    });
    globalThis.markdownEvaluations = 0;
    const api = await import(pathToFileURL(join(directory, 'stdin.mjs')));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(globalThis.markdownEvaluations, 0, 'import must not start Markdown loading');
    assert.equal(api.handlebarsHelperDefinitions.markdownToHtml('html', 'html'), 'html');
    assert.equal(api.handlebarsHelperDefinitions.markdownToHtml('', 'markdown'), '');
    assert.equal(globalThis.markdownEvaluations, 0);
    assert.equal(api.handlebarsHelperDefinitions.markdownToHtml('text', 'markdown'), 'text');
    const loading = api.loadMarkdownParser();
    assert.equal(api.loadMarkdownParser(), loading, 'concurrent requests must share one import');
    await loading;
    assert.equal(globalThis.markdownEvaluations, 1);
    assert.equal(
      api.handlebarsHelperDefinitions.markdownToHtml('text', 'markdown'),
      fail ? 'text' : '<parsed>text</parsed>'
    );
  }

  const browser = await import(new URL('../dist/esm/browser.js', import.meta.url));
  const node = require('@researchdatabox/sails-ng-common');
  assert.deepEqual(
    Object.keys(browser).sort(),
    Object.keys(node).sort(),
    'browser and Node named exports must stay compatible'
  );
  assert.equal(typeof node.handlebarsInstance().compile, 'function');
  assert.equal(browser.handlebarsInstance().compile, undefined);
  assert.deepEqual(
    [...browser.FieldComponentDefinitionMap.keys()],
    [...node.FieldComponentDefinitionMap.keys()],
    'the browser dictionary must retain all built-in and hook-facing definitions'
  );
  assert.deepEqual(browser.KindNameDefaultsMap, node.KindNameDefaultsMap);
  // Resolve historical deep imports used by custom hooks and form tests.
  assert.ok(require.resolve('@researchdatabox/sails-ng-common/dist/src/testing'));
  assert.ok(require.resolve('@researchdatabox/sails-ng-common/dist/src/testing.js'));
  console.log(
    'Browser ESM, compiler elimination, focused exports, Markdown demand/failure, and CommonJS compatibility checks passed.'
  );
} finally {
  delete globalThis.markdownEvaluations;
  await rm(temporaryDirectory, { recursive: true, force: true });
}
