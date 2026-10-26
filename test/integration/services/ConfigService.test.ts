const { portalFixture: portal } = require('../../helpers/portalFixture.cjs');
import { expect } from 'chai';
import { resolveBrandConfiguration, resolveStartupConfiguration, loadStartupConfiguration } from '@researchdatabox/redbox-core/configuration';
import { resolveExtensions, discoverInstalledExtensions } from '@researchdatabox/redbox-core/extensions';
import { z } from 'zod';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const _ = require('lodash');

describe('Explicit configuration and extension resolution', () => {
    const fixture: { config: any; owner: { config: any } } = { config: {}, owner: { config: {} } };
    const configService = { getBrand: (brand: string, block: string) => resolveBrandConfiguration(brand, block, {
        defaultBrand: fixture.config.auth.defaultBrand,
        readBrand: typeof fixture.config.brandingAware === 'function' ? name => fixture.config.brandingAware(name) : () => undefined,
        defaults: fixture.config.brandingConfigurationDefaults, legacy: fixture.config,
    }) };
    beforeEach(() => { fixture.config = _.cloneDeep(portal.config); fixture.owner.config = fixture.config; });
    describe('getBrand', function () {
        // -------------------------------------------------------------------------
        // Test: Basic resolution from brandingAware with specified brand
        // -------------------------------------------------------------------------
        it('should resolve config from brandingAware for specified brand', function (done) {
            // Setup: Make brandingAware return config for test brand
            const testConfigValue = { testKey: 'testValue' };
            fixture.config.brandingAware = (brandName) => {
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
            const defaultBrand = _.get(fixture.owner, 'config.auth.defaultBrand', 'default');

            fixture.config.brandingAware = (brandName) => {
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
            fixture.config.brandingAware = () => ({});
            fixture.config.brandingConfigurationDefaults = {
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
            fixture.config.brandingAware = () => ({});
            fixture.config.brandingConfigurationDefaults = {};
            fixture.config.legacyBlock = {
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
            const defaultBrand = _.get(fixture.owner, 'config.auth.defaultBrand', 'default');

            fixture.config.brandingAware = () => ({});
            fixture.config.brandingConfigurationDefaults = {};
            fixture.config.anotherLegacyBlock = {};
            fixture.config.anotherLegacyBlock[defaultBrand] = legacyDefaultValue;

            const result = configService.getBrand('unknownBrand', 'anotherLegacyBlock');
            expect(result).to.deep.equal(legacyDefaultValue);
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Return undefined when no config exists anywhere
        // -------------------------------------------------------------------------
        it('should return undefined when no config exists anywhere', function (done) {
            fixture.config.brandingAware = () => ({});
            fixture.config.brandingConfigurationDefaults = {};

            const result = configService.getBrand('anyBrand', 'nonExistentBlock');
            expect(result).to.be.undefined;
            done();
        });

        // -------------------------------------------------------------------------
        // Test: Handle empty brand name
        // -------------------------------------------------------------------------
        it('should handle empty brand name by falling back to defaults', function (done) {
            const defaultConfigValue = { emptyBrandKey: 'emptyBrandValue' };
            const defaultBrand = _.get(fixture.owner, 'config.auth.defaultBrand', 'default');

            fixture.config.brandingAware = (brandName) => {
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
            const defaultBrand = _.get(fixture.owner, 'config.auth.defaultBrand', 'default');

            fixture.config.brandingAware = (brandName) => {
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
            fixture.config.brandingAware = 'not a function';
            fixture.config.brandingConfigurationDefaults = {
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
            fixture.config.brandingAware = (brandName) => {
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
            fixture.config.brandingAware = (brandName) => {
                // Returns object but without the requested config block
                return { otherBlock: 'something' };
            };
            fixture.config.brandingConfigurationDefaults = {
                requestedBlock: defaultsValue
            };

            const result = configService.getBrand('anyBrand', 'requestedBlock');
            expect(result).to.deep.equal(defaultsValue);
            done();
        });
    });


    // V6 replacements for the retired directory-scanning/imperative merger cases.
    // Each case checks the corresponding supported declaration or explicit rejection.
    describe('offline v6 declarations and application files', () => {
        let root: string;
        const schema = z.object({ feature: z.object({ enabled: z.boolean(), nested: z.record(z.string(), z.unknown()).optional() }).strict(), fields: z.array(z.string()), transform: z.custom<(...args: never[]) => unknown>(v => typeof v === 'function').optional() }).strict();
        const core = { source: 'core', values: { feature: { enabled: false }, fields: ['one', 'two'] } };
        const resolve = (values: Record<string, unknown>, extra = {}) => resolveStartupConfiguration({ schema, core, application: { source: 'application', values }, ...extra });
        const write = async (name: string, source: string) => {
            const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, source); return file;
        };
        beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'redbox-v6-config-')); });
        afterEach(async () => { await rm(root, { recursive: true, force: true }); });
        it('does not discover undeclared hook directories', async () => {
            await write('package.json', JSON.stringify({ name: 'application', dependencies: {} }));
            await write('hooks/undeclared/config/custom.cjs', 'throw Error("must not execute")');
            expect((await discoverInstalledExtensions(root)).extensions).to.deep.equal([]);
        });
        it('loads the explicitly selected configuration data module', async () => {
            const file = await write('hook/config.cjs', 'module.exports = { feature: { enabled: true } };');
            expect((await loadStartupConfiguration({ schema, core, files: { application: file } })).feature.enabled).to.equal(true);
        });
        it('rejects the removed _dontMerge directive with its source path', () => {
            expect(() => resolve({ feature: { enabled: true, _dontMerge: true } })).to.throw(/application.*feature/);
        });
        it('rejects the removed _delete directive instead of deleting keys implicitly', () => {
            expect(() => resolve({ feature: { _delete: ['enabled'] } })).to.throw(/application.*feature/);
        });
        it('loads nested configuration only through an explicit module', async () => {
            await write('nested/deep/feature.cjs', 'module.exports = { enabled: true };');
            const file = await write('application.cjs', 'module.exports = { feature: require("./nested/deep/feature.cjs") };');
            expect((await loadStartupConfiguration({ schema, core, files: { application: file } })).feature.enabled).to.equal(true);
        });
        it('keeps declared forms in the extension without a form-config registry', () => {
            const form = { name: 'explicit-form' };
            const selected = resolveExtensions([{ name: 'hook', root, declaration: { apiVersion: 1, forms: { demo: form } } }]);
            expect(selected.providers[0].declaration.forms?.demo).to.equal(form);
        });
        it('retains installed asset roots without copying into the application', async () => {
            await write('hook/assets/custom.css', 'body { color: red }');
            const selected = resolveExtensions([{ name: 'hook', root: path.join(root, 'hook'), declaration: { apiVersion: 1, assets: ['assets'] } }]);
            expect(selected.assets).to.deep.equal([path.join(root, 'hook', 'assets')]);
            expect(await readdir(root)).to.deep.equal(['hook']);
        });
        it('retains installed view roots without copying into the application', async () => {
            await write('hook/views/home.ejs', 'explicit view');
            const selected = resolveExtensions([{ name: 'hook', root: path.join(root, 'hook'), declaration: { apiVersion: 1, views: ['views'] } }]);
            expect(selected.views).to.deep.equal([path.join(root, 'hook', 'views')]);
            expect(await readdir(root)).to.deep.equal(['hook']);
        });
        it('selects named service factories without constructing them during resolution', () => {
            let calls = 0;
            const create = () => { calls++; return { initialize: async () => {}, close: async () => {} }; };
            const selected = resolveExtensions([{ name: 'hook', root, declaration: { apiVersion: 1, modules: [{ name: 'service', create }] } }]);
            expect(selected.modules.find(item => item.declaration.name === 'service')?.declaration.create).to.equal(create);
            expect(calls).to.equal(0);
        });
        it('selects named request handlers without a controller registry', () => {
            const create = () => (_req: unknown, _res: unknown) => {};
            const selected = resolveExtensions([{ name: 'hook', root, declaration: { apiVersion: 1, handlers: [{ name: 'show', create }] } }]);
            expect(selected.handlers.find(item => item.declaration.name === 'show')?.declaration.create).to.equal(create);
        });
        it('rejects legacy response configuration instead of copying response shims', () => {
            expect(() => resolve({ responses: { ok: 'custom' } })).to.throw(/Configuration application at responses/);
        });
        it('resolves the installed package root independently of the working directory', async () => {
            await write('package.json', JSON.stringify({ name: 'application', dependencies: { 'example-hook': '1.0.0' } }));
            await write('node_modules/example-hook/package.json', JSON.stringify({ name: 'example-hook', version: '1.0.0', redbox: { extension: './extension' } }));
            expect((await discoverInstalledExtensions(root)).extensions[0].root).to.equal(path.join(root, 'node_modules/example-hook'));
        });
        it('replaces fields arrays by default', () => {
            expect(resolve({ fields: ['replacement'] }).fields).to.deep.equal(['replacement']);
            expect(core.values.fields).to.deep.equal(['one', 'two']);
        });
        it('uses declared array replacement instead of a custom dontMergeFields argument', () => {
            expect(resolve({ fields: [] }).fields).to.deep.equal([]);
            expect(() => resolve({ dontMergeFields: ['fields'] })).to.throw(/application/);
        });
        it('resolves multiple explicit file layers in documented order', async () => {
            const application = await write('application.cjs', 'module.exports = { feature: { enabled: true } };');
            const local = await write('local.cjs', 'module.exports = { feature: { enabled: false } };');
            expect((await loadStartupConfiguration({ schema, core, files: { application, local } })).feature.enabled).to.equal(false);
        });
        it('reports an inaccessible selected module without scanning a fallback directory', async () => {
            let failure: unknown;
            try { await loadStartupConfiguration({ schema, core, files: { application: path.join(root, 'missing.cjs') } }); } catch (error) { failure = error; }
            expect(String(failure)).to.match(/application file.*cannot asynchronously load/);
        });
        it('merges explicit translation data without rewriting locale JSON', async () => {
            const file = await write('locales/en.json', '{"original":"retained"}');
            const localeSchema = z.object({ translations: z.record(z.string(), z.string()) }).strict();
            const result = resolveStartupConfiguration({ schema: localeSchema, core: { source: 'core', values: { translations: { original: 'retained' } } }, application: { source: 'hook', values: { translations: { added: 'translation' } } } });
            expect(result.translations).to.deep.equal({ original: 'retained', added: 'translation' });
            expect(await readFile(file, 'utf8')).to.equal('{"original":"retained"}');
        });
        it('does not require a locales directory for a data-only extension', () => {
            expect(resolve({}).feature).to.deep.equal({ enabled: false });
        });
        it('preserves locale input files without creating mutable backup files', async () => {
            await write('locales/en.json', '{"title":"original"}');
            resolve({ feature: { enabled: true } });
            expect(await readdir(path.join(root, 'locales'))).to.deep.equal(['en.json']);
            expect(await readFile(path.join(root, 'locales/en.json'), 'utf8')).to.equal('{"title":"original"}');
        });
        it('needs no implicit branded-config directory for brand defaults', () => {
            expect(configService.getBrand('default', 'nonexistent')).to.equal(undefined);
            expect(resolve({}).feature.enabled).to.equal(false);
        });
        it('does not execute stray files from a branded-config directory', async () => {
            await write('branded-config/stray.cjs', 'throw Error("must not run")');
            expect(resolve({ feature: { enabled: true } }).feature.enabled).to.equal(true);
            expect(await readFile(path.join(root, 'branded-config/stray.cjs'), 'utf8')).to.include('must not run');
        });
        it('resolves an empty extension list without scanning config_dirs', () => {
            expect(resolve({}, { extensions: resolveExtensions([]) }).feature.enabled).to.equal(false);
            expect(() => resolve({ config_dirs: [] })).to.throw(/application/);
        });
        it('deeply merges nested data without mutating either input', () => {
            const base = { source: 'core', values: { feature: { enabled: false, nested: { one: { a: 1 }, retained: true } }, fields: ['base'] } };
            const result = resolve({ feature: { nested: { one: { b: 2 } } } }, { core: base });
            expect(result.feature.nested).to.deep.equal({ one: { a: 1, b: 2 }, retained: true });
            expect(base.values.feature.nested.one).to.deep.equal({ a: 1 });
            expect(Object.isFrozen(result.feature.nested)).to.equal(true);
        });
        it('retains functions only at explicitly typed executable positions', () => {
            const transform = () => 'retained';
            expect(() => resolve({ transform })).to.throw(/transform.*executable value/);
            expect(resolve({ transform }, { executablePaths: ['transform'] }).transform).to.equal(transform);
        });
    });
});
