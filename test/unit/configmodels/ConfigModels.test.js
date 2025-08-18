const { ConfigModels } = require('../../../api/configmodels/ConfigModels');

describe('ConfigModels', function () {

  it('should get existing config keys', () => {
    const keys = ConfigModels.getConfigKeys();
    expect(keys).to.be.an('array');
    expect(keys).to.include('systemMessage');
    expect(keys).to.include('authorizedDomainsEmails');
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

  it('should register a new config model', () => {
    const mockClass = class TestConfigModel {
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
    expect(retrievedInfo.schema).to.deep.equal(mockSchema);
  });

  it('should register a config model with tsGlob', () => {
    const mockClass = class TestConfigWithGlob {
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
    expect(retrievedInfo.tsGlob).to.equal('/some/path/*.ts');
  });

  it('should register a config model with array of tsGlobs', () => {
    const mockClass = class TestConfigWithMultipleGlobs {
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
    expect(retrievedInfo.tsGlob).to.deep.equal(tsGlobs);
  });

  it('should overwrite existing config model by default', () => {
    const originalClass = class OriginalModel {
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewModel {
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
    expect(retrievedInfo.modelName).to.equal('NewModel');
    expect(retrievedInfo.class).to.equal(newClass);
  });

  it('should not overwrite existing config model when preventOverride is true', () => {
    const originalClass = class OriginalPreventModel {
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewPreventModel {
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
    expect(retrievedInfo.modelName).to.equal('OriginalPreventModel');
    expect(retrievedInfo.class).to.equal(originalClass);
  });

  it('should allow registration with preventOverride when key does not exist', () => {
    const mockClass = class PreventNewModel {
      constructor() {
        this.preventNew = true;
      }
    };

    ConfigModels.register('preventNewTest', {
      modelName: 'PreventNewModel',
      class: mockClass
    }, { preventOverride: true });

    const retrievedInfo = ConfigModels.getModelInfo('preventNewTest');
    expect(retrievedInfo.modelName).to.equal('PreventNewModel');
    expect(retrievedInfo.class).to.equal(mockClass);

    ConfigModels.register('preventNewTest', {
      modelName: 'PreventNewModelDuplicate',
      class: mockClass
    }, { preventOverride: true });

    const duplicateRetrievedInfo = ConfigModels.getModelInfo('preventNewTest');
    expect(duplicateRetrievedInfo.modelName).to.equal('PreventNewModel');
    expect(duplicateRetrievedInfo.class).to.equal(mockClass);
  });

  it('should handle preventOverride set to false explicitly', () => {
    const originalClass = class OriginalExplicitModel {
      constructor() {
        this.original = true;
      }
    };

    const newClass = class NewExplicitModel {
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
    expect(retrievedInfo.modelName).to.equal('NewExplicitModel');
    expect(retrievedInfo.class).to.equal(newClass);
  });

});
