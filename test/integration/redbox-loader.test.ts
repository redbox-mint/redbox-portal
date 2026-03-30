
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
const fsPromises = fs.promises;
import * as os from 'os';

// Resolve redbox-loader path dynamically to support running from:
// 1. TypeScript source: typescript/test/integration/redbox-loader.test.ts (needs ../../../)
// 2. Compiled JavaScript: test/integration/redbox-loader.test.js (needs ../../)
const possiblePaths = [
    path.resolve(__dirname, '../../../redbox-loader.js'),
    path.resolve(__dirname, '../../redbox-loader.js')
];

const loaderPath = possiblePaths.find(p => fs.existsSync(p));

if (!loaderPath) {
    throw new Error(`Could not find redbox-loader.js. Searched in: ${possiblePaths.join(', ')}`);
}

const redboxLoader = require(loaderPath);

describe('redbox-loader', function () {
    this.timeout(10000);

    // Create a unique temp directory for each test run
    const sandboxDir = path.join(os.tmpdir(), 'redbox-loader-test-' + Date.now());
    let originalEnv: NodeJS.ProcessEnv;

    before(async function () {
        // Ensure we can load the module and it doesn't crash
        expect(redboxLoader).to.be.an('object');
    });

    beforeEach(async function () {
        originalEnv = { ...process.env };
        await fsPromises.mkdir(sandboxDir, { recursive: true });
        // Create basic api structure
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'models'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'policies'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'middleware'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'responses'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'services'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'controllers'), { recursive: true });
        await fsPromises.mkdir(path.join(sandboxDir, 'api', 'form-config'), { recursive: true });
        // Create config directory for config shims and bootstrap
        await fsPromises.mkdir(path.join(sandboxDir, 'config'), { recursive: true });

        // Mock package.json
        await fsPromises.writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify({
            name: 'test-app',
            dependencies: {},
            devDependencies: {}
        }));
    });

    afterEach(async function () {
        process.env = originalEnv;
        try {
            await fsPromises.rm(sandboxDir, { recursive: true, force: true });
        } catch (e: any) {
            console.warn('Could not cleanup sandbox:', e.message);
        }
    });

    describe('writeFileIfChanged', function () {
        it('should write file if it does not exist', async function () {
            const file = path.join(sandboxDir, 'test.txt');
            const written = await redboxLoader.writeFileIfChanged(file, 'hello');
            expect(written).to.be.true;
            const content = await fsPromises.readFile(file, 'utf8');
            expect(content).to.equal('hello');
        });

        it('should write file if content is different', async function () {
            const file = path.join(sandboxDir, 'test.txt');
            await fsPromises.writeFile(file, 'hello');

            const written = await redboxLoader.writeFileIfChanged(file, 'world');
            expect(written).to.be.true;
            const content = await fsPromises.readFile(file, 'utf8');
            expect(content).to.equal('world');
        });

        it('should NOT write file if content is identical', async function () {
            const file = path.join(sandboxDir, 'test.txt');
            await fsPromises.writeFile(file, 'hello');

            // Ensure file mtime is older
            const oldTime = new Date('2020-01-01');
            await fsPromises.utimes(file, oldTime, oldTime);

            const written = await redboxLoader.writeFileIfChanged(file, 'hello');
            expect(written).to.be.false;

            const stat = await fsPromises.stat(file);
            expect(stat.mtime.getTime()).to.equal(oldTime.getTime());
        });
    });

    describe('shouldRegenerateShims', function () {
        it('should return true if NODE_ENV is not production', async function () {
            process.env.NODE_ENV = 'development';
            const result = await redboxLoader.shouldRegenerateShims(sandboxDir, false);
            expect(result.shouldRegenerate).to.be.true;
            expect(result.reason).to.include('NODE_ENV');
        });

        it('should return true if .regenerate-shims exists', async function () {
            process.env.NODE_ENV = 'production';
            await fsPromises.writeFile(path.join(sandboxDir, '.regenerate-shims'), '');

            const result = await redboxLoader.shouldRegenerateShims(sandboxDir, false);
            expect(result.shouldRegenerate).to.be.true;
            expect(result.reason).to.include('marker file exists');
            expect(result.deleteMarker).to.be.true;
        });

        it('should return true if forceRegenerate is true', async function () {
            process.env.NODE_ENV = 'production';
            const result = await redboxLoader.shouldRegenerateShims(sandboxDir, true);
            expect(result.shouldRegenerate).to.be.true;
            expect(result.reason).to.include('REGENERATE_SHIMS');
        });

        it('should return true if any directory is empty', async function () {
            process.env.NODE_ENV = 'production';
            // api/models is empty by default in setup
            const result = await redboxLoader.shouldRegenerateShims(sandboxDir, false);
            expect(result.shouldRegenerate).to.be.true;
            expect(result.reason).to.include('is empty');
        });

        it('should return false via existing files and production env', async function () {
            process.env.NODE_ENV = 'production';
            // Populate dirs
            await fsPromises.writeFile(path.join(sandboxDir, 'api/models/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/policies/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/middleware/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/responses/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/services/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/controllers/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/form-config/index.js'), 'x');

            const result = await redboxLoader.shouldRegenerateShims(sandboxDir, false);
            expect(result.shouldRegenerate).to.be.false;
        });
    });

    describe('generateAllShims', function () {
        it('should skip generation if not needed', async function () {
            process.env.NODE_ENV = 'production';
            // Populate dirs
            await fsPromises.writeFile(path.join(sandboxDir, 'api/models/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/policies/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/middleware/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/responses/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/services/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/controllers/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/form-config/index.js'), 'x');

            const result = await redboxLoader.generateAllShims(sandboxDir);
            expect(result.skipped).to.be.true;
        });

        it('should generate shims when forced', async function () {
            process.env.NODE_ENV = 'production';
            // Even if populated, force it
            await fsPromises.writeFile(path.join(sandboxDir, 'api/models/test.js'), 'x');

            const result = await redboxLoader.generateAllShims(sandboxDir, { forceRegenerate: true });
            expect(result.skipped).to.be.false;
            expect(result.stats).to.exist;
        });

        it('should delete marker file after regeneration', async function () {
            process.env.NODE_ENV = 'production';
            await fsPromises.writeFile(path.join(sandboxDir, '.regenerate-shims'), '');
            // Populate dirs to avoid "is empty" reason taking precedence?
            await fsPromises.writeFile(path.join(sandboxDir, 'api/models/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/policies/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/middleware/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/responses/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/services/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/controllers/test.js'), 'x');
            await fsPromises.writeFile(path.join(sandboxDir, 'api/form-config/index.js'), 'x');

            const result = await redboxLoader.generateAllShims(sandboxDir);
            expect(result.skipped).to.be.false;

            try {
                await fsPromises.access(path.join(sandboxDir, '.regenerate-shims'));
                expect.fail('Marker file should be deleted');
            } catch (e: any) {
                expect(e.code).to.equal('ENOENT');
            }
        });

        it('should include bootstrapStats in result', async function () {
            const result = await redboxLoader.generateAllShims(sandboxDir, { forceRegenerate: true });
            expect(result.skipped).to.be.false;
            expect(result.stats.bootstrapStats).to.exist;
            expect(result.stats.bootstrapStats.total).to.equal(1);
            expect(result.stats.bootstrapStats.hookCount).to.be.a('number');
        });
    });

    describe('generateFormConfigShims', function () {
        let formConfigDir: string;

        beforeEach(async function () {
            formConfigDir = path.join(sandboxDir, 'api', 'form-config');
            await fsPromises.mkdir(formConfigDir, { recursive: true });
        });

        it('should include core forms when LOAD_DEFAULT_FORMS=true', async function () {
            process.env.LOAD_DEFAULT_FORMS = 'true';
            await redboxLoader.generateFormConfigShims(formConfigDir, {});

            const content = await fsPromises.readFile(path.join(formConfigDir, 'index.js'), 'utf8');
            expect(content).to.include("default-1.0-draft");
        });

        it('should use hook-only registry when LOAD_DEFAULT_FORMS=false', async function () {
            process.env.LOAD_DEFAULT_FORMS = 'false';
            const hookFormConfigs = {
                'hook-form': { module: 'hook-module' }
            };
            await redboxLoader.generateFormConfigShims(formConfigDir, hookFormConfigs);

            const content = await fsPromises.readFile(path.join(formConfigDir, 'index.js'), 'utf8');
            expect(content).to.include("'hook-form'");
            expect(content).to.not.include("default-1.0-draft");
        });

        it('should treat missing LOAD_DEFAULT_FORMS as hook-only', async function () {
            delete process.env.LOAD_DEFAULT_FORMS;
            const hookFormConfigs = {
                'hook-form': { module: 'hook-module' }
            };
            await redboxLoader.generateFormConfigShims(formConfigDir, hookFormConfigs);

            const content = await fsPromises.readFile(path.join(formConfigDir, 'index.js'), 'utf8');
            expect(content).to.include("'hook-form'");
            expect(content).to.not.include("default-1.0-draft");
        });

        it('should treat invalid LOAD_DEFAULT_FORMS as hook-only', async function () {
            process.env.LOAD_DEFAULT_FORMS = 'maybe';
            const hookFormConfigs = {
                'hook-form': { module: 'hook-module' }
            };
            await redboxLoader.generateFormConfigShims(formConfigDir, hookFormConfigs);

            const content = await fsPromises.readFile(path.join(formConfigDir, 'index.js'), 'utf8');
            expect(content).to.include("'hook-form'");
            expect(content).to.not.include("default-1.0-draft");
        });
    });

    describe('generateBootstrapShim', function () {
        let configDir: string;

        beforeEach(async function () {
            configDir = path.join(sandboxDir, 'config');
            await fsPromises.mkdir(configDir, { recursive: true });
        });

        it('should generate bootstrap.js with no hook bootstraps', async function () {
            const result = await redboxLoader.generateBootstrapShim(configDir, []);
            expect(result.generated).to.equal(1);
            expect(result.total).to.equal(1);
            expect(result.hookCount).to.equal(0);

            const content = await fsPromises.readFile(path.join(configDir, 'bootstrap.js'), 'utf8');
            expect(content).to.include('Auto-generated by redbox-loader.js');
            expect(content).to.include('coreBootstrap');
            expect(content).to.include('preLiftSetup');
            expect(content).to.include('module.exports.bootstrap');
        });

        it('should generate bootstrap.js with hook bootstraps', async function () {
            const hookBootstraps = [
                { name: 'test-hook', module: 'test-hook' },
                { name: '@org/another-hook', module: '@org/another-hook' }
            ];

            const result = await redboxLoader.generateBootstrapShim(configDir, hookBootstraps);
            expect(result.hookCount).to.equal(2);

            const content = await fsPromises.readFile(path.join(configDir, 'bootstrap.js'), 'utf8');
            expect(content).to.include('test_hook_bootstrap');
            expect(content).to.include('_org_another_hook_bootstrap');
            expect(content).to.include("require('test-hook')");
            expect(content).to.include("require('@org/another-hook')");
            expect(content).to.include('Hook bootstrap complete: test-hook');
        });

        it('should not rewrite if content unchanged', async function () {
            // Generate once
            await redboxLoader.generateBootstrapShim(configDir, []);

            // Mark file with old mtime
            const file = path.join(configDir, 'bootstrap.js');
            const oldTime = new Date('2020-01-01');
            await fsPromises.utimes(file, oldTime, oldTime);

            // Generate again with same input
            const result = await redboxLoader.generateBootstrapShim(configDir, []);
            expect(result.generated).to.equal(0);

            const stat = await fsPromises.stat(file);
            expect(stat.mtime.getTime()).to.equal(oldTime.getTime());
        });
    });

    describe('findAndRegisterHooks', function () {
        it('should return empty arrays for hooks when no dependencies have sails config', async function () {
            const result = await redboxLoader.findAndRegisterHooks(sandboxDir);
            expect(result.hookModels).to.deep.equal({});
            expect(result.hookPolicies).to.deep.equal({});
            expect(result.hookBootstraps).to.deep.equal([]);
        });

        // Note: Testing actual hook discovery requires real modules in node_modules
        // which require.resolve can find.
        // Here we just verify the function handles dependencies without crashing.
        it('should handle dependencies that do not have sails config gracefully', async function () {
            // Update sandbox package.json to include a fake dependency
            // that won't be found (simulates require.resolve failure)
            await fsPromises.writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify({
                name: 'test-app',
                dependencies: {
                    'nonexistent-module': '1.0.0'
                }
            }));

            const result = await redboxLoader.findAndRegisterHooks(sandboxDir);
            // Should not crash, just return empty
            expect(result.hookBootstraps).to.be.an('array');
        });
    });
});
