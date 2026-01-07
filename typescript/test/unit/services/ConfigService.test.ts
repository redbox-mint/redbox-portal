/* eslint-disable no-unused-expressions */
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');

describe('The ConfigService', function () {
    let configService;
    let originalSailsConfig;
    let expect;

    before(async function () {
        // Standalone setup: if global.expect is missing, we are likely running in isolation
        if (typeof (global as any).expect === 'undefined') {
            const chai = await import('chai');
            expect = chai.expect;

            // Mock Sails if missing
            if (typeof (global as any).sails === 'undefined') {
                (global as any).sails = {
                    config: {
                        appPath: process.cwd(),
                        auth: { defaultBrand: 'default' },
                        brandingConfigurationDefaults: {},
                        brandingAware: () => ({}),
                        controllers: { moduleDefinitions: {} },
                        services: {}
                    },
                    log: {
                        verbose: () => { },
                        info: () => { },
                        error: console.error,
                        warn: console.warn
                    },
                    services: {}
                };
            }

            // Mock globals
            if (typeof (global as any)._ === 'undefined') {
                (global as any)._ = require('lodash');
            }
            if (typeof (global as any).AppConfigService === 'undefined') {
                (global as any).AppConfigService = {
                    createConfig: async () => ({}),
                    createOrUpdateConfig: async () => ({})
                };
            }
            if (typeof (global as any).BrandingService === 'undefined') {
                (global as any).BrandingService = {
                    getBrand: () => ({})
                };
            }

            // Load the ConfigService
            try {
                // Adjust path for standalone run from project root
                const configServicePath = path.resolve(__dirname, '../../../api/services/ConfigService');
                const ConfigServiceExport = require(configServicePath);
                (global as any).sails.services.configservice = ConfigServiceExport;
            } catch (e) {
                console.error("Failed to load ConfigService:", e);
                throw e;
            }
        } else {
            expect = (global as any).expect;
        }

        configService = (global as any).sails.services.configservice;
        // Store original config
        originalSailsConfig = _.cloneDeep((global as any).sails.config);
    });

    afterEach(function () {
        // Restore original config after each test
        sails.config.auth = originalSailsConfig.auth;
        sails.config.brandingAware = originalSailsConfig.brandingAware;
        sails.config.brandingConfigurationDefaults = originalSailsConfig.brandingConfigurationDefaults;
    });

    describe('getBrand', function () {
        // -------------------------------------------------------------------------
        // Test: Basic resolution from brandingAware with specified brand
        // -------------------------------------------------------------------------
        it('should resolve config from brandingAware for specified brand', function (done) {
            // Setup: Make brandingAware return config for test brand
            const testConfigValue = { testKey: 'testValue' };
            sails.config.brandingAware = (brandName) => {
                if (brandName === 'testBrand') {
                    return { testBlock: testConfigValue };
                }
                return {};
            };

            const result = configService.getBrand('testBrand', 'testBlock');
            expect(result).to.deep.equal(testConfigValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Fallback to default brand when specified brand has no config
        // -------------------------------------------------------------------------
        it('should fallback to default brand when specified brand has no config', function (done) {
            const defaultConfigValue = { defaultKey: 'defaultValue' };
            const defaultBrand = _.get(sails, 'config.auth.defaultBrand', 'default');

            sails.config.brandingAware = (brandName) => {
                if (brandName === defaultBrand) {
                    return { fallbackBlock: defaultConfigValue };
                }
                return {};
            };

            const result = configService.getBrand('nonExistentBrand', 'fallbackBlock');
            expect(result).to.deep.equal(defaultConfigValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Fallback to brandingConfigurationDefaults
        // -------------------------------------------------------------------------
        it('should fallback to brandingConfigurationDefaults when brandingAware returns undefined', function (done) {
            const defaultsValue = { defaultsKey: 'defaultsValue' };
            sails.config.brandingAware = () => ({});
            sails.config.brandingConfigurationDefaults = {
                configDefaultsBlock: defaultsValue
            };

            const result = configService.getBrand('anyBrand', 'configDefaultsBlock');
            expect(result).to.deep.equal(defaultsValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Fallback to legacy config with brand name
        // -------------------------------------------------------------------------
        it('should fallback to legacy config format with brand name', function (done) {
            const legacyValue = { legacyKey: 'legacyValue' };
            sails.config.brandingAware = () => ({});
            sails.config.brandingConfigurationDefaults = {};
            sails.config.legacyBlock = {
                myBrand: legacyValue
            };

            const result = configService.getBrand('myBrand', 'legacyBlock');
            expect(result).to.deep.equal(legacyValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Fallback to legacy config with default brand
        // -------------------------------------------------------------------------
        it('should fallback to legacy config format with default brand', function (done) {
            const legacyDefaultValue = { legacyDefaultKey: 'legacyDefaultValue' };
            const defaultBrand = _.get(sails, 'config.auth.defaultBrand', 'default');

            sails.config.brandingAware = () => ({});
            sails.config.brandingConfigurationDefaults = {};
            sails.config.anotherLegacyBlock = {};
            sails.config.anotherLegacyBlock[defaultBrand] = legacyDefaultValue;

            const result = configService.getBrand('unknownBrand', 'anotherLegacyBlock');
            expect(result).to.deep.equal(legacyDefaultValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Return undefined when no config exists anywhere
        // -------------------------------------------------------------------------
        it('should return undefined when no config exists anywhere', function (done) {
            sails.config.brandingAware = () => ({});
            sails.config.brandingConfigurationDefaults = {};

            const result = configService.getBrand('anyBrand', 'nonExistentBlock');
            expect(result).to.be.undefined;
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle empty brand name
        // -------------------------------------------------------------------------
        it('should handle empty brand name by falling back to defaults', function (done) {
            const defaultConfigValue = { emptyBrandKey: 'emptyBrandValue' };
            const defaultBrand = _.get(sails, 'config.auth.defaultBrand', 'default');

            sails.config.brandingAware = (brandName) => {
                if (brandName === defaultBrand) {
                    return { emptyBrandBlock: defaultConfigValue };
                }
                return {};
            };

            const result = configService.getBrand('', 'emptyBrandBlock');
            expect(result).to.deep.equal(defaultConfigValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle undefined brand name
        // -------------------------------------------------------------------------
        it('should handle undefined brand name by falling back to defaults', function (done) {
            const defaultConfigValue = { undefinedBrandKey: 'undefinedBrandValue' };
            const defaultBrand = _.get(sails, 'config.auth.defaultBrand', 'default');

            sails.config.brandingAware = (brandName) => {
                if (brandName === defaultBrand) {
                    return { undefinedBrandBlock: defaultConfigValue };
                }
                return {};
            };

            const result = configService.getBrand(undefined, 'undefinedBrandBlock');
            expect(result).to.deep.equal(defaultConfigValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle brandingAware as non-function
        // -------------------------------------------------------------------------
        it('should handle brandingAware as non-function by falling back', function (done) {
            const defaultsValue = { nonFunctionKey: 'nonFunctionValue' };
            sails.config.brandingAware = 'not a function';
            sails.config.brandingConfigurationDefaults = {
                nonFunctionBlock: defaultsValue
            };

            const result = configService.getBrand('anyBrand', 'nonFunctionBlock');
            expect(result).to.deep.equal(defaultsValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle deeply nested config block
        // -------------------------------------------------------------------------
        it('should resolve deeply nested config blocks', function (done) {
            const nestedValue = 'deepNestedValue';
            sails.config.brandingAware = (brandName) => {
                if (brandName === 'nestedBrand') {
                    return {
                        level1: {
                            level2: {
                                level3: nestedValue
                            }
                        }
                    };
                }
                return {};
            };

            const result = configService.getBrand('nestedBrand', 'level1.level2.level3');
            expect(result).to.equal(nestedValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: brandingAware returns undefined for configBlock
        // -------------------------------------------------------------------------
        it('should continue fallback chain when brandingAware config value is undefined', function (done) {
            const defaultsValue = { fallbackAfterUndefined: 'value' };
            sails.config.brandingAware = (brandName) => {
                // Returns object but without the requested config block
                return { otherBlock: 'something' };
            };
            sails.config.brandingConfigurationDefaults = {
                requestedBlock: defaultsValue
            };

            const result = configService.getBrand('anyBrand', 'requestedBlock');
            expect(result).to.deep.equal(defaultsValue);
            done();
        });
    });

    describe('mergeHookConfig', function () {
        let testHookDir;
        let fs;

        before(function () {
            fs = require('fs-extra');
            // Use a temp directory for hook tests
            testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-hook-for-config-tests');
        });

        afterEach(function () {
            // Cleanup test directories
            try {
                if (fs.pathExistsSync(testHookDir)) {
                    fs.removeSync(testHookDir);
                }
                // Clear require cache for the test hook directory
                Object.keys(require.cache).forEach(function (key) {
                    if (key.indexOf('test-hook-for-config-tests') !== -1) {
                        delete require.cache[key];
                    }
                });
            } catch (e) {
                // Ignore cleanup errors
            }
        });

        // -------------------------------------------------------------------------
        // Test: Hook directory doesn't exist - should not throw
        // -------------------------------------------------------------------------
        it('should handle non-existent hook directory gracefully', function (done) {
            // Call with a hook that doesn't exist
            expect(() => {
                configService.mergeHookConfig('non-existent-hook-12345');
            }).to.not.throw();
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Process config directory with files
        // -------------------------------------------------------------------------
        it('should merge configuration files from hook config directory', function (done) {
            // Create test hook directory structure
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            // Create a config file
            const testConfig = {
                testMergeConfig: {
                    key1: 'value1',
                    key2: 'value2'
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'test-config.js'),
                `module.exports = ${JSON.stringify(testConfig)};`
            );

            const configMap: any = {};
            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            expect(configMap.testMergeConfig).to.deep.equal(testConfig.testMergeConfig);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle _dontMerge directive
        // -------------------------------------------------------------------------
        it('should handle _dontMerge directive by replacing instead of merging', function (done) {
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            // Create config with _dontMerge
            const hookConfig = {
                dontMergeTestBlock: {
                    replaceMe: ['new1', 'new2'],
                    _dontMerge: ['replaceMe']
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'dontmerge-config.js'),
                `module.exports = ${JSON.stringify(hookConfig)};`
            );

            const configMap = {
                dontMergeTestBlock: {
                    replaceMe: ['old1', 'old2', 'old3']
                }
            };

            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            // Should replace, not merge
            expect(configMap.dontMergeTestBlock.replaceMe).to.deep.equal(['new1', 'new2']);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle _delete directive
        // -------------------------------------------------------------------------
        it('should handle _delete directive by removing specified keys', function (done) {
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            // Create config with _delete
            const hookConfig = {
                deleteTestBlock: {
                    keepMe: 'kept',
                    _delete: ['removeMe']
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'delete-config.js'),
                `module.exports = ${JSON.stringify(hookConfig)};`
            );

            const configMap = {
                deleteTestBlock: {
                    removeMe: 'should be removed',
                    keepMe: 'original'
                }
            };

            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            expect(configMap.deleteTestBlock.removeMe).to.be.undefined;
            expect(configMap.deleteTestBlock.keepMe).to.equal('kept');
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Process nested config directories
        // -------------------------------------------------------------------------
        it('should process nested configuration directories recursively', function (done) {
            const configDir = path.join(testHookDir, 'config');
            const nestedDir = path.join(configDir, 'nested');
            fs.ensureDirSync(nestedDir);

            const nestedConfig = {
                nestedTestConfig: {
                    nested: true
                }
            };
            fs.writeFileSync(
                path.join(nestedDir, 'nested-config.js'),
                `module.exports = ${JSON.stringify(nestedConfig)};`
            );

            const configMap: any = {};
            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            expect(configMap.nestedTestConfig).to.deep.equal({ nested: true });
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Process form-config directory
        // -------------------------------------------------------------------------
        it('should process form-config directory', function (done) {
            const formConfigDir = path.join(testHookDir, 'form-config');
            fs.ensureDirSync(formConfigDir);

            const formConfig = {
                testFormConfig: {
                    form: 'data'
                }
            };
            fs.writeFileSync(
                path.join(formConfigDir, 'form.js'),
                `module.exports = ${JSON.stringify(formConfig)};`
            );

            const configMap: any = {};
            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            expect(configMap.testFormConfig).to.deep.equal({ form: 'data' });
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Copy assets directory
        // -------------------------------------------------------------------------
        it('should copy assets from hook to application', function (done) {
            const assetsDir = path.join(testHookDir, 'assets');
            const testAssetDir = path.join(assetsDir, 'test-assets-config-test');
            fs.ensureDirSync(testAssetDir);
            fs.writeFileSync(path.join(testAssetDir, 'test-asset.txt'), 'test content');

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify asset was copied
            const copiedAsset = path.join(sails.config.appPath, 'assets', 'test-assets-config-test', 'test-asset.txt');
            expect(fs.pathExistsSync(copiedAsset)).to.be.true;

            // Cleanup
            fs.removeSync(path.join(sails.config.appPath, 'assets', 'test-assets-config-test'));
            fs.removeSync(path.join(sails.config.appPath, '.tmp', 'public', 'test-assets-config-test'));
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Copy views directory  
        // -------------------------------------------------------------------------
        it('should copy views from hook to application', function (done) {
            const viewsDir = path.join(testHookDir, 'views');
            const testViewDir = path.join(viewsDir, 'test-views-config-test');
            fs.ensureDirSync(testViewDir);
            fs.writeFileSync(path.join(testViewDir, 'test-view.ejs'), '<h1>Test</h1>');

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify view was copied
            const copiedView = path.join(sails.config.appPath, 'views', 'test-views-config-test', 'test-view.ejs');
            expect(fs.pathExistsSync(copiedView)).to.be.true;

            // Cleanup
            fs.removeSync(path.join(sails.config.appPath, 'views', 'test-views-config-test'));
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Register services from hook
        // -------------------------------------------------------------------------
        it('should register services from hook api/services directory', function (done) {
            const servicesDir = path.join(testHookDir, 'api', 'services');
            fs.ensureDirSync(servicesDir);

            const serviceCode = `
        module.exports = {
          testMethod: function() { return 'test'; }
        };
      `;
            fs.writeFileSync(path.join(servicesDir, 'TestConfigRegisteredService.js'), serviceCode);

            // Ensure services object exists
            if (!sails.services) {
                sails.services = {};
            }

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify service was registered
            expect(sails.services.testconfigregisteredservice).to.exist;
            expect(global.TestConfigRegisteredService).to.exist;

            // Cleanup
            delete sails.services.testconfigregisteredservice;
            delete global.TestConfigRegisteredService;
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Register controllers from hook
        // -------------------------------------------------------------------------
        it('should register controllers from hook api/controllers directory', function (done) {
            const controllersDir = path.join(testHookDir, 'api', 'controllers');
            fs.ensureDirSync(controllersDir);

            const controllerCode = `
        module.exports = {
          testAction: function(req, res) { return res.ok(); },
          _privateMethod: function() { return 'private'; }
        };
      `;
            fs.writeFileSync(path.join(controllersDir, 'TestConfigController.js'), controllerCode);

            // Ensure config.controllers exists
            if (!sails.config.controllers) {
                sails.config.controllers = {};
            }
            if (!sails.config.controllers.moduleDefinitions) {
                sails.config.controllers.moduleDefinitions = {};
            }

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify controller method was registered (public methods only)
            expect(sails.config.controllers.moduleDefinitions['TestConfig/testAction']).to.be.a('function');
            // Private methods should not be registered
            expect(sails.config.controllers.moduleDefinitions['TestConfig/_privateMethod']).to.be.undefined;

            // Cleanup
            delete sails.config.controllers.moduleDefinitions['TestConfig/testAction'];
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Copy policies from hook
        // -------------------------------------------------------------------------
        it('should copy policies from hook api/policies directory', function (done) {
            const policiesDir = path.join(testHookDir, 'api', 'policies');
            fs.ensureDirSync(policiesDir);

            const policyCode = `
        module.exports = function(req, res, next) { return next(); };
      `;
            fs.writeFileSync(path.join(policiesDir, 'testConfigPolicy.js'), policyCode);

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify policy was copied
            const copiedPolicy = path.join(sails.config.appPath, 'api', 'policies', 'testConfigPolicy.js');
            expect(fs.pathExistsSync(copiedPolicy)).to.be.true;

            // Cleanup
            fs.removeSync(copiedPolicy);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Copy responses from hook
        // -------------------------------------------------------------------------
        it('should copy responses from hook api/responses directory', function (done) {
            const responsesDir = path.join(testHookDir, 'api', 'responses');
            fs.ensureDirSync(responsesDir);

            const responseCode = `
        module.exports = function() { return this.res.status(200).json({ success: true }); };
      `;
            fs.writeFileSync(path.join(responsesDir, 'testConfigResponse.js'), responseCode);

            configService.mergeHookConfig('test-hook-for-config-tests');

            // Verify response was copied
            const copiedResponse = path.join(sails.config.appPath, 'api', 'responses', 'testConfigResponse.js');
            expect(fs.pathExistsSync(copiedResponse)).to.be.true;

            // Cleanup
            fs.removeSync(copiedResponse);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle hook launched from hook directory (appPath ends with hookName)
        // -------------------------------------------------------------------------
        it('should handle hook launched from hook directory', function (done) {
            // This tests the scenario where sails.config.appPath ends with the hook name
            // We can't easily simulate this, but we can verify the function doesn't throw
            const originalAppPath = sails.config.appPath;

            // Create a hook directory at a path that would match
            const specialHookName = 'test-special-hook';
            const specialHookDir = path.join(sails.config.appPath, 'node_modules', specialHookName);
            fs.ensureDirSync(path.join(specialHookDir, 'config'));

            const testConfig = { specialConfig: { value: 'special' } };
            fs.writeFileSync(
                path.join(specialHookDir, 'config', 'special.js'),
                `module.exports = ${JSON.stringify(testConfig)};`
            );

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig(specialHookName, configMap);
            }).to.not.throw();

            expect(configMap.specialConfig).to.deep.equal({ value: 'special' });

            // Cleanup
            fs.removeSync(specialHookDir);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Default dontMergeFields includes 'fields'
        // -------------------------------------------------------------------------
        it('should not merge fields array by default', function (done) {
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            const hookConfig = {
                fieldsTestBlock: {
                    fields: ['newField1', 'newField2']
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'fields-config.js'),
                `module.exports = ${JSON.stringify(hookConfig)};`
            );

            const configMap = {
                fieldsTestBlock: {
                    fields: ['oldField1', 'oldField2', 'oldField3']
                }
            };

            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            // 'fields' is in default dontMergeFields, so it should be replaced
            expect(configMap.fieldsTestBlock.fields).to.deep.equal(['newField1', 'newField2']);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Custom dontMergeFields parameter
        // -------------------------------------------------------------------------
        it('should respect custom dontMergeFields parameter', function (done) {
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            const hookConfig = {
                customDontMergeBlock: {
                    customArray: ['new1', 'new2'],
                    normalArray: ['hookValue']
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'custom-dontmerge-config.js'),
                `module.exports = ${JSON.stringify(hookConfig)};`
            );

            const configMap = {
                customDontMergeBlock: {
                    customArray: ['old1', 'old2'],
                    normalArray: ['existingValue']
                }
            };

            // Pass custom dontMergeFields with 'customArray'
            configService.mergeHookConfig(
                'test-hook-for-config-tests',
                configMap,
                ['config'],
                ['branded-config'],
                ['customArray']
            );

            // customArray should be replaced (in dontMergeFields)
            expect(configMap.customDontMergeBlock.customArray).to.deep.equal(['new1', 'new2']);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Multiple config directories
        // -------------------------------------------------------------------------
        it('should process multiple config directories', function (done) {
            const formConfigDir = path.join(testHookDir, 'form-config');
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(formConfigDir);
            fs.ensureDirSync(configDir);

            const formConfig = { formData: { type: 'form' } };
            const regularConfig = { regularData: { type: 'regular' } };

            fs.writeFileSync(
                path.join(formConfigDir, 'form.js'),
                `module.exports = ${JSON.stringify(formConfig)};`
            );
            fs.writeFileSync(
                path.join(configDir, 'regular.js'),
                `module.exports = ${JSON.stringify(regularConfig)};`
            );

            const configMap: any = {};
            configService.mergeHookConfig('test-hook-for-config-tests', configMap);

            expect(configMap.formData).to.deep.equal({ type: 'form' });
            expect(configMap.regularData).to.deep.equal({ type: 'regular' });
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle directory read error in walkDirSync
        // -------------------------------------------------------------------------
        it('should handle errors when walking directories', function (done) {
            // Create a directory but make the nested walk fail by having a symlink to non-existent
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            // Create a valid config file
            const validConfig = { validConfigKey: 'validValue' };
            fs.writeFileSync(
                path.join(configDir, 'valid.js'),
                `module.exports = ${JSON.stringify(validConfig)};`
            );

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig('test-hook-for-config-tests', configMap);
            }).to.not.throw();

            expect(configMap.validConfigKey).to.equal('validValue');
            done();
        });
    });

    describe('Translation file merging', function () {
        let testHookDir;
        let fs;

        before(function () {
            fs = require('fs-extra');
            testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-translation-hook');
        });

        afterEach(function () {
            try {
                if (fs.pathExistsSync(testHookDir)) {
                    fs.removeSync(testHookDir);
                }
                // Cleanup test locale files
                const testLocalePath = path.join(sails.config.appPath, 'assets', 'locales', 'test-locale-config');
                if (fs.pathExistsSync(testLocalePath)) {
                    fs.removeSync(testLocalePath);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        });

        // -------------------------------------------------------------------------
        // Test: Merge translation JSON files
        // -------------------------------------------------------------------------
        it('should merge translation JSON files from hook locales', function (done) {
            // Create locale directories in hook and app
            const hookLocaleDir = path.join(testHookDir, 'locales', 'en');
            const appLocaleDir = path.join(sails.config.appPath, 'assets', 'locales', 'en');

            fs.ensureDirSync(hookLocaleDir);
            fs.ensureDirSync(appLocaleDir);

            // Create app translation file
            const appTranslation = {
                existingKey: 'existing value',
                sharedKey: 'app value'
            };
            fs.writeFileSync(
                path.join(appLocaleDir, 'translation.json'),
                JSON.stringify(appTranslation)
            );

            // Create hook translation file
            const hookTranslation = {
                newKey: 'new value',
                sharedKey: 'hook value'
            };
            fs.writeFileSync(
                path.join(hookLocaleDir, 'translation.json'),
                JSON.stringify(hookTranslation)
            );

            // We need a config dir to trigger the merge
            fs.ensureDirSync(path.join(testHookDir, 'config'));

            configService.mergeHookConfig('test-translation-hook');

            // Read merged translation
            const mergedTranslation = require(path.join(appLocaleDir, 'translation.json'));

            expect(mergedTranslation.existingKey).to.equal('existing value');
            expect(mergedTranslation.newKey).to.equal('new value');
            expect(mergedTranslation.sharedKey).to.equal('hook value'); // Hook overrides

            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle non-existent locales directory
        // -------------------------------------------------------------------------
        it('should handle non-existent locales directory gracefully', function (done) {
            // Create hook with config but no locales
            fs.ensureDirSync(path.join(testHookDir, 'config'));

            const testConfig = { noLocalesConfig: { value: 'test' } };
            fs.writeFileSync(
                path.join(testHookDir, 'config', 'test.js'),
                `module.exports = ${JSON.stringify(testConfig)};`
            );

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig('test-translation-hook', configMap);
            }).to.not.throw();

            expect(configMap.noLocalesConfig).to.deep.equal({ value: 'test' });
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Create core language backup when merging
        // -------------------------------------------------------------------------
        it('should create core language backup when merging translations', function (done) {
            const hookLocaleDir = path.join(testHookDir, 'locales', 'en');
            const appLocaleDir = path.join(sails.config.appPath, 'assets', 'locales', 'en');

            fs.ensureDirSync(hookLocaleDir);
            fs.ensureDirSync(appLocaleDir);

            // Remove any existing core backup
            const coreBackupPath = path.join(appLocaleDir, 'translation-core.json');
            if (fs.pathExistsSync(coreBackupPath)) {
                fs.removeSync(coreBackupPath);
            }

            // Create app translation
            const appTranslation = { originalKey: 'original value' };
            fs.writeFileSync(
                path.join(appLocaleDir, 'translation.json'),
                JSON.stringify(appTranslation)
            );

            // Create hook translation
            const hookTranslation = { hookKey: 'hook value' };
            fs.writeFileSync(
                path.join(hookLocaleDir, 'translation.json'),
                JSON.stringify(hookTranslation)
            );

            fs.ensureDirSync(path.join(testHookDir, 'config'));

            // Ensure dontBackupCoreLanguageFilesWhenMerging is false
            const originalBackupSetting = sails.config.dontBackupCoreLanguageFilesWhenMerging;
            sails.config.dontBackupCoreLanguageFilesWhenMerging = false;

            configService.mergeHookConfig('test-translation-hook');

            // Core backup should be created
            expect(fs.pathExistsSync(coreBackupPath)).to.be.true;

            // Cleanup
            sails.config.dontBackupCoreLanguageFilesWhenMerging = originalBackupSetting;
            done();
        });
    });

    describe('Branded config processing', function () {
        let testHookDir;
        let fs;

        before(function () {
            fs = require('fs-extra');
            testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-hook-for-config-tests');
        });

        afterEach(function () {
            try {
                if (fs.pathExistsSync(testHookDir)) {
                    fs.removeSync(testHookDir);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        });

        // -------------------------------------------------------------------------
        // Test: Handle non-existent branded-config directory
        // -------------------------------------------------------------------------
        it('should handle non-existent branded-config directory gracefully', function (done) {
            fs.ensureDirSync(path.join(testHookDir, 'config'));

            const testConfig = { noBrandedConfig: { value: 'test' } };
            fs.writeFileSync(
                path.join(testHookDir, 'config', 'test.js'),
                `module.exports = ${JSON.stringify(testConfig)};`
            );

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig('test-hook-for-config-tests', configMap);
            }).to.not.throw();

            expect(configMap.noBrandedConfig).to.deep.equal({ value: 'test' });
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Skip files in branded-config (expects directories only)
        // -------------------------------------------------------------------------
        it('should skip files in branded-config directory (expects directories)', function (done) {
            const brandedConfigDir = path.join(testHookDir, 'branded-config');
            fs.ensureDirSync(brandedConfigDir);

            // Create a file directly in branded-config (should be skipped)
            fs.writeFileSync(
                path.join(brandedConfigDir, 'should-skip.txt'),
                'this file should be skipped'
            );

            // Also add a config dir so merge runs
            fs.ensureDirSync(path.join(testHookDir, 'config'));
            const testConfig = { brandedSkipTest: { ran: true } };
            fs.writeFileSync(
                path.join(testHookDir, 'config', 'skip-test.js'),
                `module.exports = ${JSON.stringify(testConfig)};`
            );

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig('test-hook-for-config-tests', configMap);
            }).to.not.throw();

            expect(configMap.brandedSkipTest).to.deep.equal({ ran: true });
            done();
        });
    });

    describe('Edge cases', function () {
        let fs;

        before(function () {
            fs = require('fs-extra');
        });

        // -------------------------------------------------------------------------
        // Test: Empty arrays for config_dirs
        // -------------------------------------------------------------------------
        it('should handle empty config_dirs array', function (done) {
            const testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-empty-dirs-hook');
            fs.ensureDirSync(testHookDir);

            const configMap = { existing: 'value' };
            expect(() => {
                configService.mergeHookConfig('test-empty-dirs-hook', configMap, [], []);
            }).to.not.throw();

            expect(configMap.existing).to.equal('value');

            // Cleanup
            fs.removeSync(testHookDir);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Merging with existing complex config
        // -------------------------------------------------------------------------
        it('should deeply merge complex nested configurations', function (done) {
            const testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-deep-merge-hook');
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            const hookConfig = {
                deepMergeTest: {
                    level1: {
                        level2: {
                            newKey: 'new value',
                            sharedKey: 'hook value'
                        }
                    }
                }
            };
            fs.writeFileSync(
                path.join(configDir, 'deep.js'),
                `module.exports = ${JSON.stringify(hookConfig)};`
            );

            const configMap: any = {
                deepMergeTest: {
                    level1: {
                        level2: {
                            existingKey: 'existing value',
                            sharedKey: 'original value'
                        },
                        anotherLevel: {
                            untouched: true
                        }
                    }
                }
            };

            configService.mergeHookConfig('test-deep-merge-hook', configMap);

            expect(configMap.deepMergeTest.level1.level2.existingKey).to.equal('existing value');
            expect(configMap.deepMergeTest.level1.level2.newKey).to.equal('new value');
            expect(configMap.deepMergeTest.level1.level2.sharedKey).to.equal('hook value');
            expect(configMap.deepMergeTest.level1.anotherLevel.untouched).to.be.true;

            // Cleanup
            fs.removeSync(testHookDir);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Config file that exports function
        // -------------------------------------------------------------------------
        it('should handle config files that export functions', function (done) {
            const testHookDir = path.join(sails.config.appPath, 'node_modules', 'test-function-config-hook');
            const configDir = path.join(testHookDir, 'config');
            fs.ensureDirSync(configDir);

            const configCode = `
        module.exports = {
          functionConfigTest: {
            myFunction: function() { return 'hello'; },
            myValue: 'static'
          }
        };
      `;
            fs.writeFileSync(path.join(configDir, 'function-config.js'), configCode);

            const configMap: any = {};
            expect(() => {
                configService.mergeHookConfig('test-function-config-hook', configMap);
            }).to.not.throw();

            expect(configMap.functionConfigTest.myValue).to.equal('static');
            expect(typeof configMap.functionConfigTest.myFunction).to.equal('function');

            // Cleanup
            fs.removeSync(testHookDir);
            done();
        });
    });
});
