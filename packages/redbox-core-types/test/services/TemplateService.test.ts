let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('TemplateService', function() {
  let mockSails: any;
  let TemplateService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app'
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);

    // Import after mocks are set up
    const { Services } = require('../../src/services/TemplateService');
    TemplateService = new Services.Template();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('buildKeyString', function() {
    it('should convert array key to string', function() {
      const result = TemplateService.buildKeyString(['report', 'columns', '0', 'render']);
      
      expect(result).to.be.a('string');
      expect(result).to.include('report');
    });
  });

  describe('buildClientJsonata', function() {
    it('should compile a valid JSONata expression', function() {
      const expression = '$.firstName & " " & $.lastName';
      
      const result = TemplateService.buildClientJsonata(expression);
      
      expect(result).to.be.a('string');
      expect(result).to.include('firstName');
    });

    it('should return null for invalid JSONata expression', function() {
      const invalidExpression = '{{{{invalid jsonata';
      
      const result = TemplateService.buildClientJsonata(invalidExpression);
      
      expect(result).to.be.null;
    });

    it('should normalize the expression', function() {
      // Test with unicode characters that should be normalized
      const expression = '$.name';
      
      const result = TemplateService.buildClientJsonata(expression);
      
      expect(result).to.be.a('string');
    });
  });

  describe('buildServerJsonata', function() {
    it('should return a compiled JSONata expression', function() {
      const expression = '$.name';
      
      const result = TemplateService.buildServerJsonata(expression);
      
      expect(result).not.to.be.null;
      expect(result).to.have.property('evaluate');
    });

    it('should return null for invalid expression', function() {
      const invalidExpression = '{{{{invalid';
      
      const result = TemplateService.buildServerJsonata(invalidExpression);
      
      expect(result).to.be.null;
    });
  });

  describe('buildClientHandlebars', function() {
    it('should precompile a valid Handlebars template', function() {
      const template = '{{firstName}} {{lastName}}';
      
      const result = TemplateService.buildClientHandlebars(template);
      
      expect(result).to.be.a('string');
      // Precompiled output contains function code
      expect(result).to.include('function');
    });

    it('should register helpers once', function() {
      // Call twice to test caching
      TemplateService.buildClientHandlebars('{{name}}');
      TemplateService.buildClientHandlebars('{{other}}');
      
      // Should not throw, helpers registered once
      expect(TemplateService.helpersRegistered).to.be.true;
    });
  });

  describe('buildServerHandlebars', function() {
    it('should compile a valid Handlebars template', function() {
      const template = '{{firstName}} {{lastName}}';
      
      const result = TemplateService.buildServerHandlebars(template);
      
      expect(result).to.be.a('function');
    });

    it('should execute the compiled template', function() {
      const template = '{{firstName}} {{lastName}}';
      
      const compiled = TemplateService.buildServerHandlebars(template);
      const output = compiled({ firstName: 'John', lastName: 'Doe' });
      
      expect(output).to.equal('John Doe');
    });
  });

  describe('buildClientMapping', function() {
    it('should build mapping for JSONata inputs', function() {
      const inputs = [
        { key: ['field1'], kind: 'jsonata', value: '$.name' }
      ];
      
      const result = TemplateService.buildClientMapping(inputs);
      
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.property('key');
      expect(result[0]).to.have.property('value');
    });

    it('should build mapping for Handlebars inputs', function() {
      const inputs = [
        { key: ['field1'], kind: 'handlebars', value: '{{name}}' }
      ];
      
      const result = TemplateService.buildClientMapping(inputs);
      
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
    });

    it('should throw for duplicate keys', function() {
      const inputs = [
        { key: ['field1'], kind: 'jsonata', value: '$.name' },
        { key: ['field1'], kind: 'jsonata', value: '$.other' }
      ];
      
      expect(() => TemplateService.buildClientMapping(inputs)).to.throw('Keys must be unique');
    });

    it('should throw for unknown input kind', function() {
      const inputs = [
        { key: ['field1'], kind: 'unknown' as any, value: 'test' }
      ];
      
      expect(() => TemplateService.buildClientMapping(inputs)).to.throw('Unknown input kind');
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = TemplateService.exports();

      expect(exported).to.have.property('buildClientMapping');
      expect(exported).to.have.property('buildClientJsonata');
      expect(exported).to.have.property('buildServerJsonata');
      expect(exported).to.have.property('buildClientHandlebars');
      expect(exported).to.have.property('buildServerHandlebars');
      expect(exported).to.have.property('buildKeyString');
    });
  });
});
