import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
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
    if (fail) await assert.rejects(loading, /unavailable chunk/);
    else await loading;
    assert.equal(globalThis.markdownEvaluations, 1);
    assert.equal(
      api.handlebarsHelperDefinitions.markdownToHtml('text', 'markdown'),
      fail ? 'text' : '<parsed>text</parsed>'
    );
    if (fail) {
      const retry = api.loadMarkdownParser();
      assert.notEqual(retry, loading, 'a failed request must not permanently cache its promise');
      await assert.rejects(retry, /unavailable chunk/);
    }
  }

  const browser = await import(new URL('../dist/esm/browser.js', import.meta.url));
  const node = require('@researchdatabox/sails-ng-common');
  assert.deepEqual(
    Object.keys(browser).sort(),
    Object.keys(node).sort(),
    'browser and Node named exports must stay compatible'
  );
  const runtime = await import(new URL('../dist/esm/handlebars-runtime.js', import.meta.url));
  assert.equal(runtime.handlebarsInstance().compile, undefined);
  assert.equal(typeof node.handlebarsInstance().compile, 'function');
  require('handlebars').registerHelper('directCompilerHook', value => `direct:${value}`);
  const compiler = browser.handlebarsInstance();
  assert.equal(compiler, browser.handlebarsInstance());
  assert.equal(typeof compiler.compile, 'function');
  assert.equal(typeof compiler.precompile, 'function');
  assert.equal(compiler.helpers, runtime.handlebarsInstance().helpers);
  assert.equal(compiler.partials, runtime.handlebarsInstance().partials);
  assert.equal(compiler.decorators, runtime.handlebarsInstance().decorators);
  compiler.registerHelper('explicitCompilerHook', value => `hook:${value}`);
  compiler.registerPartial('explicitCompilerPartial', '{{explicitCompilerHook name}}');
  try {
    assert.equal(compiler.compile('{{directCompilerHook name}}')({ name: 'Ada' }), 'direct:Ada');
    assert.equal(compiler.compile('{{> explicitCompilerPartial}}')({ name: 'Ada' }), 'hook:Ada');
    const partialSpec = Function(`return ${compiler.precompile('{{> explicitCompilerPartial}}')}`)();
    assert.equal(runtime.handlebarsTemplate(partialSpec)({ name: 'Ada' }), 'hook:Ada');
    const spec = Function(`return ${compiler.precompile('{{explicitCompilerHook name}}')}`)();
    const originalFunction = globalThis.Function;
    try {
      globalThis.Function = () => { throw new Error('CSP forbids dynamic code generation'); };
      assert.equal(runtime.handlebarsTemplate(spec)({ name: 'Ada' }), 'hook:Ada');
    } finally {
      globalThis.Function = originalFunction;
    }
    runtime.handlebarsInstance().registerHelper('explicitCompilerHook', value => `updated:${value}`);
    assert.equal(compiler.compile('{{explicitCompilerHook name}}')({ name: 'Ada' }), 'updated:Ada');
  } finally {
    compiler.unregisterHelper('explicitCompilerHook');
    compiler.unregisterPartial('explicitCompilerPartial');
    compiler.unregisterHelper('directCompilerHook');
  }
  // A new Node process proves import/HTML do not preload Marked and the very
  // first synchronous server Markdown render contains HTML, without a timer.
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const api = require('@researchdatabox/sails-ng-common');
    const loaded = () => Object.keys(require.cache).some(path => path.endsWith('/marked-parser.cjs'));
    assert.equal(loaded(), false);
    const render = api.handlebarsCompile('{{{markdownToHtml content outputFormat}}}');
    assert.equal(render({ content: '<b>html</b>', outputFormat: 'html' }), '<b>html</b>');
    assert.equal(render({ content: '', outputFormat: 'markdown' }), '');
    assert.equal(loaded(), false);
    assert.equal(render({ content: '**first**', outputFormat: 'markdown' }), '<p><strong>first</strong></p>\\n');
    assert.equal(loaded(), true);
  `], { cwd: packageDirectory, stdio: 'pipe' });
  // Resolve the actual browser export condition in an isolated process, without
  // the CommonJS API sharing Handlebars' vendor singleton with this test runner.
  execFileSync(process.execPath, ['--conditions=browser', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { handlebarsInstance as full } from '@researchdatabox/sails-ng-common';
    import { handlebarsInstance as runtime, handlebarsHelperDefinitions, loadMarkdownParser }
      from '@researchdatabox/sails-ng-common/handlebars-runtime';
    assert.equal(runtime().compile, undefined);
    assert.equal(full().helpers, runtime().helpers);
    assert.equal(runtime().helpers.markdownToHtml, handlebarsHelperDefinitions.markdownToHtml);
    await loadMarkdownParser();
    assert.equal(full().compile('{{{markdownToHtml content "markdown"}}}')({ content: '**browser**' }),
      '<p><strong>browser</strong></p>\\n');
  `], { cwd: packageDirectory, stdio: 'pipe' });
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
