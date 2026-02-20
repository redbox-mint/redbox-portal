let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import fs from 'fs';
import fse from 'fs-extra';

describe('SassCompilerService', function() {
  let mockSails: any;
  let SassCompilerService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        branding: {
          variableAllowList: ['color', 'font']
        }
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

    const { Services } = require('../../src/services/SassCompilerService');
    SassCompilerService = new Services.SassCompiler();

    // Stub fs methods after require
    // We use callThrough for readFileSync to avoid breaking ts-node/typescript compilation
    if ((fs.readFileSync as any).restore) (fs.readFileSync as any).restore();
    sinon.stub(fs, 'readFileSync').callThrough();
    
    if ((fs.writeFileSync as any).restore) (fs.writeFileSync as any).restore();
    sinon.stub(fs, 'writeFileSync'); // No callThrough for write, we don't want to write
    
    if ((fse.mkdirpSync as any).restore) (fse.mkdirpSync as any).restore();
    sinon.stub(fse, 'mkdirpSync');
    
    if ((fse.removeSync as any).restore) (fse.removeSync as any).restore();
    sinon.stub(fse, 'removeSync');
    
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    if ((fs.readFileSync as any).restore) (fs.readFileSync as any).restore();
    if ((fs.writeFileSync as any).restore) (fs.writeFileSync as any).restore();
    if ((fse.mkdirpSync as any).restore) (fse.mkdirpSync as any).restore();
    if ((fse.removeSync as any).restore) (fse.removeSync as any).restore();
    sinon.restore();
  });

  describe('getWhitelist', function() {
    it('should return allow list from config', function() {
      const whitelist = SassCompilerService.getWhitelist();
      expect(whitelist).to.deep.equal(['color', 'font']);
    });

    it('should return empty array if config missing', function() {
      mockSails.config.branding = {};
      const whitelist = SassCompilerService.getWhitelist();
      expect(whitelist).to.deep.equal([]);
    });
  });

  describe('normaliseHex', function() {
    it('should normalise hex colors', function() {
      expect(SassCompilerService.normaliseHex('#FFF')).to.equal('#ffffff');
      expect(SassCompilerService.normaliseHex('#123')).to.equal('#112233');
      expect(SassCompilerService.normaliseHex('#FFFFFF')).to.equal('#ffffff');
      expect(SassCompilerService.normaliseHex(' #FFFFFF ')).to.equal('#ffffff');
    });

    it('should leave non-hex values alone', function() {
      expect(SassCompilerService.normaliseHex('red')).to.equal('red');
      expect(SassCompilerService.normaliseHex('rgb(0,0,0)')).to.equal('rgb(0,0,0)');
    });
  });

  describe('buildRootScss', function() {
    it('should inject overrides', function() {
      const originalScss = `
        $var: 1;
        @import "default-variables";
        @import "other";
      `;
      (fs.readFileSync as any).returns(originalScss);
      
      const overrides = ['$new-var: 2;'];
      const result = SassCompilerService.buildRootScss(overrides);
      
      expect(result).to.include('$new-var: 2;');
      expect(result).to.include('@import "default-variables";');
    });
    
    it('should resolve tilde imports', function() {
      const originalScss = '@import "~package/style";';
      (fs.readFileSync as any).returns(originalScss);
      
      const result = SassCompilerService.buildRootScss([]);
      
      expect(result).to.include('@import "package/style";');
    });
  });

  describe('compile', function() {
    it('should throw error for invalid variables', async function() {
      const variables = { 'invalid-var': 'value' };
      
      try {
        await SassCompilerService.compile(variables);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Invalid variable(s)');
      }
    });

    it('should throw error for invalid characters in value', async function() {
      const variables = { 'color': 'red; hack' }; // whitelist has 'color'
      
      try {
        await SassCompilerService.compile(variables);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Invalid characters');
      }
    });
  });
});
