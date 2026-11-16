import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBlocks, documentationFiles, extractBlocks } from '../src/examples';

const fence = (language: string, code: string) => `\`\`\`${language}\n${code}\n\`\`\``;

describe('documentation TypeScript block gate', function () {
  this.timeout(60_000);

  it('discovers nested wiki/docs/documentation pages, all READMEs and the migration guide', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-block-discovery-'));
    const included = [
      'support/wiki/nested/Page.md',
      'docs/Guide.mdx',
      'support/docs/Old.md',
      'packages/tool/documentation/Guide.markdown',
      'doc/API.md',
      'README.md',
      'packages/a/ReadMe.md',
      '.github/docs/Guide.md',
      'support/specs/fastify-migration/extension-api2.md',
    ];
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      for (const file of [...included, 'src/code.ts', 'support/specs/plan.md']) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), 'example');
      }
      assert.deepEqual(documentationFiles(root), included.sort());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts ts/typescript, indented and tilde fences while ignoring other languages and nested fences', () => {
    const markdown = [
      fence('ts', 'const a = 1;'),
      fence('typescript', 'const b = 2;'),
      '    ```ts\n    const c = 3;\n    ```',
      '~~~typescript\nconst d = 4;\n~~~',
      fence('json', '{}'),
      '````markdown\n```ts\nnot a real block\n```\n````',
    ].join('\n');
    const blocks = extractBlocks('docs/test.md', markdown);
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].line, 2);
    assert.match(blocks[3].code, /const d = 4/);
    assert.throws(() => extractBlocks('docs/test.md', '```ts\nconst value = 1;'), /unclosed/);
  });

  it('requires per-block reasons and a visible legacy label; subsequent blocks still get checked', () => {
    const partial = '<!-- docs-example:skip partial: Method body with injected inputs. -->';
    const legacy = '<!-- docs-example:skip legacy: Removed API1 imports. -->';
    const blocks = extractBlocks(
      'docs/test.md',
      `${partial}\n${fence('ts', 'this.save(value)')}\n${fence('ts', 'missing()')}`
    );
    assert.equal(blocks[0].skip?.kind, 'partial');
    assert.equal(blocks[1].skip, undefined);
    assert.throws(() => extractBlocks('docs/test.md', `<!-- docs-example:skip -->\n${fence('ts', '')}`), /<reason>/);
    assert.throws(() => extractBlocks('docs/test.md', `${legacy}\n${fence('ts', '')}`), /prose labelled legacy/);
    assert.throws(
      () => extractBlocks('docs/test.md', `<!-- legacy -->\n${legacy}\n${fence('ts', '')}`),
      /prose labelled legacy/
    );
    assert.equal(
      extractBlocks('docs/test.md', `This is **legacy API1**.\n\n${legacy}\n${fence('ts', '')}`)[0].skip?.kind,
      'legacy'
    );
    assert.throws(() => extractBlocks('docs/test.md', fence('ts', '// @ts-nocheck\nmissing()')), /suppression/);
  });

  it('checks public exports and isolated blocks with original Markdown diagnostic locations', () => {
    const blocks = extractBlocks(
      'support/wiki/example.md',
      [
        fence('ts', 'const value = 1;'),
        fence('typescript', 'console.log(value);'),
        fence('ts', "import { createPortalHost } from '@researchdatabox/redbox-core/portal';"),
        fence(
          'ts',
          "import type { PortalHttpOptions, PortalApplicationOptions } from '@researchdatabox/redbox-core/portal';\nexport function logging(options: PortalApplicationOptions) { return options.requestLogging; }"
        ),
        fence('ts', 'const wrong: number = "text";'),
        '<!-- docs-example:skip partial: Deliberately incomplete method body. -->',
        fence('ts', 'this.save(missing);'),
      ].join('\n')
    );
    const diagnostics = checkBlocks(process.cwd(), blocks);
    assert.equal(diagnostics.length, 5, diagnostics.join('\n'));
    assert.ok(diagnostics.some(d => /example.md:5:.*TS2304.*value/.test(d)));
    assert.ok(diagnostics.some(d => /TS2305.*createPortalHost/.test(d)));
    assert.ok(diagnostics.some(d => /TS2724.*PortalHttpOptions/.test(d)));
    assert.ok(diagnostics.some(d => /TS2339.*requestLogging/.test(d)));
    assert.ok(diagnostics.some(d => /TS2322/.test(d)));
  });

  it('compiles the current Fastify logging configurations directly from both wiki pages', () => {
    const recipes = ['support/wiki/Request-Chronicle-Logging.md', 'support/wiki/V6-Client-Compatibility.md'].map(
      file => {
        const blocks = extractBlocks(file, fs.readFileSync(file, 'utf8'));
        const recipe = blocks.find(block => block.code.includes('applicationConfig'));
        assert.ok(recipe, `missing supported logging recipe in ${file}`);
        assert.equal(recipe.skip, undefined, 'the current logging recipe must compile');
        assert.match(recipe.code, /PortalConfiguration/);
        return recipe;
      }
    );
    assert.deepEqual(checkBlocks(process.cwd(), recipes), []);
  });

  it('accepts explicit repository workspace contexts and rejects missing or escaping contexts', () => {
    const block = extractBlocks(
      'docs/imports.md',
      `<!-- docs-example:context angular -->\n${fence('ts', 'export const value = 1;')}`
    )[0];
    assert.equal(block.context, 'angular');
    assert.equal(block.skip, undefined);
    for (const directory of ['../outside', '/tmp']) {
      assert.throws(
        () => extractBlocks('docs/imports.md', `<!-- docs-example:context ${directory} -->\n${fence('ts', '')}`),
        /inside the repository/
      );
    }
    assert.throws(
      () => checkBlocks(process.cwd(), [{ ...block, context: 'missing-context-directory' }]),
      /context directory does not exist/
    );
  });

  it('type-checks the translation imports in their actual Angular workspace, retaining Markdown diagnostics', () => {
    const file = 'support/wiki/translation-app-filtering-and-rich-html-editing.md';
    const block = extractBlocks(file, fs.readFileSync(file, 'utf8')).find(block =>
      block.code.includes("from '@tiptap/core'")
    );
    assert.ok(block);
    assert.equal(block.context, 'angular/projects/researchdatabox/translation/src/app');
    assert.equal(block.skip, undefined);
    const diagnostics = checkBlocks(process.cwd(), [
      block,
      { ...block, code: "import { MissingDocumentationExport } from '@tiptap/core';" },
    ]);
    assert.equal(diagnostics.length, 1, diagnostics.join('\n'));
    assert.match(diagnostics[0], new RegExp(`${file}:${block.line}:.*TS2305.*MissingDocumentationExport`));
  });
});
