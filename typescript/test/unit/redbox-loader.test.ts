
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
const fsPromises = fs.promises;
import * as os from 'os';

// Resolve redbox-loader path dynamically to support running from:
// 1. TypeScript source: typescript/test/unit/redbox-loader.test.ts (needs ../../../)
// 2. Compiled JavaScript: test/unit/redbox-loader.test.js (needs ../../)
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

            const result = await redboxLoader.generateAllShims(sandboxDir);
            expect(result.skipped).to.be.false;

            try {
                await fsPromises.access(path.join(sandboxDir, '.regenerate-shims'));
                expect.fail('Marker file should be deleted');
            } catch (e: any) {
                expect(e.code).to.equal('ENOENT');
            }
        });
    });
});
