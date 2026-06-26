let expect: Chai.ExpectStatic;
import * as path from 'path';
import * as fs from 'fs';
import * as vm from 'vm';
const fsPromises = fs.promises;
import * as os from 'os';
import * as sinon from 'sinon';

import * as redboxLoader from '../../src/loader';

async function createHookModule(sandboxDir: string, packageName: string, packageJson: Record<string, unknown>, indexJs: string): Promise<void> {
    const moduleDir = path.join(sandboxDir, 'node_modules', packageName);
    await fsPromises.mkdir(moduleDir, { recursive: true });
    await fsPromises.writeFile(path.join(moduleDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    await fsPromises.writeFile(path.join(moduleDir, 'index.js'), indexJs);
}

describe('redbox-loader', function () {
    this.timeout(10000);

    // Create a unique temp directory for each test run
    const sandboxDir = path.join(os.tmpdir(), 'redbox-loader-test-' + Date.now());
    let originalEnv: NodeJS.ProcessEnv;

    before(async function () {
        ({ expect } = await import('chai'));
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
            if (result.skipped) {
                throw new Error('Expected shim generation to run');
            }
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
            if (result.skipped) {
                throw new Error('Expected shim generation to run');
            }
            expect(result.stats.bootstrapStats).to.exist;
            expect(result.stats.bootstrapStats.total).to.equal(1);
            expect(result.stats.bootstrapStats.hookCount).to.be.a('number');
        });

        it('should include migrationStats in result', async function () {
            const result = await redboxLoader.generateAllShims(sandboxDir, { forceRegenerate: true });
            expect(result.skipped).to.be.false;
            if (result.skipped) {
                throw new Error('Expected shim generation to run');
            }
            expect(result.stats.migrationStats).to.exist;
            expect(result.stats.migrationStats.total).to.equal(1);
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
            expect(content).to.not.include('{{{');
            expect(() => new vm.Script(content)).to.not.throw();
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

    describe('generateModelShims', function () {
        let modelsDir: string;

        beforeEach(async function () {
            modelsDir = path.join(sandboxDir, 'api', 'models');
            await fsPromises.mkdir(modelsDir, { recursive: true });
        });

        it('should generate hook model shims using runtime require access', async function () {
            const hookModels = {
                HookModel: {
                    module: 'test-hook',
                    model: {
                        attributes: {
                            title: { type: 'string' }
                        }
                    }
                }
            };

            const result = await redboxLoader.generateModelShims(modelsDir, hookModels);
            expect(result.fromHooks).to.equal(1);

            const content = await fsPromises.readFile(path.join(modelsDir, 'HookModel.js'), 'utf8');
            expect(content).to.include("Provided by: test-hook");
            expect(content).to.include("require('test-hook').registerRedboxModels()['HookModel']");
            expect(content).to.include("globalId: 'HookModel'");
            expect(content).to.not.include('JSON.stringify');
        });
    });

    describe('generateConfigShims', function () {
        let configDir: string;

        beforeEach(async function () {
            configDir = path.join(sandboxDir, 'config');
            await fsPromises.mkdir(configDir, { recursive: true });
        });

        it('should sanitize package names with dots when generating config shims', async function () {
            const hookConfigs = [
                { name: '@org/test.hook', module: '@org/test.hook' }
            ];

            await redboxLoader.generateConfigShims(configDir, hookConfigs);

            const generatedFiles = await fsPromises.readdir(configDir);
            const shimContents = await Promise.all(
                generatedFiles
                    .filter(name => name.endsWith('.js') && name !== 'datastores.js')
                    .map(name => fsPromises.readFile(path.join(configDir, name), 'utf8'))
            );

            expect(shimContents.some(content =>
                content.includes("const _org_test_hook_config = require('@org/test.hook').registerRedboxConfig();")
            )).to.be.true;
            expect(shimContents.some(content => content.includes('test.hook_config'))).to.be.false;
        });

        it('should merge agenda queue jobs as a map keyed by name', function () {
            const merged = redboxLoader.mergeRedboxConfig('agendaQueue', {
                jobs: {
                    'IntegrationAuditService-StoreIntegrationAudit': {
                        fnName: 'integrationauditservice.storeIntegrationAudit',
                        options: { lockLifetime: 30000 }
                    },
                    'MoveCompletedJobsToHistory': {
                        fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
                        schedule: {
                            method: 'every',
                            intervalOrSchedule: '5 minutes'
                        }
                    }
                }
            }, {
                jobs: {
                    'MoveCompletedJobsToHistory': {
                        fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
                        schedule: {
                            method: 'every',
                            intervalOrSchedule: '5 minutes'
                        }
                    },
                    'Figshare-TransitionRecordWorkflowFromFigshareArticleProperties': {
                        fnName: 'figshareservice.transitionRecordWorkflowFromFigshareArticlePropertiesJob',
                        schedule: {
                            method: 'every',
                            intervalOrSchedule: '50 minutes'
                        }
                    },
                    'IntegrationAuditService-StoreIntegrationAudit': {
                        fnName: 'integrationauditservice.storeIntegrationAudit',
                        options: { concurrency: 1 }
                    }
                }
            }) as { jobs: Record<string, Record<string, unknown>> };

            const auditJob = merged.jobs['IntegrationAuditService-StoreIntegrationAudit'];
            const moveHistoryJob = merged.jobs['MoveCompletedJobsToHistory'];
            expect(Object.keys(merged.jobs)).to.include.members([
                'IntegrationAuditService-StoreIntegrationAudit',
                'MoveCompletedJobsToHistory',
                'Figshare-TransitionRecordWorkflowFromFigshareArticleProperties'
            ]);
            expect(auditJob).to.not.have.property('schedule');
            expect(auditJob?.fnName).to.equal('integrationauditservice.storeIntegrationAudit');
            expect(auditJob?.options).to.deep.equal({
                lockLifetime: 30000,
                concurrency: 1
            });
            expect(moveHistoryJob?.schedule).to.deep.equal({
                method: 'every',
                intervalOrSchedule: '5 minutes'
            });
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
            expect(content).to.include('Auto-generated by @researchdatabox/redbox-core loader');
            expect(content).to.include('coreBootstrap');
            expect(content).to.include('preLiftSetup');
            expect(content).to.include('createGeneratedBootstrap');
            expect(content).to.include("require('./migrations').migrations");
            expect(content).to.include('module.exports.bootstrap');
            expect(content).to.not.include('{{{');
            expect(() => new vm.Script(content)).to.not.throw();
        });

        it('should generate bootstrap.js with hook bootstraps', async function () {
            const hookBootstraps = [
                { name: 'test-hook', module: 'test-hook' },
                { name: '@org/another-hook', module: '@org/another-hook' },
                { name: '@org/dotted.hook', module: '@org/dotted.hook' }
            ];

            const result = await redboxLoader.generateBootstrapShim(configDir, hookBootstraps);
            expect(result.hookCount).to.equal(3);

            const content = await fsPromises.readFile(path.join(configDir, 'bootstrap.js'), 'utf8');
            expect(content).to.include('test_hook_bootstrap');
            expect(content).to.include('_org_another_hook_bootstrap');
            expect(content).to.include('_org_dotted_hook_bootstrap');
            expect(content).to.include("require('test-hook')");
            expect(content).to.include("require('@org/another-hook')");
            expect(content).to.include("require('@org/dotted.hook')");
            expect(content).to.include("{ name: \"test-hook\", bootstrap: test_hook_bootstrap }");
            expect(content).to.not.include('{{{');
            expect(() => new vm.Script(content)).to.not.throw();
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

        function runBootstrapShim(content: string, migrationsRequire: () => unknown): { exports: Record<string, unknown>; capturedMigrations: unknown } {
            let capturedMigrations: unknown;
            const fakeCore = {
                coreBootstrap: async () => undefined,
                preLiftSetup: () => undefined,
                createGeneratedBootstrap: (
                    _preLift: unknown,
                    _core: unknown,
                    _hooks: unknown,
                    migrations: unknown
                ) => {
                    capturedMigrations = migrations;
                    return () => undefined;
                },
            };
            const fakeRequire = (id: string) => {
                if (id === '@researchdatabox/redbox-core') {
                    return fakeCore;
                }
                if (id === './migrations') {
                    return migrationsRequire();
                }
                throw new Error(`Unexpected require: ${id}`);
            };
            const moduleStub = { exports: {} as Record<string, unknown> };
            vm.runInNewContext(content, {
                require: fakeRequire,
                module: moduleStub,
                exports: moduleStub.exports,
                console: { warn: () => undefined },
            });
            return { exports: moduleStub.exports, capturedMigrations };
        }

        it('should tolerate a missing config/migrations.js and default to no migrations', async function () {
            await redboxLoader.generateBootstrapShim(configDir, []);
            const content = await fsPromises.readFile(path.join(configDir, 'bootstrap.js'), 'utf8');

            const missingShim = () => {
                const error = new Error("Cannot find module './migrations'") as NodeJS.ErrnoException;
                error.code = 'MODULE_NOT_FOUND';
                throw error;
            };

            const { exports: shimExports, capturedMigrations } = runBootstrapShim(content, missingShim);
            expect(shimExports.bootstrap).to.be.a('function');
            expect(capturedMigrations).to.deep.equal([]);
        });

        it('should rethrow MODULE_NOT_FOUND raised inside config/migrations.js', async function () {
            await redboxLoader.generateBootstrapShim(configDir, []);
            const content = await fsPromises.readFile(path.join(configDir, 'bootstrap.js'), 'utf8');

            const missingHookInsideShim = () => {
                const error = new Error("Cannot find module 'some-uninstalled-hook'") as NodeJS.ErrnoException;
                error.code = 'MODULE_NOT_FOUND';
                throw error;
            };

            expect(() => runBootstrapShim(content, missingHookInsideShim)).to.throw("Cannot find module 'some-uninstalled-hook'");
        });
    });

    describe('findAndRegisterHooks', function () {
        it('should return empty arrays for hooks when no dependencies have sails config', async function () {
            const result = await redboxLoader.findAndRegisterHooks(sandboxDir);
            expect(result.hookModels).to.deep.equal({});
            expect(result.hookPolicies).to.deep.equal({});
            expect(result.hookBootstraps).to.deep.equal([]);
            expect(result.hookApiRoutes).to.deep.equal([]);
            expect(result.hookMigrations).to.deep.equal([]);
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
            expect(result.hookMigrations).to.be.an('array');
        });

        it('should discover hook migrations exported by a hook dependency', async function () {
            const packageName = 'redbox-hook-migrations';
            await createHookModule(
                sandboxDir,
                packageName,
                {
                    name: packageName,
                    version: '1.0.0',
                    sails: { hasMigrations: true },
                },
                `module.exports.registerRedboxMigrations = function() {
                    return [{
                        name: '2026.06.08T10.00.00-hook',
                        up: async function() {}
                    }];
                };`
            );

            await fsPromises.writeFile(
                path.join(sandboxDir, 'package.json'),
                JSON.stringify({
                    name: 'test-app',
                    dependencies: {
                        [packageName]: '1.0.0',
                    },
                    devDependencies: {},
                })
            );

            const result = await redboxLoader.findAndRegisterHooks(sandboxDir);

            expect(result.hookMigrations).to.deep.equal([{ name: packageName, module: packageName }]);
        });

        it('should discover hook API routes exported by a hook dependency', async function () {
            const packageName = 'redbox-hook-api-routes';
            await createHookModule(
                sandboxDir,
                packageName,
                {
                    name: packageName,
                    version: '1.0.0',
                    sails: { hasApiRoutes: true },
                },
                `module.exports.registerHookApiRoutes = function() {
                    return [{
                        method: 'get',
                        path: '/:branding/:portal/api/hooks/example',
                        controller: 'hook/ExampleController',
                        action: 'show'
                    }];
                };`
            );

            await fsPromises.writeFile(
                path.join(sandboxDir, 'package.json'),
                JSON.stringify({
                    name: 'test-app',
                    dependencies: {
                        [packageName]: '1.0.0',
                    },
                    devDependencies: {},
                })
            );

            const result = await redboxLoader.findAndRegisterHooks(sandboxDir);

            expect(result.hookApiRoutes).to.deep.equal([{ name: packageName, module: packageName }]);
        });
    });

    describe('generateApiRouteHookConfig', function () {
        let configDir: string;

        beforeEach(async function () {
            configDir = path.join(sandboxDir, 'config');
            await fsPromises.mkdir(configDir, { recursive: true });
        });

        it('should generate apiRoutesHooks.js from discovered hook api routes', async function () {
            const packageName = 'redbox-hook-api-routes';
            const hookApiRoutes = [{ name: packageName, module: packageName }];

            const result = await redboxLoader.generateApiRouteHookConfig(configDir, hookApiRoutes);

            expect(result.generated).to.equal(1);
            expect(result.total).to.equal(1);

            const content = await fsPromises.readFile(path.join(configDir, 'apiRoutesHooks.js'), 'utf8');
            expect(content).to.include("registerHookApiRoutes");
            expect(content).to.include("module.exports.apiRoutesHooks = [");
            expect(content).to.include("require('redbox-hook-api-routes').registerHookApiRoutes");
            expect(() => new vm.Script(content)).to.not.throw();
        });
    });

    describe('discoverLocalMigrationFiles', function () {
        it('should list local migration JavaScript files in sorted order', async function () {
            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(path.join(migrationsDir, '002-second.js'), 'module.exports = {};');
            await fsPromises.writeFile(path.join(migrationsDir, '001-first.js'), 'module.exports = {};');
            await fsPromises.writeFile(path.join(migrationsDir, 'notes.txt'), '');

            const files = await redboxLoader.discoverLocalMigrationFiles(sandboxDir);

            expect(files).to.deep.equal(['001-first.js', '002-second.js']);
        });

        it('should return an empty list when api/migrations does not exist', async function () {
            const files = await redboxLoader.discoverLocalMigrationFiles(sandboxDir);
            expect(files).to.deep.equal([]);
        });
    });

    describe('generateMigrationConfigShim', function () {
        let configDir: string;
        let originalNodeEnv: string | undefined;

        beforeEach(async function () {
            originalNodeEnv = process.env.NODE_ENV;
            configDir = path.join(sandboxDir, 'config');
            await fsPromises.mkdir(configDir, { recursive: true });
        });

        afterEach(function () {
            process.env.NODE_ENV = originalNodeEnv;
        });

        it('should generate a migrations.js shim aggregating hook and app-local migrations in name order', async function () {
            const packageName = 'redbox-hook-migrations';
            await createHookModule(
                sandboxDir,
                packageName,
                {
                    name: packageName,
                    version: '1.0.0',
                    sails: { hasMigrations: true },
                },
                `module.exports.registerRedboxMigrations = function() {
                    return [{
                        name: '2026.06.08T10.00.00-hook',
                        up: async function() {}
                    }];
                };`
            );

            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(
                path.join(migrationsDir, '001-local.js'),
                `module.exports = {
                    name: '2026.06.08T09.00.00-local',
                    source: 'app',
                    up: async function() {}
                };`
            );

            const result = await redboxLoader.generateMigrationConfigShim(
                configDir,
                sandboxDir,
                [{ name: packageName, module: packageName }]
            );

            expect(result.generated).to.equal(1);
            const content = await fsPromises.readFile(path.join(configDir, 'migrations.js'), 'utf8');
            expect(content).to.include("require('redbox-hook-migrations').registerRedboxMigrations()");
            expect(content).to.include("require('../api/migrations/001-local.js')");
            expect(() => new vm.Script(content)).to.not.throw();

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            const loaded = require(shimPath) as { migrations: Array<{ name: string }> };
            expect(loaded.migrations.map(migration => migration.name)).to.deep.equal([
                '2026.06.08T09.00.00-local',
                '2026.06.08T10.00.00-hook'
            ]);
        });

        it('should warn about duplicate migration names in development', async function () {
            process.env.NODE_ENV = 'development';
            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(
                path.join(migrationsDir, '003-duplicate-a.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );
            await fsPromises.writeFile(
                path.join(migrationsDir, '004-duplicate-b.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );
            const warn = sinon.stub(console, 'warn');

            await redboxLoader.generateMigrationConfigShim(configDir, sandboxDir, []);

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            const loaded = require(shimPath) as { migrations: Array<{ name: string }> };
            expect(loaded.migrations.map(migration => migration.name)).to.deep.equal(['duplicate']);
            expect(warn.calledWithMatch('[redbox-loader:warn]', 'Duplicate Redbox migration name: duplicate')).to.be.true;
            warn.restore();
        });

        it('should throw on duplicate migration names in production', async function () {
            process.env.NODE_ENV = 'production';
            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(
                path.join(migrationsDir, '005-duplicate-a.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );
            await fsPromises.writeFile(
                path.join(migrationsDir, '006-duplicate-b.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );

            await redboxLoader.generateMigrationConfigShim(configDir, sandboxDir, []);

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            expect(() => require(shimPath)).to.throw('Duplicate Redbox migration name: duplicate');
        });

        it('should name the offending source when a migration export is invalid', async function () {
            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(
                path.join(migrationsDir, '007-bad.js'),
                `module.exports = { name: 'bad-migration' };`
            );

            await redboxLoader.generateMigrationConfigShim(configDir, sandboxDir, []);

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            expect(() => require(shimPath)).to.throw('Invalid Redbox migration export from api/migrations/007-bad.js');
        });

        it('should reject a hook whose registerRedboxMigrations is async', async function () {
            const packageName = 'redbox-hook-async-migrations';
            await createHookModule(
                sandboxDir,
                packageName,
                {
                    name: packageName,
                    version: '1.0.0',
                    sails: { hasMigrations: true },
                },
                `module.exports.registerRedboxMigrations = async function() {
                    return [];
                };`
            );

            await redboxLoader.generateMigrationConfigShim(configDir, sandboxDir, [
                { name: packageName, module: packageName }
            ]);

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            expect(() => require(shimPath)).to.throw(
                `Invalid Redbox migration export from hook:${packageName}. Expected an array of migrations (registerRedboxMigrations() must be synchronous).`
            );
        });

        it('should name both sources for duplicate migration names', async function () {
            process.env.NODE_ENV = 'production';
            const migrationsDir = path.join(sandboxDir, 'api', 'migrations');
            await fsPromises.mkdir(migrationsDir, { recursive: true });
            await fsPromises.writeFile(
                path.join(migrationsDir, '008-duplicate-a.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );
            await fsPromises.writeFile(
                path.join(migrationsDir, '009-duplicate-b.js'),
                `module.exports = { name: 'duplicate', up: async function() {} };`
            );

            await redboxLoader.generateMigrationConfigShim(configDir, sandboxDir, []);

            const shimPath = path.join(configDir, 'migrations.js');
            delete require.cache[require.resolve(shimPath)];
            expect(() => require(shimPath)).to.throw(
                'Duplicate Redbox migration name: duplicate (from api/migrations/009-duplicate-b.js, first defined in api/migrations/008-duplicate-a.js)'
            );
        });
    });
});
