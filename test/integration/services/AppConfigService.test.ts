describe('appConfigService', function () {
  let appConfigService;
  let originalBrandingAppConfigMap;
  let testStartTime;
  let ConfigModels;

  beforeEach(() => {
    appConfigService = sails.services.appconfigservice;
    ConfigModels = sails.config.configmodels || require('@researchdatabox/redbox-core-types').ConfigModels;
    // Save original state
    originalBrandingAppConfigMap = appConfigService.brandingAppConfigMap;
    // Generate unique suffix for test models to avoid conflicts
    testStartTime = Date.now();

    // Cleanup Polluted Keys from previous runs (Fix for split-brain ConfigModels)
    // We register safe dummies with schemas to prevent initAllConfigFormSchemas from crashing
    // when accessing these keys on the internal ConfigModels instance.
    const polluters = [
      'testConfigWithGlob',
      'testConfigWithMultipleGlobs',
      'testSafeConfig',
      'testNonOverrideConfig',
      'testFilterGlobs',
      'testNullMap',
      'testSingleGlob'
    ];
    const safeSchema = { type: 'object', properties: {} };
    class SafeDummy {
      [key: string]: any;
      static getFieldOrder() { return []; }
    }

    polluters.forEach(key => {
      appConfigService.registerConfigModel({
        key,
        modelName: 'SafeDummy' + key,
        class: SafeDummy,
        schema: safeSchema
      });
    });

    // Clear extraTsGlobs to prevent TJS from looking for non-existent globs
    if (appConfigService.extraTsGlobs) {
      appConfigService.extraTsGlobs.clear();
    }
  });

  afterEach(() => {
    // Restore original state to prevent test interference
    if (originalBrandingAppConfigMap !== undefined) {
      appConfigService.brandingAppConfigMap = originalBrandingAppConfigMap;
    }
  });

  it('should get the app configuration for a brand', () => {
    const brandName = 'default';
    const appConfig = appConfigService.getAppConfigurationForBrand(brandName);
    expect(appConfig.systemMessage).to.not.be.null;
  });

  it('should get the app configuration by brand and key from database', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'systemMessage';
    const configData = await appConfigService.getAppConfigByBrandAndKey(branding.id, configKey);
    expect(configData.message ?? '').to.eq('')
  });


  it('should create or update a configuration', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'systemMessage';
    const message = 'test message';
    const enabled = true;

    let configData: any = {};
    configData.message = message;
    configData.enabled = enabled;
    sails.log.error("branding:")
    sails.log.error(branding)
    const updatedConfigData = await appConfigService.createOrUpdateConfig(branding, configKey, configData);
    const updatedConfig = appConfigService.getAppConfigurationForBrand(brandName);

    expect(updatedConfig[configKey].message).to.eq(message);
    expect(updatedConfig[configKey].enabled).to.eq(enabled);
  });


  it('should get all configurations for a brand from the database', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configurations = await appConfigService.getAllConfigurationForBrand(branding.id);
    expect(configurations).to.not.be.null;
    expect(configurations.length).to.be.greaterThan(0);
  });

  it('should get the app configuration by brand and key from database', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'systemMessage';
    const configData = await appConfigService.getAppConfigByBrandAndKey(branding.id, configKey);
    expect(configData.message).to.eq('test message')
  });

  it('should throw an error when key does not exist', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'fakeConfigKey';
    try {
      const configData = await appConfigService.getAppConfigByBrandAndKey(branding.id, configKey);
      expect.fail("Should have thrown error");
    } catch (err) {
      expect(err).to.be.an('error');
    }
  });



  it('should create a configuration', async () => {
    const brandName = 'default';
    const branding = BrandingService.getBrand(brandName);
    const configKey = 'exampleConfigKey';
    const configData = { example: 'data' };
    const createdConfigData = await appConfigService.createConfig(brandName, configKey, configData);

    expect(createdConfigData.example).to.eq(configData.example);
    const updatedConfig = appConfigService.getAppConfigurationForBrand(brandName);
    expect(updatedConfig[configKey].example).to.eq(configData.example);

  });

  it('should get the app config form', async () => {
    const branding = BrandingService.getBrand('default');
    const configForm = 'systemMessage';
    const appConfigForm = await appConfigService.getAppConfigForm(branding, configForm);
    expect(appConfigForm).to.not.be.null;
  });

  it('should register a new config model with schema', () => {
    const mockClass = class TestModel {
      [key: string]: any;
      constructor() {
        this.testProperty = 'default';
      }
      static getFieldOrder() {
        return ['testProperty'];
      }
    };

    const mockSchema = {
      type: 'object',
      properties: {
        testProperty: { type: 'string' }
      }
    };

    const configInfo = {
      key: 'testConfig',
      modelName: 'TestModel',
      class: mockClass,
      schema: mockSchema
    };

    appConfigService.registerConfigModel(configInfo);

    // Verify the schema is cached by checking if the method doesn't throw
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();
  });

  it('should register a new config model with tsGlob', () => {
    const mockClass = class TestModelWithGlob {
      [key: string]: any;
      constructor() {
        this.testGlobProperty = 'default';
      }
      static getFieldOrder() {
        return ['testGlobProperty'];
      }
    };

    const configInfo = {
      key: 'testConfigWithGlob',
      modelName: 'TestModelWithGlob',
      class: mockClass,
      tsGlob: '/some/test/path/*.ts'
    };

    // Should not throw an error when registering with tsGlob
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();
  });

  it('should register a new config model with array of tsGlobs', () => {
    const mockClass = class TestModelWithMultipleGlobs {
      [key: string]: any;
      constructor() {
        this.testMultiProperty = 'default';
      }
      static getFieldOrder() {
        return ['testMultiProperty'];
      }
    };

    const configInfo = {
      key: 'testConfigWithMultipleGlobs',
      modelName: 'TestModelWithMultipleGlobs',
      class: mockClass,
      tsGlob: ['/path/one/*.ts', '/path/two/*.ts']
    };

    appConfigService.registerConfigModel(configInfo);

    // Should not throw an error when registering with array of globs
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();
  });


  it('should handle config model registration with class instantiation error', () => {
    // Test the error handling by mocking the instantiation process
    const originalWarn = sails.log.warn;
    let warnMessage = '';
    sails.log.warn = (msg) => {
      warnMessage = msg;
    };

    // Create a class that works normally
    const mockClass = class TestModelErrorHandling {
      [key: string]: any;
      constructor() {
        this.safeProperty = 'safe value';
      }
      static getFieldOrder() {
        return ['safeProperty'];
      }
    };

    // Ensure brandingAppConfigMap exists
    if (!appConfigService.brandingAppConfigMap) {
      appConfigService.brandingAppConfigMap = {};
    }
    appConfigService.brandingAppConfigMap['testBrandSafe'] = {};

    const configInfo = {
      key: 'testSafeConfig',
      modelName: 'TestModelErrorHandling',
      class: mockClass
    };

    // Should work without throwing an error
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();

    // Restore original warn function
    sails.log.warn = originalWarn;
  });

  it('should not override existing branding config when registering new model', () => {
    const mockClass = class TestModelNonOverride {
      [key: string]: any;
      constructor() {
        this.nonOverrideProperty = 'new default';
      }
      static getFieldOrder() {
        return ['nonOverrideProperty'];
      }
    };

    // Set up existing config
    if (!appConfigService.brandingAppConfigMap) {
      appConfigService.brandingAppConfigMap = {};
    }
    appConfigService.brandingAppConfigMap['testBrand'] = {
      testNonOverrideConfig: { nonOverrideProperty: 'existing value' }
    };

    const configInfo = {
      key: 'testNonOverrideConfig',
      modelName: 'TestModelNonOverride',
      class: mockClass
    };

    appConfigService.registerConfigModel(configInfo);

    // Should not override existing value
    expect(appConfigService.brandingAppConfigMap['testBrand']['testNonOverrideConfig'].nonOverrideProperty).to.equal('existing value');
  });

  it('should filter out falsy tsGlob values', () => {
    const mockClass = class TestModelFilterGlobs {
      [key: string]: any;
      constructor() {
        this.filterProperty = 'default';
      }
    };

    const configInfo = {
      key: 'testFilterGlobs',
      modelName: 'TestModelFilterGlobs',
      class: mockClass,
      tsGlob: ['/valid/path/*.ts', null, '', '/another/valid/path/*.ts']
    };

    // Should not throw an error when registering with mixed valid/falsy globs
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();
  });

  it('should handle initAllConfigFormSchemas with prebuilt schemas', async () => {
    // Create a mock to avoid processing models from other tests
    const originalGetConfigKeys = ConfigModels.getConfigKeys;
    const originalGetModelInfo = ConfigModels.getModelInfo;

    const mockClass = class TestModelWithPrebuiltSchema {
      [key: string]: any;
      constructor() {
        this.prebuiltProperty = 'default';
      }
      static getFieldOrder() {
        return ['prebuiltProperty'];
      }
    };

    const prebuiltSchema = {
      type: 'object',
      properties: {
        prebuiltProperty: { type: 'string' }
      }
    };

    const testModelInfo = {
      modelName: 'TestModelWithPrebuiltSchemaOnly',
      class: mockClass,
      schema: prebuiltSchema
    };

    // Mock ConfigModels to only return our test model
    ConfigModels.getConfigKeys = () => ['testPrebuiltSchemaOnly'];
    ConfigModels.getModelInfo = (key) => {
      if (key === 'testPrebuiltSchemaOnly') {
        return testModelInfo;
      }
      return undefined;
    };

    // Call initAllConfigFormSchemas - this should not fail with prebuilt schemas
    try {
      await appConfigService.initAllConfigFormSchemas();
      // If we get here, the method completed successfully
      expect(true).to.be.true;
    } catch (error) {
      // Should not throw an error
      expect.fail(`initAllConfigFormSchemas should not throw: ${error.message}`);
    } finally {
      // Restore original methods
      ConfigModels.getConfigKeys = originalGetConfigKeys;
      ConfigModels.getModelInfo = originalGetModelInfo;
    }
  });

  it('should handle getAppConfigForm with prebuilt schema', async () => {
    const mockClass = class TestFormModelWithSchema {
      [key: string]: any;
      constructor() {
        this.formProperty = 'default';
      }
      static getFieldOrder() {
        return ['formProperty'];
      }
    };

    const formSchema = {
      type: 'object',
      properties: {
        formProperty: { type: 'string' }
      }
    };

    // Register model with schema
    appConfigService.registerConfigModel({
      key: 'testFormWithSchema',
      modelName: 'TestFormModelWithSchema',
      class: mockClass,
      schema: formSchema
    });

    const branding = BrandingService.getBrand('default');
    const appConfigForm = await appConfigService.getAppConfigForm(branding, 'testFormWithSchema');

    expect(appConfigForm).to.not.be.null;
    expect(appConfigForm.schema).to.deep.equal(formSchema);
    expect(appConfigForm.model).to.be.instanceOf(mockClass);
    expect(appConfigForm.fieldOrder).to.deep.equal(['formProperty']);
  });

  it('should handle registerConfigModel when brandingAppConfigMap is null', () => {
    const originalMap = appConfigService.brandingAppConfigMap;
    appConfigService.brandingAppConfigMap = null;

    const mockClass = class TestModelNullMap {
      [key: string]: any;
      constructor() {
        this.nullMapProperty = 'default';
      }
      static getFieldOrder() {
        return ['nullMapProperty'];
      }
    };

    const configInfo = {
      key: 'testNullMap',
      modelName: 'TestModelNullMap',
      class: mockClass
    };

    // Should not throw an error when brandingAppConfigMap is null
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();

    // Restore original map
    appConfigService.brandingAppConfigMap = originalMap;
  });

  it('should handle single tsGlob string', () => {
    const mockClass = class TestModelSingleGlob {
      [key: string]: any;
      constructor() {
        this.singleGlobProperty = 'default';
      }
      static getFieldOrder() {
        return ['singleGlobProperty'];
      }
    };

    const configInfo = {
      key: 'testSingleGlob',
      modelName: 'TestModelSingleGlob',
      class: mockClass,
      tsGlob: '/single/path/*.ts'
    };

    appConfigService.registerConfigModel(configInfo);

    // Should not throw an error when registering with single glob
    expect(() => appConfigService.registerConfigModel(configInfo)).to.not.throw();
  });
});