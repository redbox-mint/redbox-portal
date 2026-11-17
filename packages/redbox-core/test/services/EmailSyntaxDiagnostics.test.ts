import {
  DOCUMENTED_HELPERS,
  helperInsertion,
  helperUsage,
} from '../../../../angular/projects/researchdatabox/email-templates/src/app/helper-usage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import { emailSyntaxDiagnostic } from '../../src/utilities/EmailTemplateSyntax';
import { compileEmailTemplatePreview } from '../../src/utilities/EmailTemplatePreview';
import { EmailTemplateError, validateEmailTemplate } from '../../src/services/EmailTemplateService';
import { Services } from '../../src/services/EmailTemplateAdminService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('UR-U02 safe syntax diagnostics', () => {
  beforeEach(() =>
    setupServiceTestGlobals(
      createMockSails({
        config: {
          emailnotification: { settings: { additionalContextRoots: [] } },
        },
      })
    )
  );
  afterEach(() => cleanupServiceTestGlobals());

  for (const helper of ['each', 'if', 'unless', 'with'] as const) {
    it(`locates an unclosed ${helper} at its actual opening in either field`, () => {
      for (const field of ['subject', 'body'] as const) {
        const content = {
          subject: 'Subject',
          body: 'Body',
          format: 'text' as const,
          [field]: `PRIVATE TEXT\n   {{#${helper} record.metadata.PRIVATE_PATH}}\n<p>{{this.name}}</p>`,
        };
        const expected = { field, reason: 'UNCLOSED_BLOCK', helper, line: 2, column: 4 };
        assert.throws(
          () => validateEmailTemplate(content),
          (error: unknown) => {
            assert.ok(error instanceof EmailTemplateError);
            assert.equal(error.code, 'INVALID_TEMPLATE');
            assert.deepEqual(error.diagnostic, expected);
            assert.ok(!inspect(error).includes('PRIVATE'));
            assert.equal(error.cause, undefined);
            return true;
          }
        );
        assert.deepEqual(new Services.EmailTemplateAdmin().validate(content), [
          { code: 'INVALID_TEMPLATE', severity: 'error', ...expected },
        ]);
      }
    });
  }
  it('finds the innermost unclosed block and ignores inverse chains, comments, escapes and raw text', () => {
    assert.deepEqual(
      emailSyntaxDiagnostic('Text\n{{#if oid}}{{else if title}}\n  {{#each record.metadata.creators}}'),
      { reason: 'UNCLOSED_BLOCK', helper: 'each', line: 3, column: 3 }
    );
    for (const ignored of [
      '{{!-- {{#if oid}} --}}',
      '{{! {{#if oid}}',
      '\\{{#if oid}}',
      '{{{{raw}}}}{{#if oid}}{{{{/raw}}}}',
    ]) {
      assert.deepEqual(emailSyntaxDiagnostic(ignored + '\n {{#with record}}'), {
        reason: 'UNCLOSED_BLOCK',
        helper: 'with',
        line: 2,
        column: 2,
      });
    }
  });
  it('locates mismatched and orphan closing tags without returning arbitrary names', () => {
    assert.deepEqual(emailSyntaxDiagnostic('Text\n{{#if oid}}\n  {{/each}}'), {
      reason: 'MISMATCHED_CLOSE',
      helper: 'if',
      line: 3,
      column: 3,
    });
    const value = emailSyntaxDiagnostic('Text\n {{#PRIVATE_HELPER oid}}\n{{/PRIVATE_CLOSE}}');
    assert.deepEqual(value, { reason: 'MISMATCHED_CLOSE', line: 3, column: 1 });
    assert.deepEqual(emailSyntaxDiagnostic('Text\n {{/each}}'), { reason: 'MISMATCHED_CLOSE', line: 2, column: 2 });
    assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  });
  it('maps normalized syntax positions back to the original editor buffer', () => {
    const body = 'ﬁ e\u0301 {{#each oid}}';
    const [diagnostic] = new Services.EmailTemplateAdmin().validate({ subject: 'S', body, format: 'text' });
    assert.equal(diagnostic.reason, 'UNCLOSED_BLOCK');
    assert.equal(diagnostic.column, body.indexOf('{{') + 1);
  });

  it('UR-U03 documents every registered helper with translated syntax and examples', () => {
    const translations = JSON.parse(
      readFileSync(join(__dirname, '../../../../language-defaults/en/translation.json'), 'utf8')
    );
    const metadata = JSON.parse(readFileSync(join(__dirname, '../../../../language-defaults/meta.json'), 'utf8'));
    for (const name of Object.keys(handlebarsInstance().helpers)) {
      assert.ok((DOCUMENTED_HELPERS as readonly string[]).includes(name), name);
      for (const key of Object.values(helperUsage(name)!)) {
        assert.ok(translations[key], key);
        assert.equal(metadata[key].contentFormat, 'plain');
      }
    }
    for (const name of ['each', 'if', 'unless', 'with'])
      assert.doesNotThrow(() => handlebarsInstance().precompile(helperInsertion(name), { strict: true }));
  });

  it('renders every helper-usage example and builds attachment links with the root branding name', () => {
    const translations = JSON.parse(
      readFileSync(join(__dirname, '../../../../language-defaults/en/translation.json'), 'utf8')
    );
    const context = {
      oid: 'record-123',
      portal: { brandName: 'default', brandUrl: 'https://example.edu/default/rdmp', portalName: 'rdmp' },
      record: {
        dateCreated: '2026-10-28T00:00:00.000Z',
        workflow: { stage: 'published' },
        metadata: {
          title: 'Research',
          description: 'Description',
          contributor_ci: { name: 'Jo' },
          creators: [{ name: 'Jo', email: 'jo@example.edu' }],
          attachments: [{ fileId: 'file-456' }],
        },
      },
    };
    for (const name of DOCUMENTED_HELPERS) {
      const example = translations[helperUsage(name)!.exampleKey];
      const source =
        name === 'attachmentDownloadUrl' ? `{{#each record.metadata.attachments}}${example}{{/each}}` : example;
      let rendered = '';
      assert.doesNotThrow(() => {
        rendered = compileEmailTemplatePreview(source)(context);
      }, name);
      if (name === 'attachmentDownloadUrl') assert.equal(rendered, '/default/rdmp/record/record-123/attach/file-456');
    }
    assert.equal(Object.hasOwn(translations, 'email-templates-helper-attachmentDownloadUrl-example'), false);
  });

  it('gives the presence-check examples the right branch for present and absent fields', () => {
    const translations = JSON.parse(
      readFileSync(join(__dirname, '../../../../language-defaults/en/translation.json'), 'utf8')
    );
    const render = (helper: string, metadata: Record<string, unknown>) =>
      compileEmailTemplatePreview(translations[helperUsage(helper)!.exampleKey])({ record: { metadata } });
    assert.equal(render('isUndefined', { title: 'Research' }), 'No subtitle yet');
    assert.equal(render('isUndefined', { title: 'Research', subtitle: 'Sub' }), '');
    assert.equal(render('isDefined', { title: 'Research' }), 'Title: Research');
    assert.equal(render('isDefined', {}), '');
  });

  it('uses the actual unexpected token position and leaves the shared parser intact', () => {
    const parser = (handlebarsInstance() as any).Parser;
    const original = parser.parseError;
    const result = emailSyntaxDiagnostic('Text\n  {{#if oid}}\n  {{get (}}\n{{/if}}');
    assert.deepEqual(result, { reason: 'UNEXPECTED_TOKEN', line: 3, column: 10 });
    assert.equal(parser.parseError, original);
    assert.doesNotThrow(() => validateEmailTemplate({ subject: 'Subject', body: '{{oid}}', format: 'text' }));
  });
});
