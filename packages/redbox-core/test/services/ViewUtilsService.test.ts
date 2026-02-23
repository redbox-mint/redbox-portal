let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('ViewUtilsService', function() {
  let ViewUtilsService: any;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app'
      },
      log: {
        debug: sinon.stub()
      }
    });
    setupServiceTestGlobals(mockSails);
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('displayValue', function() {
    let viewUtils: any;

    beforeEach(function() {
      // Import after globals are set up
      const { Services } = require('../../src/services/ViewUtilsService');
      viewUtils = new Services.ViewUtils();
    });

    it('should return default value when key path is not found', function() {
      const req = {
        options: {
          locals: {}
        }
      };
      
      const result = viewUtils.displayValue('user.name', req, 'defaultName');
      expect(result).to.equal('defaultName');
    });

    it('should return value from request locals for simple key', function() {
      const req = {
        options: {
          locals: {
            username: 'testuser'
          }
        }
      };
      
      const result = viewUtils.displayValue('username', req, 'default');
      expect(result).to.equal('testuser');
    });

    it('should return default value when intermediate key is null', function() {
      const req = {
        options: {
          locals: {
            user: null
          }
        }
      };
      
      const result = viewUtils.displayValue('user.name', req, 'defaultName');
      expect(result).to.equal('defaultName');
    });

    it('should return empty string as default when no default specified', function() {
      const req = {
        options: {
          locals: {}
        }
      };
      
      const result = viewUtils.displayValue('nonexistent', req);
      expect(result).to.equal('');
    });
  });

  describe('resolvePartialPath', function() {
    let viewUtils: any;
    let existsSyncStub: sinon.SinonStub;

    beforeEach(function() {
      const fs = require('fs');
      existsSyncStub = sinon.stub(fs, 'existsSync').returns(false);
      
      const { Services } = require('../../src/services/ViewUtilsService');
      viewUtils = new Services.ViewUtils();
    });

    afterEach(function() {
      existsSyncStub.restore();
    });

    it('should return original value when URL has 2 or fewer segments', function() {
      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'default',
        'portal',
        '/app/views/template.ejs',
        false
      );
      
      expect(result).to.equal('partial.ejs');
    });

    it('should check branding/portal specific path first', function() {
      existsSyncStub.callsFake((path: string) => {
        return path === '/app/views/mybrand/myportal/partial.ejs';
      });

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        '/app/views/mybrand/myportal/pages/template.ejs',
        false
      );
      
      expect(result).to.include('mybrand/myportal/partial.ejs');
      expect(existsSyncStub.calledWith('/app/views/mybrand/myportal/partial.ejs')).to.be.true;
    });

    it('should fallback to default branding with specific portal', function() {
      existsSyncStub.callsFake((path: string) => {
        return path === '/app/views/default/myportal/partial.ejs';
      });

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        '/app/views/mybrand/myportal/pages/template.ejs',
        false
      );
      
      expect(result).to.include('default/myportal/partial.ejs');
    });

    it('should fallback to default/default path', function() {
      existsSyncStub.callsFake((path: string) => {
        return path === '/app/views/default/default/partial.ejs';
      });

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        '/app/views/mybrand/myportal/pages/template.ejs',
        false
      );
      
      expect(result).to.include('default/default/partial.ejs');
    });

    it('should add relative path prefixes when not from template', function() {
      existsSyncStub.returns(true);

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        '/app/views/mybrand/myportal/pages/sub/template.ejs',
        false
      );
      
      // Should have ../ prefixes for navigation
      expect(result).to.include('../');
    });

    it('should add exactly 2 levels of ../ when fromTemplate is true', function() {
      existsSyncStub.returns(true);

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        '/app/views/mybrand/myportal/pages/template.ejs',
        true
      );
      
      expect(result).to.match(/^\.\.\/\.\.\/.*partial\.ejs$/);
    });
  });

  describe('exports', function() {
    it('should export displayValue and resolvePartialPath methods', function() {
      // Need to update sails.log to have error function for this test
      (global as any).sails.log = {
        verbose: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {}
      };
      
      const { Services } = require('../../src/services/ViewUtilsService');
      const viewUtils = new Services.ViewUtils();
      const exported = viewUtils.exports();

      expect(exported).to.have.property('displayValue');
      expect(exported).to.have.property('resolvePartialPath');
      expect(exported.displayValue).to.be.a('function');
      expect(exported.resolvePartialPath).to.be.a('function');
    });
  });
});
