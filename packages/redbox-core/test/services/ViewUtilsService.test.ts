let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import fs from 'fs';
import os from 'os';
import path from 'path';
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
    let appPath: string;

    function writeJson(filePath: string, value: unknown): void {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    }

    function writeFile(filePath: string, content = ''): void {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    function createHook(packageName = 'redbox-hook-client'): string {
      const hookRoot = path.join(appPath, 'node_modules', packageName);
      writeJson(path.join(hookRoot, 'package.json'), {
        name: packageName,
        main: 'index.js',
        sails: { isHook: true },
      });
      writeFile(path.join(hookRoot, 'index.js'), 'module.exports = {};');
      return hookRoot;
    }

    beforeEach(function() {
      appPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-view-utils-')));
      writeJson(path.join(appPath, 'package.json'), {
        dependencies: {
          'redbox-hook-client': '1.0.0',
        },
      });
      mockSails.config.appPath = appPath;

      const { Services } = require('../../src/services/ViewUtilsService');
      viewUtils = new Services.ViewUtils();
    });

    afterEach(function() {
      fs.rmSync(appPath, { recursive: true, force: true });
    });

    it('should return original value when no matching partial exists', function() {
      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'default',
        'portal',
        path.join(appPath, 'views', 'template.ejs'),
        false
      );
      
      expect(result).to.equal('partial.ejs');
    });

    it('should check branding/portal specific path first', function() {
      const partialPath = path.join(appPath, 'views', 'mybrand', 'myportal', 'partial.ejs');
      const templatePath = path.join(appPath, 'views', 'mybrand', 'myportal', 'pages', 'template.ejs');
      writeFile(partialPath, 'partial');

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        templatePath,
        false
      );
      
      expect(path.resolve(path.dirname(templatePath), result)).to.equal(partialPath);
    });

    it('should fallback to default branding with specific portal', function() {
      const partialPath = path.join(appPath, 'views', 'default', 'myportal', 'partial.ejs');
      const templatePath = path.join(appPath, 'views', 'mybrand', 'myportal', 'pages', 'template.ejs');
      writeFile(partialPath, 'partial');

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        templatePath,
        false
      );
      
      expect(path.resolve(path.dirname(templatePath), result)).to.equal(partialPath);
    });

    it('should fallback to default/default path', function() {
      const partialPath = path.join(appPath, 'views', 'default', 'default', 'partial.ejs');
      const templatePath = path.join(appPath, 'views', 'mybrand', 'myportal', 'pages', 'template.ejs');
      writeFile(partialPath, 'partial');

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        templatePath,
        false
      );
      
      expect(path.resolve(path.dirname(templatePath), result)).to.equal(partialPath);
    });

    it('should return a relative path from the actual template directory', function() {
      const partialPath = path.join(appPath, 'views', 'mybrand', 'myportal', 'partial.ejs');
      const templatePath = path.join(appPath, 'views', 'mybrand', 'myportal', 'pages', 'sub', 'template.ejs');
      writeFile(partialPath, 'partial');

      const result = viewUtils.resolvePartialPath(
        'partial.ejs',
        'mybrand',
        'myportal',
        templatePath,
        false
      );
      
      expect(result).to.equal('../../partial.ejs');
      expect(path.resolve(path.dirname(templatePath), result)).to.equal(partialPath);
    });

    it('should resolve hook partials from a core layout directory', function() {
      const hookRoot = createHook();
      const hookPartialPath = path.join(hookRoot, 'views', 'default', 'default', 'layout', 'footer.ejs');
      const layoutDirectory = path.join(appPath, 'views', 'default', 'default');
      writeFile(hookPartialPath, 'hook footer');

      const result = viewUtils.resolvePartialPath(
        '/layout/footer.ejs',
        'default',
        'default',
        layoutDirectory,
        true
      );
      
      expect(path.resolve(layoutDirectory, result)).to.equal(hookPartialPath);
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
