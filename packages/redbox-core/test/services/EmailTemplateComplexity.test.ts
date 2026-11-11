import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as sinon from 'sinon';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import { scanEmailTemplateComplexity } from '../../src/utilities/EmailTemplateComplexity';
import { Services, validateEmailTemplate } from '../../src/services/EmailTemplateService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('Email template pre-parse complexity policy', () => {
  let mock: any;
  const content = (body: string) => ({ subject: 'Subject', body, format: 'text' as const });
  const blocks = (count: number) => '{{#if oid}}'.repeat(count) + '{{oid}}' + '{{/if}}'.repeat(count);
  beforeEach(() => {
    mock = createMockSails({ config: { emailnotification: { settings: {} } } });
    setupServiceTestGlobals(mock);
  });
  afterEach(() => { sinon.restore(); cleanupServiceTestGlobals(); });

  it('accepts 64 nested blocks and rejects 65 before any Handlebars parse', () => {
    assert.doesNotThrow(() => validateEmailTemplate(content(blocks(64))));
    const parse = sinon.spy(handlebarsInstance(), 'parse');
    assert.throws(() => validateEmailTemplate(content(blocks(65))), { code: 'TOO_COMPLEX' });
    sinon.assert.notCalled(parse);
    mock.config.emailnotification.settings.maxSubjectBytes = 10000;
    assert.throws(() => validateEmailTemplate({ ...content('Body'), subject: blocks(65) }), { code: 'TOO_COMPLEX' });
    sinon.assert.notCalled(parse);
  });

  it('counts combined block/subexpression nesting and every chained inverse', () => {
    const sub = (n: number) => '{{#if ' + '(if '.repeat(n) + 'oid' + ')'.repeat(n) + '}}x{{/if}}';
    assert.doesNotThrow(() => validateEmailTemplate(content(sub(63))));
    assert.throws(() => validateEmailTemplate(content(sub(64))), { code: 'TOO_COMPLEX' });
    for (const branch of ['{{else if oid}}', '{{~else if oid~}}', '{{ else if oid}}']) {
      assert.doesNotThrow(() => validateEmailTemplate(content('{{#if oid}}' + branch.repeat(63) + '{{/if}}')));
      assert.throws(() => validateEmailTemplate(content('{{#if oid}}' + branch.repeat(64) + '{{/if}}')), { code: 'TOO_COMPLEX' });
    }
    assert.deepEqual(scanEmailTemplateComplexity('{{#if oid}}{{else if oid}}{{/if}}{{#if oid}}{{/if}}'),
      { expressions: 3, nesting: 2, exceeded: false });
  });

  it('normalises delimiters, block markers and subexpressions at the compiler thresholds', () => {
    const fullwidth = (text: string) => text.replaceAll('{', '｛').replaceAll('}', '｝');
    const sub = (n: number) => '{{#if ' + '（if '.repeat(n) + 'oid' + '）'.repeat(n) + '}}x{{/if}}';
    for (const [accepted, rejected] of [
      [fullwidth(blocks(64)), fullwidth(blocks(65))],
      [blocks(64).replaceAll('#', '＃'), blocks(65).replaceAll('#', '＃')],
      [sub(63), sub(64)],
      ['｛｛oid｝｝'.repeat(1024), '｛｛oid｝｝'.repeat(1025)],
      ['{{if （if oid）}}'.repeat(512), '{{if （if oid）}}'.repeat(513)],
    ]) {
      assert.deepEqual(scanEmailTemplateComplexity(accepted), scanEmailTemplateComplexity(accepted.normalize('NFKC')));
      assert.doesNotThrow(() => validateEmailTemplate(content(accepted)));
      const parse = sinon.spy(handlebarsInstance(), 'parse');
      assert.throws(() => validateEmailTemplate(content(rejected)), { code: 'TOO_COMPLEX' });
      sinon.assert.notCalled(parse);
      parse.restore();
    }
    // Policy must see exactly what compilation sees, not fullwidth plain text.
    assert.throws(() => validateEmailTemplate(content('｛｛privateRoot｝｝')), { code: 'INVALID_TEMPLATE' });
    const parsed: any = {};
    validateEmailTemplate(content('｛｛record.metadata.title｝｝'), true, parsed);
    assert.equal(parsed.body.body[0].path.original, 'record.metadata.title');
  });

  it('matches actual raw-block AST counts, including invalid-looking closing tokens', () => {
    const parserCounts = (source: string) => {
      let expressions = 0;
      let nesting = 0;
      const walk = (node: any, depth = 0) => {
        if (!node || typeof node !== 'object') return;
        if (['BlockStatement', 'SubExpression'].includes(node.type)) depth++;
        if (['BlockStatement', 'SubExpression', 'MustacheStatement'].includes(node.type)) {
          expressions++;
          nesting = Math.max(nesting, depth);
        }
        for (const [key, value] of Object.entries(node)) {
          if (key === 'loc') continue;
          if (Array.isArray(value)) value.forEach(child => walk(child, depth));
          else if (value && typeof value === 'object') walk(value, depth);
        }
      };
      walk(handlebarsInstance().parse(source));
      return { expressions, nesting, exceeded: expressions > 1024 || nesting > 64 };
    };
    for (const fake of ['{{{{/if }}}}', '{{{{/not.a.close}}}}', '{{{{/if~}}}}', '{{{{/ if}}}}', '{{{{/if/}}}}', '{{{{/if', '{{{{/}}}}']) {
      // All 66 apparent blocks are raw text. This is one actual parser block.
      const literal = '{{{{if oid}}}}' + fake + blocks(65) + '{{{{/if}}}}';
      assert.deepEqual(parserCounts(literal), { expressions: 1, nesting: 1, exceeded: false });
      assert.deepEqual(scanEmailTemplateComplexity(literal), parserCounts(literal));
      assert.doesNotThrow(() => validateEmailTemplate(content(literal)));
      for (const tail of [blocks(65), '{{oid}}'.repeat(1025)]) {
        const source = '{{{{if oid}}}}' + fake + '{{get "{{{{/if}}}}' + tail;
        const actual = parserCounts(source);
        const scan = scanEmailTemplateComplexity(source, { maxExpressions: 10000, maxNesting: 10000 });
        assert.equal(scanEmailTemplateComplexity(source).exceeded, actual.exceeded);
        assert.equal(scan.nesting, actual.nesting);
        assert.equal(scan.expressions, actual.expressions);
        assert.throws(() => validateEmailTemplate(content(source)), { code: 'TOO_COMPLEX' });
      }
    }
    // The raw lexer pushes on the opener alone, even without an opening tag end.
    const nested = '{{{{if oid}}}}{{{{nested ' + blocks(65) + '{{{{/nested}}}}{{{{/if}}}}';
    assert.deepEqual(scanEmailTemplateComplexity(nested), parserCounts(nested));
  });

  it('accepts exactly 1024 expressions, including subexpressions, without counting closing tags or plain inverses', () => {
    assert.doesNotThrow(() => validateEmailTemplate(content('{{oid}}'.repeat(1024))));
    assert.throws(() => validateEmailTemplate(content('{{oid}}'.repeat(1025))), { code: 'TOO_COMPLEX' });
    assert.doesNotThrow(() => validateEmailTemplate(content('{{#if oid}}x{{else}}y{{/if}}'.repeat(1024))));
    assert.doesNotThrow(() => validateEmailTemplate(content('{{if (if oid)}}'.repeat(512))));
    assert.throws(() => validateEmailTemplate(content('{{if (if oid)}}'.repeat(513))), { code: 'TOO_COMPLEX' });
    // Sibling subexpressions do not increase nesting cumulatively.
    assert.deepEqual(scanEmailTemplateComplexity('{{#if ' + '(if oid) '.repeat(65) + '}}x{{/if}}'),
      { expressions: 66, nesting: 2, exceeded: false });
  });

  it('recognises trim/whitespace/inverted blocks and long whitespace before a plain inverse', () => {
    for (const open of ['{{~#if oid~}}', '{{#if\n oid}}', '{{^if oid}}']) {
      assert.throws(() => validateEmailTemplate(content(open.repeat(65) + '{{/if}}'.repeat(65))), { code: 'TOO_COMPLEX' });
    }
    for (const inverse of ['{{else' + ' '.repeat(100) + '}}', '{{~^~}}']) {
      assert.deepEqual(scanEmailTemplateComplexity('{{#if oid}}' + inverse + '{{/if}}'),
        { expressions: 1, nesting: 1, exceeded: false });
    }
  });

  it('ignores syntax-like text in quotes, segment literals, comments, raw blocks and escaped mustaches', () => {
    const noise = '(({{#if oid}}'.repeat(1100);
    const fixtures: Array<[string, number, number]> = [
      ['{{get record.metadata "' + noise + '"}}', 1, 0],
      ["{{get record.metadata 'escaped\\'" + noise + "'}}", 1, 0],
      ['{{record.metadata.[' + noise + ']}}', 1, 0],
      ['{{!--' + noise + '--~}}', 0, 0],
      ['{{!' + '('.repeat(1100) + '}}', 0, 0],
      ['{{{{raw}}}}' + noise + '{{{{/raw}}}}', 1, 1],
      ['\\{{oid}}'.repeat(1100), 0, 0],
      ['\\\\{{oid}}', 1, 0],
    ];
    for (const [source, expressions, nesting] of fixtures) {
      assert.deepEqual(scanEmailTemplateComplexity(source), { expressions, nesting, exceeded: false });
      assert.doesNotThrow(() => validateEmailTemplate(content(source), false));
    }
    assert.deepEqual(scanEmailTemplateComplexity('{{{{raw}}}}{{{{nested}}}}' + noise + '{{{{/nested}}}}{{{{/raw}}}}'),
      { expressions: 1, nesting: 1, exceeded: false });
  });

  it('uses configurable limits and rejects invalid settings at startup', async () => {
    mock.config.emailnotification.settings = { maxTemplateNesting: 2, maxTemplateExpressions: 3 };
    assert.doesNotThrow(() => validateEmailTemplate(content(blocks(2))));
    assert.throws(() => validateEmailTemplate(content(blocks(3))), { code: 'TOO_COMPLEX' });
    assert.throws(() => validateEmailTemplate(content('{{oid}}'.repeat(4))), { code: 'TOO_COMPLEX' });
    for (const key of ['maxTemplateNesting', 'maxTemplateExpressions']) {
      for (const value of [0, -1, 1.5, '64', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
        mock.config.emailnotification.settings = { [key]: value };
        await assert.rejects(new Services.EmailTemplates().bootstrap(), new RegExp(key));
      }
    }
  });

  it('rejects the 72 KB / 4000-block review input in well under 100 ms without parsing or retaining content', () => {
    const source = blocks(4000);
    assert.equal(Buffer.byteLength(source), 72007);
    const parse = sinon.spy(handlebarsInstance(), 'parse');
    const start = performance.now();
    assert.throws(() => validateEmailTemplate(content(source)), (error: any) => {
      assert.equal(error.code, 'TOO_COMPLEX');
      assert.deepEqual(error.diagnostic, { field: 'body', reason: 'TOO_COMPLEX', line: 1, column: 1 });
      assert.equal(error.cause, undefined);
      assert.ok(!JSON.stringify(error).includes('oid'));
      return true;
    });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `complexity rejection took ${elapsed.toFixed(2)} ms (ceiling 50 ms)`);
    sinon.assert.notCalled(parse);
  });

  it('keeps all seven core email bodies within the default bounds', () => {
    const directory = join(__dirname, '../../../../views/emailTemplates');
    const files = readdirSync(directory).filter(file => file.endsWith('.hbs'));
    assert.equal(files.length, 7);
    let expressions = 0;
    let nesting = 0;
    for (const file of files) {
      const result = scanEmailTemplateComplexity(readFileSync(join(directory, file), 'utf8'));
      assert.equal(result.exceeded, false, file);
      expressions = Math.max(expressions, result.expressions);
      nesting = Math.max(nesting, result.nesting);
    }
    assert.equal(expressions, 27);
    assert.equal(nesting, 2);
  });
});
