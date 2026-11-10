import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import nodemailer = require('nodemailer');
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { inspect } from 'node:util';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import { Controllers as EmailControllers } from '../../src/controllers/EmailController';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as SanitizerServices } from '../../src/services/DomSanitizerService';
import { EmailTemplateError, safeEmailTemplateError, validateEmailTemplate } from '../../src/services/EmailTemplateService';
import { dompurify } from '../../src/config/dompurify.config';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('Email template safety', () => {
  let email: EmailServices.Email;
  let mockSails: any;
  let sendMail: sinon.SinonStub;
  let sanitizer: SanitizerServices.DomSanitizer;
  let directory: string;
  const content = (body: string, subject = 'Subject') => ({ body, subject, format: 'html' as const });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'email-safety-'));
    mockSails = createMockSails({ config: {
      dompurify: _.cloneDeep(dompurify),
      emailnotification: {
        settings: { enabled: true, templateDir: directory, serverOptions: { jsonTransport: true } },
        defaults: { subject: 'Subject', from: 'from@example.com', format: 'html' }, templates: {},
      },
    } });
    setupServiceTestGlobals(mockSails);
    email = new EmailServices.Email();
    sanitizer = new SanitizerServices.DomSanitizer();
    (global as any).DomSanitizerService = sanitizer;
    sendMail = sinon.stub().resolves({ messageId: 'safety' });
    sinon.stub(nodemailer, 'createTransport').returns({ sendMail } as any);
  });

  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    delete (global as any).DomSanitizerService;
    delete (global as any).EmailTemplateService;
    delete (global as any).BrandingService;
    rmSync(directory, { force: true, recursive: true });
  });

  it('accepts built-ins, registered shared helpers, nested subexpressions, hash paths, data vars and block params', () => {
    for (const body of [
      '{{{json record}}} {{get portal "appUrl"}} {{lookup sailsConfig "appUrl"}}',
      '{{#if (and oid (not (isEmpty record.metadata)))}}{{record.metadata.[dc:title]}}{{/if}}',
      '{{#each record.metadata.people as |person index|}}{{person.name}} {{index}} {{@index}} {{@key}} {{@first}} {{@last}} {{@root.oid}} {{../oid}}{{/each}}',
      '{{#with record.metadata}}{{title}} {{this.title}} {{./title}} {{../oid}}{{/with}}',
      '{{#record.metadata.people}}{{this.name}}{{else}}{{oid}}{{/record.metadata.people}}',
      '{{#if oid}}{{else if record.metadata}}{{record.oid}}{{/if}}',
      '{{#each record.metadata}}{{#each this}}{{../../portal.appUrl}}{{/each}}{{/each}}',
    ]) assert.doesNotThrow(() => validateEmailTemplate(content(body)), body);
    mockSails.config.emailnotification.settings.additionalContextRoots = ['scuEmail'];
    assert.doesNotThrow(() => validateEmailTemplate(content('{{scuEmail.authorName}}')));
  });

  it('rejects unknown roots/helpers, partials, partial blocks and decorators with content-free diagnostics', () => {
    for (const expression of [
      '{{unknown}}', '{{unknown.path}}', '{{unknown oid}}', '{{#unknown oid}}x{{/unknown}}',
      '{{#unknown}}x{{/unknown}}', '{{get (unknown oid) "x"}}',
      '{{concat oid value=unknown}}',
      '{{#each record.metadata}}{{@root.unknown}}{{/each}}', '{{@root.unknown}}',
      '{{#each record.metadata}}{{unknown oid}}{{/each}}', '{{#with record.metadata}}{{> footer}}{{/with}}',
      '{{> footer}}', '{{> (lookup record "partial")}}', '{{#> layout}}x{{/layout}}',
      '{{*inline "x"}}', '{{#*inline "x"}}x{{/inline}}',
    ]) {
      for (const field of ['body', 'subject']) {
        assert.throws(() => validateEmailTemplate({ ...content('Body'), [field]: 'first line\n' + expression }),
          (error: any) => error instanceof EmailTemplateError && error.code === 'INVALID_TEMPLATE' &&
            error.message.includes('line 2, column ') && !Object.hasOwn(error.diagnostic!, 'expression') &&
            error.diagnostic!.field === field && error.diagnostic!.line === 2 && Boolean(error.diagnostic!.reason));
      }
    }
    assert.throws(() => validateEmailTemplate(content('{{#if oid}}')), (error: any) =>
      error.code === 'INVALID_TEMPLATE' && error.diagnostic.field === 'body' && /line \d+, column \d+/.test(error.message));
  });

  // Expected verdicts are asserted independently against the validator and the
  // actual shared Handlebars instance, rather than inferring runtime scope from
  // AST shape. Unknown roots in uncertain contexts are deliberately deferred to
  // strict rendering; accepting them does not expose data outside the curated context.
  const scopeCases: Array<{ label: string; body: string; valid: boolean; renders: boolean; output?: string }> = [
    { label: 'top-level unknown root', body: '{{unknown}}', valid: false, renders: false },
    { label: 'if inverse is deferred to render time', body: '{{#if data}}x{{else}}{{unknown}}{{/if}}', valid: true, renders: false },
    { label: 'unless inverse is deferred to render time', body: '{{#unless oid}}x{{else}}{{unknown}}{{/unless}}', valid: true, renders: false },
    // #if/#unless push no frame. At top level ../ targets no context, so the
    // root-schema check has no certain root to check, even though rendering fails.
    { label: 'if does not create parent depth', body: '{{#if oid}}{{../unknown}}{{/if}}', valid: true, renders: false },
    { label: 'if parent known name still has no context', body: '{{#if oid}}{{../oid}}{{/if}}', valid: true, renders: false },
    { label: 'unless does not create parent depth', body: '{{#unless data}}{{../unknown}}{{/unless}}', valid: true, renders: false },
    { label: 'each local unknown deferred', body: '{{#each record.metadata.people}}{{unknown}}{{/each}}', valid: true, renders: false },
    { label: 'each ancestor unknown deferred', body: '{{#each record.metadata.people}}{{../unknown}}{{/each}}', valid: true, renders: false },
    { label: 'with local unknown deferred', body: '{{#with record.metadata}}{{unknown}}{{/with}}', valid: true, renders: false },
    { label: 'implicit local unknown deferred', body: '{{#record.metadata.people}}{{unknown}}{{/record.metadata.people}}', valid: true, renders: false },
    { label: 'boolean section root miss deferred', body: '{{#record.metadata.enabled}}{{this.unknown}}{{/record.metadata.enabled}}', valid: true, renders: false },
    { label: 'nested implicit iteration pushes both frames', body: '{{#record.metadata.groups}}{{#this}}{{../../oid}}{{/this}}{{/record.metadata.groups}}', valid: true, renders: true, output: 'OID' },
    { label: 'each this values have uncertain context', body: '{{#each this}}{{#if (eq @key "record")}}{{metadata.title}}{{/if}}{{/each}}', valid: true, renders: true, output: 'Title' },
    { label: 'each root values and aliases have uncertain context', body: '{{#each @root as |value key|}}{{#if (eq key "record")}}{{value.metadata.title}}/{{metadata.title}}{{/if}}{{/each}}', valid: true, renders: true, output: 'Title/Title' },
    { label: 'each root alias values have uncertain context', body: '{{#with @root as |ctx|}}{{#each ctx as |value key|}}{{#if (eq key "record")}}{{value.metadata.title}}{{/if}}{{/each}}{{/with}}', valid: true, renders: true, output: 'Title' },
    { label: 'if within with retains uncertain context', body: '{{#with record.metadata}}{{#if title}}{{unknown}}{{/if}}{{/with}}', valid: true, renders: false },
    { label: 'each inverse inside with retains uncertain context', body: '{{#with record.metadata}}{{#each absent}}x{{else}}{{unknown}}{{/each}}{{/with}}', valid: true, renders: false },
    { label: 'with inverse is deferred to render time', body: '{{#with data}}x{{else}}{{unknown}}{{/with}}', valid: true, renders: false },
    { label: 'implicit inverse remains uncertain', body: '{{#data}}x{{else}}{{unknown}}{{/data}}', valid: true, renders: false },
    { label: 'explicit root inside nested blocks', body: '{{#each record.metadata.people}}{{#with details}}{{@root.unknown}}{{/with}}{{/each}}', valid: false, renders: false },
    { label: 'subexpression block context remains uncertain', body: '{{#with (get record "metadata")}}{{unknown}}{{/with}}', valid: true, renders: false },
    { label: 'subexpression arguments checked in outer context', body: '{{#with (get unknown "metadata")}}{{title}}{{/with}}', valid: false, renders: false },
    // Policy rejections: unknown top-level roots in helper/block arguments render as empty, but are rejected.
    { label: 'block arguments checked in outer context (policy)', body: '{{#each unknown}}{{this}}{{/each}}', valid: false, renders: true, output: '' },
    { label: 'conditional argument checked at top level (policy)', body: '{{#if unknown}}Y{{else}}N{{/if}}', valid: false, renders: true, output: 'N' },
    { label: 'unused hash argument checked at top level (policy)', body: '{{concat oid unused=unknown}}', valid: false, renders: true, output: 'OID' },
    { label: 'explicit root in an unreachable branch (policy)', body: '{{#if false}}{{@root.unknown}}{{/if}}', valid: false, renders: true, output: '' },
    { label: 'unregistered helper in an unreachable branch (policy)', body: '{{#if false}}{{nothelper oid}}{{/if}}', valid: false, renders: true, output: '' },
    { label: 'dotted block-param head still evaluates its arguments', body: '{{#with record.metadata as |concat|}}{{concat.title (nothelper oid)}}{{/with}}', valid: false, renders: false },
    { label: 'explicit this at root', body: '{{this.unknown}}', valid: false, renders: false },
    { label: 'explicit dot at root', body: '{{./unknown}}', valid: false, renders: false },
    { label: 'with root this', body: '{{#with this}}{{unknown}}{{/with}}', valid: true, renders: false },
    { label: 'each root this', body: '{{#each this}}{{unknown}}{{/each}}', valid: true, renders: false },
    { label: 'root data escape', body: '{{#with record.metadata}}{{@root.unknown}}{{/with}}', valid: false, renders: false },
    { label: 'parent alias escape', body: '{{#each record.metadata.people as |person|}}{{../person}}{{/each}}', valid: true, renders: false },
    { label: 'parent root ignores alias shadowing', body: '{{#each record.metadata.people as |record|}}{{record.name}}/{{../record.metadata.title}}{{/each}}', valid: true, renders: true, output: 'Reader/Title' },
    { label: 'dot alias escape', body: '{{#with this as |person|}}{{./person}}{{/with}}', valid: true, renders: false },
    { label: 'this alias escape', body: '{{#with this as |person|}}{{this.person}}{{/with}}', valid: true, renders: false },
    // Block params carry no root provenance. Strict mode can also return an
    // empty string for their missing descendants instead of throwing.
    { label: 'root alias missing property deferred', body: '{{#with this as |ctx|}}{{ctx.unknown}}{{/with}}', valid: true, renders: true, output: '' },
    { label: 'root alias passed to with', body: '{{#with this as |ctx|}}{{#with ctx}}{{unknown}}{{/with}}{{/with}}', valid: true, renders: false },
    { label: 'if is deferred to render time', body: '{{#if oid}}{{unknown}}{{/if}}', valid: true, renders: false },
    { label: 'unless is deferred to render time', body: '{{#unless data}}{{unknown}}{{/unless}}', valid: true, renders: false },
    { label: 'each inverse is deferred to render time', body: '{{#each data as |person|}}x{{else}}{{person}}{{/each}}', valid: true, renders: false },
    { label: 'aliases end at program boundary', body: '{{#each record.metadata.people as |person|}}{{person.name}}{{/each}}{{person}}', valid: false, renders: false },
    { label: 'nested parent root escape', body: '{{#each record.metadata.people}}{{#with details}}{{../../unknown}}{{/with}}{{/each}}', valid: true, renders: false },
    { label: 'root data path', body: '{{#with record.metadata}}{{@root.record.metadata.title}}{{/with}}', valid: true, renders: true, output: 'Title' },
    { label: 'dynamic paths with all scope spellings', body: '{{#with record.metadata}}{{title}}/{{this.title}}/{{./title}}/{{../oid}}{{/with}}', valid: true, renders: true, output: 'Title/Title/Title/OID' },
    { label: 'each aliases and data variables', body: '{{#each record.metadata.people as |person index|}}{{person.name}}/{{index}}/{{@index}}/{{@key}}/{{@first}}/{{@last}}/{{../oid}}{{/each}}', valid: true, renders: true, output: 'Reader/0/0/0/true/true/OID' },
    { label: 'nested with and each', body: '{{#with record.metadata}}{{#each people as |person|}}{{#with person.details}}{{role}}/{{../name}}/{{../../title}}/{{../../../oid}}{{/with}}{{/each}}{{/with}}', valid: true, renders: true, output: 'Owner/Reader/Title/OID' },
    { label: 'lexical outer alias in nested program', body: '{{#each record.metadata.people as |person|}}{{#with person.details}}{{person.name}}/{{role}}{{/with}}{{/each}}', valid: true, renders: true, output: 'Reader/Owner' },
    { label: 'parent path uses dynamic parent rather than lexical alias', body: '{{#each record.metadata.people as |person|}}{{#with details}}{{../person}}{{/with}}{{/each}}', valid: true, renders: false },
    { label: 'inner alias shadows outer alias', body: '{{#each record.metadata.people as |person|}}{{#with person.details as |person|}}{{person.role}}{{/with}}{{person.name}}{{/each}}', valid: true, renders: true, output: 'OwnerReader' },
    { label: 'with this preserves parent depth', body: '{{#with record.metadata}}{{#with this}}{{../oid}}{{/with}}{{/with}}', valid: true, renders: true, output: 'OID' },
    { label: 'with alias preserves parent depth', body: '{{#each record.metadata.people as |person|}}{{#with person}}{{../oid}}{{/with}}{{/each}}', valid: true, renders: true, output: 'OID' },
    { label: 'with known identical path preserves depth', body: '{{#with record.metadata}}{{#with @root.record.metadata}}{{../oid}}{{/with}}{{/with}}', valid: true, renders: true, output: 'OID' },
    { label: 'nested each this', body: '{{#each record.metadata.groups}}{{#each this}}{{name}}/{{../../oid}}{{/each}}{{/each}}', valid: true, renders: true, output: 'Reader/OID' },
    { label: 'if and unless retain local context', body: '{{#with record.metadata}}{{#if title}}{{#unless absent}}{{title}}/{{../oid}}{{/unless}}{{/if}}{{/with}}', valid: true, renders: true, output: 'Title/OID' },
    { label: 'helpers as values', body: '{{isEmpty data}}', valid: true, renders: true, output: 'true' },
    { label: 'nested subexpressions and literals', body: '{{#if (and oid (not (isEmpty record.metadata)))}}{{get record "metadata.title"}}{{/if}}', valid: true, renders: true, output: 'Title' },
    { label: 'hash arguments', body: '{{#if oid includeZero=true}}{{record.metadata.title}}{{/if}}', valid: true, renders: true, output: 'Title' },
    { label: 'whitespace control and triple stash', body: ' {{~#with record.metadata~}}{{{title}}}{{~/with~}} ', valid: true, renders: true, output: 'Title' },
    { label: 'bare context-changing block', body: '{{#record.metadata.people}}{{this.name}}{{/record.metadata.people}}', valid: true, renders: true, output: 'Reader' },
    { label: 'dynamic missing key deferred to render', body: '{{#with record.metadata}}{{missingValue}}{{/with}}', valid: true, renders: false },
    { label: 'quoted helper', body: '{{"get" record "metadata.title"}}', valid: true, renders: true, output: 'Title' },
    { label: 'quoted block helper', body: '{{#"with" record.metadata}}{{title}}/{{../oid}}{{/"with"}}', valid: true, renders: true, output: 'Title/OID' },
    { label: 'quoted each helper', body: '{{#"each" record.metadata.people as |person|}}{{person.name}}/{{../oid}}{{/"each"}}', valid: true, renders: true, output: 'Reader/OID' },
    { label: 'quoted subexpression helper', body: '{{#with ("get" record "metadata")}}{{title}}{{/with}}', valid: true, renders: true, output: 'Title' },
    { label: 'quoted with has uncertain context', body: '{{#"with" this}}{{unknown}}{{/"with"}}', valid: true, renders: false },
    { label: 'quoted conditional is deferred to render time', body: '{{#"if" oid}}{{unknown}}{{/"if"}}', valid: true, renders: false },
    { label: 'quoted unregistered helper', body: '{{"unregistered" record}}', valid: false, renders: false },
    { label: 'quoted unregistered subexpression', body: '{{get ("unregistered" record) "title"}}', valid: false, renders: false },
  ];

  for (const scenario of scopeCases) {
    it(`compares policy validation with strict Handlebars: ${scenario.label}`, () => {
      const data = { oid: 'OID', data: [], record: { metadata: { title: 'Title', enabled: true,
        people: [{ name: 'Reader', details: { role: 'Owner' } }], groups: [[{ name: 'Reader' }]] } } };
      const validate = () => validateEmailTemplate(content(scenario.body));
      const render = () => handlebarsInstance().compile(scenario.body, { strict: true })(data);
      if (scenario.valid) assert.doesNotThrow(validate);
      else assert.throws(validate, { code: 'INVALID_TEMPLATE' });
      if (scenario.renders) assert.equal(render(), scenario.output);
      else assert.throws(render);
    });
  }

  it('accepts lexical block-param heads, ignores their arguments, and honours a param named root', () => {
    const handlebars = handlebarsInstance();
    const data = { oid: 'OID', record: { metadata: { title: 'Title', enabled: true } } };
    // Each case renders under strict Handlebars, so save-time validation must accept it.
    for (const [body, rendered] of [
      ['{{#with record.metadata.title as |get|}}{{concat (get) "!"}}{{/with}}', 'Title!'],
      ['{{#with record.metadata.title as |get|}}{{concat (@get) "!"}}{{/with}}', 'Title!'],
      ['{{#with record.metadata.title as |get|}}{{get unused=@root.unknown}}{{/with}}', 'Title'],
      ['{{#with record.metadata.title as |get|}}{{get @root.unknown}}{{/with}}', 'Title'],
      ['{{#with record.metadata as |root|}}{{@root.enabled}}{{/with}}', 'true'],
    ]) {
      assert.equal(handlebars.compile(body, { strict: true })(data), rendered, body);
      assert.doesNotThrow(() => validateEmailTemplate(content(body)), body);
    }
    // Unregistered helper calls are still rejected when no block param shadows them.
    assert.throws(() => validateEmailTemplate(content('{{concat (nothelper) "!"}}')), { code: 'INVALID_TEMPLATE' });
    // No helper is trusted to preserve context, so paths inside any block are left to
    // strict rendering, whether or not `if` has been replaced.
    const deferred = '{{#if record}}{{unknownRoot}}{{/if}}';
    assert.doesNotThrow(() => validateEmailTemplate(content(deferred)));
    assert.throws(() => handlebars.compile(deferred, { strict: true })(data));
    // Top-level and @root paths are still checked.
    assert.throws(() => validateEmailTemplate(content('{{unknownRoot}}')), { code: 'INVALID_TEMPLATE' });
    assert.throws(() => validateEmailTemplate(content('{{#if record}}{{@root.unknownRoot}}{{/if}}')), { code: 'INVALID_TEMPLATE' });
  });

  it('defers both branches of custom block helpers, including built-in replacements', () => {
    const handlebars = handlebarsInstance();
    const originalIf = handlebars.helpers.if;
    handlebars.registerHelper('displayContext', function (value, options) {
      return options.fn(value) + options.inverse(value);
    });
    try {
      const body = '{{#displayContext record.metadata}}{{localTitle}}{{else}}{{localTitle}}{{/displayContext}}';
      assert.doesNotThrow(() => validateEmailTemplate(content(body)));
      assert.equal(handlebars.compile(body, { strict: true })({ record: { metadata: { localTitle: 'Local' } } }), 'LocalLocal');
      for (const branch of ['{{@root.unknown}}', '{{unknown oid}}', '{{> footer}}', '{{*inline "x"}}']) {
        for (const body of [`{{#displayContext record}}${branch}{{/displayContext}}`,
          `{{#displayContext record}}x{{else}}${branch}{{/displayContext}}`]) {
          assert.throws(() => validateEmailTemplate(content(body)), { code: 'INVALID_TEMPLATE' });
        }
      }
      handlebars.registerHelper('if', handlebars.helpers.displayContext);
      for (const body of ['{{#if record.metadata}}{{localTitle}}{{else}}{{localTitle}}{{/if}}',
        '{{#unless record.metadata}}{{localTitle}}{{else}}{{localTitle}}{{/unless}}']) {
        assert.doesNotThrow(() => validateEmailTemplate(content(body)));
        assert.equal(handlebars.compile(body, { strict: true })({ record: { metadata: { localTitle: 'Local' } } }), 'LocalLocal');
      }
    } finally {
      handlebars.registerHelper('if', originalIf);
      handlebars.unregisterHelper('displayContext');
    }
  });

  it('normalizes every Handlebars literal helper head and still rejects unregistered names', () => {
    const handlebars = handlebarsInstance();
    for (const name of ['true', 'false', '42', '0', 'null', 'undefined']) {
      const body = `{{${name} record}}/{{get (${name} record) "title"}}`;
      assert.throws(() => validateEmailTemplate(content(body)), { code: 'INVALID_TEMPLATE' });
      assert.throws(() => handlebars.compile(body, { strict: true })({ record: {} }));
      handlebars.registerHelper(name, () => ({ title: 'Value', toString: () => 'Value' }));
      try {
        assert.doesNotThrow(() => validateEmailTemplate(content(body)));
        assert.equal(handlebars.compile(body, { strict: true })({ record: {} }), 'Value/Value');
      } finally {
        handlebars.unregisterHelper(name);
      }
    }
  });

  it('accepts registered helpers without arguments as values', () => {
    const handlebars = handlebarsInstance();
    handlebars.registerHelper('displayGreeting', () => 'Hello');
    try {
      for (const body of ['{{displayGreeting}}', '{{"displayGreeting"}}', '{{get (displayGreeting) "length"}}']) {
        assert.doesNotThrow(() => validateEmailTemplate(content(body)));
        assert.equal(handlebars.compile(body, { strict: true })({}), body.includes('get') ? '5' : 'Hello');
      }
    } finally {
      handlebars.unregisterHelper('displayGreeting');
    }
  });

  it('never retains source in validation errors or untrusted exception names/codes', () => {
    for (const field of ['subject', 'body']) {
      for (const source of ['{{[PRIVATE BODY: contact Alice about case 123]}}', '{{"PRIVATE SUBJECT" record}}',
        '{{get ("PRIVATE BODY" record) "title"}}', 'PRIVATE BODY {{#if oid}}', '{{> [PRIVATE BODY]}}']) {
        assert.throws(() => validateEmailTemplate({ ...content('Body'), [field]: source }), (error: any) => {
          assert.ok(error instanceof EmailTemplateError);
          assert.equal(error.cause, undefined);
          assert.deepEqual(Object.keys(error.diagnostic!).sort(), ['column', 'field', 'line', 'reason']);
          assert.ok(!inspect(error).includes('PRIVATE'));
          return true;
        });
      }
    }
    const error = safeEmailTemplateError('RENDER_FAILED', 'Unable to render email template.',
      { name: 'PRIVATE SUBJECT', code: 'PRIVATE BODY', lineNumber: 2, column: 3 });
    assert.equal(error.message, 'Unable to render email template. (line 2, column 3)');
    assert.equal(error.cause, undefined);
  });

  it('notes real sanitisation removals without flagging unchanged or normalized HTML', async () => {
    const chronicle = sinon.spy(email as any, 'updateChronicle');
    for (const [source, expected] of [['<p>Hello</p>', '<p>Hello</p>'],
      ["<P title='Hello'>Hello<BR/></P>", '<p title="Hello">Hello<br></p>'],
      ['<table><tr><td>Hello</td></tr></table>', '<table><tbody><tr><td>Hello</td></tr></tbody></table>']]) {
      assert.deepEqual(sanitizer.sanitizeEmail(source), { sanitized: expected, removed: false });
      await firstValueFrom(email.sendMessage('to@example.com', source, 'Subject'));
      assert.equal(chronicle.calledWithMatch({ emailSanitisationRemovedMarkup: true }), false);
    }
    for (const source of ['<p>Hello<script>alert(1)</script></p>', '<p onclick="alert(1)">Hello</p>',
      '<p data-private="value">Hello</p>', '<body onload="alert(1)"><p>Hello</p></body>']) {
      assert.deepEqual(sanitizer.sanitizeEmail(source), { sanitized: '<p>Hello</p>', removed: true });
      chronicle.resetHistory();
      await firstValueFrom(email.sendMessage('to@example.com', source, 'Subject'));
      assert.equal(chronicle.calledWithMatch({ emailSanitisationRemovedMarkup: true }), true);
    }
  });

  it('validates additional roots and length configuration during bootstrap validation', () => {
    for (const roots of [null, 'scuEmail', [null], ['bad.path'], ['__proto__'], ['']]) {
      mockSails.config.emailnotification.settings.additionalContextRoots = roots;
      assert.throws(() => email.validateExposedConfig(), { code: 'INVALID_TEMPLATE' });
    }
    mockSails.config.emailnotification.settings.additionalContextRoots = [];
    for (const limit of [null, 0, -1, '100', 1.5, Infinity]) {
      mockSails.config.emailnotification.settings.maxBodyBytes = limit;
      assert.throws(() => email.validateExposedConfig(), { code: 'INVALID_TEMPLATE' });
    }
  });

  it('strips unsafe HTML on send and keeps formatting, tables, inline styles, links and remote images from any host', async () => {
    const chronicle = sinon.spy(email as any, 'updateChronicle');
    const html = '<script>PRIVATE BODY</script><style>body{color:red}</style><iframe src="https://evil.test"></iframe>' +
      '<object>x</object><embed src="https://evil.test"><form><input><button>send</button></form>' +
      '<h1>Heading</h1><ul><li>Item</li></ul><table style="border-collapse:collapse"><tr><td style="color:red">Cell</td></tr></table>' +
      '<a href="https://example.com">https</a><a href="http://example.com">http</a><a href="mailto:a@example.com">mail</a>' +
      '<img src="https://external.institution.test/logo.png" onerror="PRIVATE BODY" alt="Logo">' +
      '<img src="http://other.test/logo.png"><a href="javascript:alert(1)" onclick="alert(1)">bad</a>' +
      '<a href="vbscript:alert(1)">bad</a><a href="data:text/html,evil">bad</a>' +
      '<img src="data:image/png;base64,evil"><img src="mailto:a@example.com"><img src="//other.test/x">' +
      '<a href="/relative">relative</a><img src="jav&#x61;script:alert(1)">' +
      '<p style="background:url(data:text/html,evil)">css</p><p style="width:expression(alert(1))">css</p>' +
      '<p style="background:image-set(\'data:image/png;base64,evil\' 1x)">css</p>';
    assert.equal((await firstValueFrom(email.sendMessage('to@example.com', html, 'PRIVATE SUBJECT'))).success, true);
    const result = sendMail.firstCall.args[0].html;
    assert.doesNotMatch(result, /script|<style|iframe|object|embed|<form|input|button|onerror|onclick|javascript:|data:|vbscript:|expression\(/i);
    for (const expected of ['<h1>Heading</h1>', '<ul><li>Item</li></ul>', '<table', '<td style="color:red">',
      'style="border-collapse:collapse"', 'https://external.institution.test/logo.png', 'http://other.test/logo.png',
      'href="https://example.com"', 'href="http://example.com"', 'href="mailto:a@example.com"']) assert.ok(result.includes(expected), expected);
    assert.ok(chronicle.calledWithMatch({ emailSanitisationRemovedMarkup: true }));
    assert.ok(!JSON.stringify(chronicle.args).includes('PRIVATE'));
  });

  it('uses the actual sanitizer for supplied and override HTML, with triple-stash retained', async () => {
    const source = '<p>{{{data}}}</p>';
    writeFileSync(join(directory, 'notice.hbs'), source);
    const data = { data: '<img src="https://institution.test/x" onerror="alert(1)">' };
    await email.sendTemplate('to@example.com', undefined, 'notice', data);
    (global as any).EmailTemplateService = { resolve: async () => ({ ...content(source), source: 'override' }) };
    try { await email.sendTemplate('to@example.com', undefined, 'notice', data, { brandId: 'a' }); }
    finally { delete (global as any).EmailTemplateService; }
    assert.equal(sendMail.callCount, 2);
    for (const call of sendMail.getCalls()) assert.equal(call.args[0].html, '<p><img src="https://institution.test/x"></p>');
  });

  it('fails closed for a missing email profile or sanitizer exception without logging content', async () => {
    const chronicle = sinon.spy(email as any, 'updateChronicle');
    const sanitize = sinon.stub(sanitizer, 'sanitizeEmail').throws(new Error('PRIVATE BODY PRIVATE SUBJECT'));
    await assert.rejects(firstValueFrom(email.sendMessage('to@example.com', 'PRIVATE BODY', 'PRIVATE SUBJECT')), { code: 'SANITISATION_FAILED' });
    assert.equal(sendMail.callCount, 0);
    delete mockSails.config.dompurify.profiles.email;
    sanitize.resetHistory();
    await assert.rejects(firstValueFrom(email.sendMessage('to@example.com', 'PRIVATE BODY', 'PRIVATE SUBJECT')), { code: 'SANITISATION_FAILED' });
    assert.equal(sanitize.callCount, 0);
    assert.throws(() => SanitizerServices.DomSanitizer.prototype.sanitizeEmail.call(sanitizer, 'Body'), /email profile/);
    assert.ok(!JSON.stringify(chronicle.args).includes('PRIVATE'));
    assert.equal(sendMail.callCount, 0);
  });

  it('returns the existing HTTP failure envelope when delivery sanitisation fails', async () => {
    writeFileSync(join(directory, 'notice.hbs'), '<p>Body</p>');
    (global as any).BrandingService = { getBrand: () => ({ id: 'a' }) };
    (global as any).EmailTemplateService = { resolve: async () => ({
      ...content('<p>Body</p>'), source: 'default', fileName: 'notice',
    }) };
    delete mockSails.config.dompurify.profiles.email;
    const controller = new EmailControllers.Email();
    (controller as any).emailService = email;
    const respond = sinon.stub(controller as any, 'sendResp');
    await new Promise<void>(resolve => {
      respond.callsFake(() => resolve());
      controller.sendNotification({ options: { locals: { branding: 'a' } },
        apiRequest: { body: { to: 'to@example.com', template: 'notice' } } } as any, {} as Sails.Res);
    });
    assert.equal(respond.lastCall.args[2].status, 500);
    assert.equal(respond.lastCall.args[2].chronicle.emailErrorCode, 'SANITISATION_FAILED');
    assert.equal(sendMail.callCount, 0);
  });

  it('keeps rendering diagnostics free of subject/body excerpts on syntax and strict-data failures', async () => {
    const chronicle = sinon.spy(email as any, 'updateChronicle');
    for (const body of ['PRIVATE BODY {{#if oid}}', 'PRIVATE BODY {{missing.value}}']) {
      writeFileSync(join(directory, 'notice.hbs'), body);
      const result = await firstValueFrom(email.buildFromTemplate('notice', {}, { subject: 'PRIVATE SUBJECT' }));
      assert.equal(result.status, 500);
    }
    assert.ok(!JSON.stringify(chronicle.args).includes('PRIVATE'));
  });

  it('leaves text bodies untouched, even without a sanitizer/profile, and strips subject controls', async () => {
    delete mockSails.config.dompurify;
    const sanitize = sinon.spy(sanitizer, 'sanitizeEmail');
    const body = '<script>plain text</script>\n<img src="data:...">';
    await firstValueFrom(email.sendMessage('to@example.com', body, 'A\r\nB\u0000\tC\u007f\u0085\u2028\u2029D', undefined, 'text'));
    assert.equal(sendMail.firstCall.args[0].subject, 'ABCD');
    assert.equal(sendMail.firstCall.args[0].text, body);
    assert.equal(sanitize.callCount, 0);
    writeFileSync(join(directory, 'notice.hbs'), 'Body');
    const result = await firstValueFrom(email.buildFromTemplate('notice', { name: 'A\r\nB' }, { subject: '{{{name}}}' }));
    assert.equal(result.subject, 'AB');
  });

  it('enforces UTF-8 source and rendered limits for subjects and bodies and direct sends', async () => {
    const settings = mockSails.config.emailnotification.settings;
    settings.maxSubjectBytes = 20; settings.maxBodyBytes = 30;
    for (const [field, bytes] of [['subject', 20], ['body', 30]] as const) {
      assert.throws(() => validateEmailTemplate({ ...content('Body'), [field]: 'é'.repeat(bytes / 2 + 1) }), { code: 'LENGTH_LIMIT' });
      assert.doesNotThrow(() => validateEmailTemplate({ ...content('Body'), [field]: 'x'.repeat(bytes) }));
    }
    writeFileSync(join(directory, 'notice.hbs'), '{{{data}}}');
    for (const [data, context] of [[{ data: 'x'.repeat(31) }, {}], [{ data: 'Body', name: 'x'.repeat(21) }, { subject: '{{{name}}}' }]] as const) {
      const result = await firstValueFrom(email.buildFromTemplate('notice', data, context));
      assert.equal((result.ex as EmailTemplateError).code, 'LENGTH_LIMIT');
    }
    await assert.rejects(firstValueFrom(email.sendMessage('to@example.com', 'x'.repeat(31), 'Subject')), { code: 'LENGTH_LIMIT' });
    await assert.rejects(firstValueFrom(email.sendMessage('to@example.com', 'Body', 'x'.repeat(21))), { code: 'LENGTH_LIMIT' });
    assert.equal(sendMail.callCount, 0);
  });
});
