import { ConfigModels } from '../src/configmodels/ConfigModels';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe('ConfigModels', function () {

  it('should get existing config keys', () => {
    const keys = ConfigModels.getConfigKeys();
    expect(keys).to.be.an('array');
    expect(keys).to.include('systemMessage');
    expect(keys).to.include('authorizedDomainsEmails');
    expect(keys).to.include('menu');
    expect(keys).to.include('homePanels');
    expect(keys).to.include('adminSidebar');
  });

  it('should get model info for existing key', () => {
    const modelInfo = ConfigModels.getModelInfo('systemMessage');
    expect(modelInfo).to.not.be.null;
    expect(modelInfo.modelName).to.equal('SystemMessage');
    expect(modelInfo.title).to.equal('System Messages');
    expect(modelInfo.class).to.not.be.undefined;
  });

  it('should return undefined for non-existing key', () => {
    const modelInfo = ConfigModels.getModelInfo('nonExistentKey');
    expect(modelInfo).to.be.undefined;
  });

  it('should expose navigation config models with schema metadata', () => {
    const models = ConfigModels.getConfigKeys();
    expect(models).to.include('menu');

    const menuModelInfo = ConfigModels.getModelInfo('menu');
    expect(menuModelInfo.schema).to.not.be.undefined;
    // Expect absolute path ending with src/configmodels/MenuConfig.ts
    expect(menuModelInfo.tsGlob).to.contain('src/configmodels/MenuConfig.ts');

    const homePanelsModelInfo = ConfigModels.getModelInfo('homePanels');
    expect(homePanelsModelInfo.schema).to.not.be.undefined;
    expect(homePanelsModelInfo.tsGlob).to.contain('src/configmodels/HomePanelConfig.ts');

    const adminSidebarInfo = ConfigModels.getModelInfo('adminSidebar');
    expect(adminSidebarInfo).to.not.be.undefined;
    expect(adminSidebarInfo.schema).to.exist;
    expect(adminSidebarInfo.tsGlob).to.contain('src/configmodels/AdminSidebarConfig.ts');
  });

  it('should register a new config model', () => {
    const mockClass = class TestConfigModel {
      [key: string]: any;
      constructor() {
        this.testProperty = 'default';
      }
    };

    const modelInfo = {
      modelName: 'TestConfigModel',
      title: 'Test Config Model',
      class: mockClass
    };

    ConfigModels.register('testConfig', modelInfo);

    const retrievedInfo = ConfigModels.getModelInfo('testConfig');
    expect(retrievedInfo).to.deep.equal(modelInfo);

    const keys = ConfigModels.getConfigKeys();
    expect(keys).to.include('testConfig');
  });

  it('should register a config model with schema', () => {
    const mockClass = class TestConfigWithSchema {
      [key: string]: any;
      constructor() {
        this.schemaProperty = 'test';
      }
    };

    const mockSchema = {
      type: 'object',
      properties: {
        schemaProperty: { type: 'string' }
      }
    };

    const modelInfo = {
      modelName: 'TestConfigWithSchema',
      class: mockClass,
      schema: mockSchema
    };

    ConfigModels.register('testConfigWithSchema', modelInfo);

    const retrievedInfo = ConfigModels.getModelInfo('testConfigWithSchema');
    expect(retrievedInfo?.schema).to.deep.equal(mockSchema);
  });

  it('should register a config model with tsGlob', () => {
    const mockClass = class TestConfigWithGlob {
      [key: string]: any;
      constructor() {
        this.globProperty = 'test';
      }
    };

    const modelInfo = {
      modelName: 'TestConfigWithGlob',
      class: mockClass,
      tsGlob: '/some/path/*.ts'
    };

    ConfigModels.register('testConfigWithGlob', modelInfo);

    const retrievedInfo = ConfigModels.getModelInfo('testConfigWithGlob');
    expect(retrievedInfo?.tsGlob).to.equal('/some/path/*.ts');
  });

  it('should register a config model with array of tsGlobs', () => {
    const mockClass = class TestConfigWithMultipleGlobs {
      [key: string]: any;
      constructor() {
        this.multiGlobProperty = 'test';
      }
    };

    const tsGlobs = ['/path/one/*.ts', '/path/two/*.ts'];
    const modelInfo = {
      modelName: 'TestConfigWithMultipleGlobs',
      class: mockClass,
      tsGlob: tsGlobs
    };

    ConfigModels.register('testConfigWithMultipleGlobs', modelInfo);

    const retrievedInfo = ConfigModels.getModelInfo('testConfigWithMultipleGlobs');
    expect(retrievedInfo!.tsGlob).to.deep.equal(tsGlobs);
  });

  it('should overwrite existing config model by default', () => {
    const originalClass = class OriginalModel {
      [key: string]: any;
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewModel {
      [key: string]: any;
      constructor() {
        this.original = false;
        this.new = true;
      }
    };

    // Register original
    ConfigModels.register('overwriteTest', {
      modelName: 'OriginalModel',
      class: originalClass
    });

    ConfigModels.register('overwriteTest', {
      modelName: 'NewModel',
      class: newClass
    });

    const retrievedInfo = ConfigModels.getModelInfo('overwriteTest');
    expect(retrievedInfo!.modelName).to.equal('NewModel');
    expect(retrievedInfo!.class).to.equal(newClass);
  });

  it('should not overwrite existing config model when preventOverride is true', () => {
    const originalClass = class OriginalPreventModel {
      [key: string]: any;
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewPreventModel {
      [key: string]: any;
      constructor() {
        this.original = false;
        this.new = true;
      }
    };


    ConfigModels.register('preventOverrideTest', {
      modelName: 'OriginalPreventModel',
      class: originalClass
    });


    ConfigModels.register('preventOverrideTest', {
      modelName: 'NewPreventModel',
      class: newClass
    }, { preventOverride: true });

    const retrievedInfo = ConfigModels.getModelInfo('preventOverrideTest');
    expect(retrievedInfo!.modelName).to.equal('OriginalPreventModel');
    expect(retrievedInfo!.class).to.equal(originalClass);
  });

  it('should allow registration with preventOverride when key does not exist', () => {
    const mockClass = class PreventNewModel {
      [key: string]: any;
      constructor() {
        this.preventNew = true;
      }
    };

    const mockClassDifferent = class PreventNewModel {
      [key: string]: any;
      constructor() {
        this.preventNew = true;
      }
    };

    ConfigModels.register('preventNewTest', {
      modelName: 'PreventNewModel',
      class: mockClass
    }, { preventOverride: true });

    const retrievedInfo = ConfigModels.getModelInfo('preventNewTest');
    expect(retrievedInfo!.modelName).to.equal('PreventNewModel');
    expect(retrievedInfo!.class).to.equal(mockClass);

    ConfigModels.register('preventNewTest', {
      modelName: 'PreventNewModelDuplicate',
      class: mockClassDifferent
    }, { preventOverride: true });

    const duplicateRetrievedInfo = ConfigModels.getModelInfo('preventNewTest');
    expect(duplicateRetrievedInfo!.modelName).to.equal('PreventNewModel');
    expect(duplicateRetrievedInfo!.class).to.equal(mockClass);
  });

  it('should handle preventOverride set to false explicitly', () => {
    const originalClass = class OriginalExplicitModel {
      [key: string]: any;
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewExplicitModel {
      [key: string]: any;
      constructor() {
        this.original = false;
        this.new = true;
      }
    };

    ConfigModels.register('explicitOverrideTest', {
      modelName: 'OriginalExplicitModel',
      class: originalClass
    });


    ConfigModels.register('explicitOverrideTest', {
      modelName: 'NewExplicitModel',
      class: newClass
    }, { preventOverride: false });

    const retrievedInfo = ConfigModels.getModelInfo('explicitOverrideTest');
    expect(retrievedInfo!.modelName).to.equal('NewExplicitModel');
    expect(retrievedInfo!.class).to.equal(newClass);
  });

});
