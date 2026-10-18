import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { handlebarsInstance as compilerInstance, handlebarsPrecompile } from '../../src/handlebars-helpers';
import { handlebarsCompile as browserCompile } from '../../src/handlebars-browser-compiler';
import {
  handlebarsInstance,
  handlebarsTemplate,
  loadMarkdownParser,
  handlebarsHelperDefinitions,
} from '../../src/handlebars-runtime';

describe('Handlebars runtime compatibility', () => {
  it('executes server-precompiled helpers without dynamic code generation', () => {
    const spec = runInNewContext(`(${handlebarsPrecompile('{{toUpper name}} {{formatDate date "YYYY-MM-DD"}}')})`);
    const originalFunction = globalThis.Function;
    try {
      globalThis.Function = (() => {
        throw new Error('CSP forbids dynamic code generation');
      }) as unknown as FunctionConstructor;
      assert.equal(handlebarsTemplate(spec)({ name: 'Ada', date: '2026-10-18' }), 'ADA 2026-10-18');
    } finally {
      globalThis.Function = originalFunction;
    }
  });

  it('preserves runtime hook helper overrides and shares them with explicit browser compilation', () => {
    const instance = handlebarsInstance();
    instance.registerHelper('runtimeHookTest', value => `hook:${value}`);
    instance.registerPartial('runtimeHookPartial', '{{runtimeHookTest name}}');
    try {
      assert.equal(handlebarsInstance(), instance);
      assert.equal(browserCompile('{{> runtimeHookPartial}}')({ name: 'Ada' }), 'hook:Ada');
      const spec = runInNewContext(`(${handlebarsPrecompile('{{runtimeHookTest name}}')})`);
      assert.equal(handlebarsTemplate(spec)({ name: 'Ada' }), 'hook:Ada');
    } finally {
      instance.unregisterHelper('runtimeHookTest');
      instance.unregisterPartial('runtimeHookPartial');
    }
  });

  it('keeps the full singleton compiler API available to Node callers', () => {
    assert.equal(compilerInstance(), compilerInstance());
    assert.equal(compilerInstance().compile('{{toUpper name}}')({ name: 'Ada' }), 'ADA');
  });

  it('supports deterministic Markdown rendering after explicitly awaiting its parser', async () => {
    await loadMarkdownParser();
    assert.equal(handlebarsHelperDefinitions.markdownToHtml('**bold**', 'markdown'), '<p><strong>bold</strong></p>\n');
    assert.equal(handlebarsHelperDefinitions.markdownToHtml('<b>HTML</b>', 'html'), '<b>HTML</b>');
    assert.equal(handlebarsHelperDefinitions.markdownToHtml(null, 'markdown'), '');
  });
});
