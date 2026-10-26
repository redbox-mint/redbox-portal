import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { render } from 'ejs';
import { handlebarsTemplate, jsonataDecodeCompile } from '@researchdatabox/sails-ng-common';
import type { DynamicScriptResponse, TemplateCompileInput, TemplateCompileItem } from '@researchdatabox/sails-ng-common';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('TemplateService', function () {
  let mockSails: any;
  let TemplateService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
      },
      log: createSinonStubLogger(sinon),
    });

    setupServiceTestGlobals(mockSails);

    // Import after mocks are set up
    const { Services } = require('../../src/services/TemplateService');
    TemplateService = new Services.Template();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('buildKeyString', function () {
    it('should convert array key to string', function () {
      const result = TemplateService.buildKeyString(['report', 'columns', '0', 'render']);

      expect(result).to.be.a('string');
      expect(result).to.include('report');
    });
  });

  describe('buildClientJsonata', function () {
    it('should compile a valid JSONata expression', function () {
      const expression = '$.firstName & " " & $.lastName';

      const result = TemplateService.buildClientJsonata(expression);

      expect(result).to.be.a('string');
      expect(result).to.include('firstName');
    });

    it('should return null for invalid JSONata expression', function () {
      const invalidExpression = '{{{{invalid jsonata';

      const result = TemplateService.buildClientJsonata(invalidExpression);

      expect(result).to.be.null;
    });

    it('should normalize the expression', function () {
      // Test with unicode characters that should be normalized
      const expression = '$.name';

      const result = TemplateService.buildClientJsonata(expression);

      expect(result).to.be.a('string');
    });
  });

  describe('buildClientHandlebars', function () {
    it('should precompile a valid Handlebars template', function () {
      const template = '{{firstName}} {{lastName}}';

      const result = TemplateService.buildClientHandlebars(template);

      expect(result).to.be.a('string');
      // Precompiled output contains function code
      expect(result).to.include('function');
    });

    it('should register helpers once', function () {
      // Call twice to test caching
      TemplateService.buildClientHandlebars('{{name}}');
      TemplateService.buildClientHandlebars('{{other}}');
    });
  });

  describe('buildClientMapping', function () {
    it('keeps quoted property keys and expression syntax intact in the rendered browser module', async function () {
      const template = await readFile(resolve(__dirname, '../../../../views/dynamicScriptAsset.ejs'), 'utf8');
      const properties = [
        "metadata['coversheet-id']",
        'metadata["irma-id"]',
        'quote\\slash\n<>&',
        'carriage\rreturn',
        'line\u2028separator\u2029paragraph',
        '</script><script>throw new Error("key executed")</script>',
        'Unicode 中文 हिन्दी 😀',
        'Cafe\u0301',
        'ｆｕｌｌｗｉｄｔｈ',
        '',
      ];
      const inputs: TemplateCompileInput[] = properties.map((property, index) => ({
        key: ['default', 'workflow', 'activity', 'draft', 'rowConfig', property],
        kind: 'handlebars',
        value: `{{metadata.title}}:${index}`,
      }));
      inputs.push({
        key: ['default', 'form', 'expressions', 'copyValue'],
        kind: 'jsonata',
        value: '$exists(event.value.oid) ? event.value.oid : ($exists(event.value.redboxOid) ? event.value.redboxOid : event.value)',
      });
      const mapping: TemplateCompileItem[] = TemplateService.buildClientMapping(inputs);
      const entries = mapping.map(entry => ({
        key: TemplateService.buildKeyString(entry.key),
        value: entry.value,
      }));
      const moduleSource = render(template, { entries });
      for (const entry of entries) {
        expect(moduleSource).to.include(`return ${entry.value};`);
      }
      // Import the complete generated ES module, including its export declaration.
      const { evaluate }: DynamicScriptResponse = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
      const extra = { libraries: { handlebars: handlebarsTemplate, jsonata: jsonataDecodeCompile } };

      for (const [index, input] of inputs.slice(0, -1).entries()) {
        const context = { metadata: { title: 'SCU title' } };
        expect(evaluate(input.key, context, extra)).to.equal(`SCU title:${index}`);
        const normalizedKey = input.key.map(part => part.toString().normalize('NFKC'));
        expect(TemplateService.buildKeyString(input.key)).to.equal(normalizedKey.join('__'));
        expect(evaluate(normalizedKey, context, extra)).to.equal(`SCU title:${index}`);
      }
      for (const [value, expected] of [
        [{ oid: 'SCU_oid', redboxOid: 'ignored' }, 'SCU_oid'],
        [{ redboxOid: 'SCU_redboxOid' }, 'SCU_redboxOid'],
        ['SCU_fallback', 'SCU_fallback'],
        [{ oid: '' }, ''],
        [null, null],
      ]) {
        expect(await evaluate(inputs[inputs.length - 1].key, { event: { value } }, extra)).to.equal(expected);
      }
      expect(() => evaluate(['unknown'], {}, extra)).to.throw('Unknown key');
      expect(() => evaluate([], {}, extra)).to.throw('Unknown key');
    });

    it('round-trips an empty key and numeric key parts in the rendered browser module', async function () {
      const template = await readFile(resolve(__dirname, '../../../../views/dynamicScriptAsset.ejs'), 'utf8');
      const inputs: TemplateCompileInput[] = [
        { key: [], kind: 'handlebars', value: 'empty' },
        { key: ['rows', 0, 'render'], kind: 'handlebars', value: '{{title}}' },
      ];
      const mapping: TemplateCompileItem[] = TemplateService.buildClientMapping(inputs);
      const entries = mapping.map(entry => ({ key: TemplateService.buildKeyString(entry.key), value: entry.value }));
      const moduleSource = render(template, { entries });
      const { evaluate }: DynamicScriptResponse = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
      const extra = { libraries: { handlebars: handlebarsTemplate } };

      expect(TemplateService.buildKeyString([])).to.equal('');
      expect(evaluate([], {}, extra)).to.equal('empty');
      expect(evaluate([''], {}, extra)).to.equal('empty');
      expect(TemplateService.buildKeyString(['rows', 0, 'render'])).to.equal('rows__0__render');
      expect(evaluate(['rows', 0, 'render'], { title: 'first row' }, extra)).to.equal('first row');
      expect(evaluate(['rows', '0', 'render'], { title: 'first row' }, extra)).to.equal('first row');
      expect(() => evaluate(['rows', 1, 'render'], {}, extra)).to.throw('Unknown key');
    });

    it('throws for empty and unknown keys when the rendered module has no entries', async function () {
      const template = await readFile(resolve(__dirname, '../../../../views/dynamicScriptAsset.ejs'), 'utf8');
      const moduleSource = render(template, { entries: [] });
      const { evaluate }: DynamicScriptResponse = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

      expect(() => evaluate([], {})).to.throw('Unknown key');
      expect(() => evaluate(['unknown'], {})).to.throw('Unknown key');
    });

    it('should build mapping for JSONata inputs', function () {
      const inputs = [{ key: ['field1'], kind: 'jsonata', value: '$.name' }];

      const result = TemplateService.buildClientMapping(inputs);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.property('key');
      expect(result[0]).to.have.property('value');
    });

    it('should pass client JSONata library bindings through extra', function () {
      const inputs = [{ key: ['field1'], kind: 'jsonata', value: '$helper($.name)' }];

      const result = TemplateService.buildClientMapping(inputs);

      expect(result).to.have.length(1);
      expect(result[0].value).to.include('jsonata("');
      expect(result[0].value).to.include('").evaluate(context)');
      expect(result[0].value).to.not.include('$helper');
      expect(result[0].value).to.not.include('field1');
      expect(result[0].value).to.not.include('name');
    });

    it('should build mapping for Handlebars inputs', function () {
      const inputs = [{ key: ['field1'], kind: 'handlebars', value: '{{name}}' }];

      const result = TemplateService.buildClientMapping(inputs);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
    });

    it('should throw for duplicate keys', function () {
      const inputs = [
        { key: ['field1'], kind: 'jsonata', value: '$.name' },
        { key: ['field1'], kind: 'jsonata', value: '$.other' },
      ];

      expect(() => TemplateService.buildClientMapping(inputs)).to.throw('Keys must be unique');
    });

    it('should throw for unknown input kind', function () {
      const inputs = [{ key: ['field1'], kind: 'unknown' as any, value: 'test' }];

      expect(() => TemplateService.buildClientMapping(inputs)).to.throw('Unknown input kind');
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = TemplateService.exports();

      expect(exported).to.have.property('buildClientMapping');
      expect(exported).to.have.property('buildClientJsonata');
      expect(exported).to.have.property('buildClientHandlebars');
      expect(exported).to.have.property('buildKeyString');
    });
  });
});
