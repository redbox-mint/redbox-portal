let expect: Chai.ExpectStatic;
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';

import { createGeneratedBootstrap } from '../../src/loader/bootstrapShimRuntime';

const fsPromises = fs.promises;

describe('bootstrapShimRuntime', function () {
    const sandboxDir = path.join(os.tmpdir(), 'redbox-bootstrap-runtime-test-' + Date.now());
    let originalEnv: NodeJS.ProcessEnv;
    let originalCwd: string;
    let hadOriginalSails: boolean;
    let originalSailsConfig: unknown;
    let originalSailsLog: unknown;

    before(async function () {
        ({ expect } = await import('chai'));
    });

    beforeEach(async function () {
        originalEnv = { ...process.env };
        originalCwd = process.cwd();
        hadOriginalSails = Object.prototype.hasOwnProperty.call(global as any, 'sails');

        if (!(global as any).sails) {
            (global as any).sails = { config: undefined, log: undefined };
        }

        originalSailsConfig = (global as any).sails.config;
        originalSailsLog = (global as any).sails.log;

        await fsPromises.mkdir(sandboxDir, { recursive: true });
        process.chdir(sandboxDir);

        (global as any).sails.config = {
            example: 'value',
            nested: { flag: true }
        };
        (global as any).sails.log = {
            verbose: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        };
    });

    afterEach(async function () {
        sinon.restore();
        process.env = originalEnv;
        process.chdir(originalCwd);

        if (hadOriginalSails) {
            if (!(global as any).sails) {
                (global as any).sails = { config: undefined, log: undefined };
            }
            (global as any).sails.config = originalSailsConfig;
            (global as any).sails.log = originalSailsLog;
        } else {
            delete (global as any).sails;
        }

        await fsPromises.rm(sandboxDir, { recursive: true, force: true });
    });

    function runBootstrap(bootstrap: (cb: (error?: unknown) => void) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            bootstrap((error?: unknown) => {
                if (error != null) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    it('should run preLift, core bootstrap, and hook bootstraps in order', async function () {
        const callOrder: string[] = [];
        const preLiftSetup = sinon.stub().callsFake(() => callOrder.push('preLift'));
        const coreBootstrap = sinon.stub().callsFake(async () => {
            callOrder.push('core');
        });
        const hookOne = sinon.stub().callsFake(async () => {
            callOrder.push('hook-one');
        });
        const hookTwo = sinon.stub().callsFake(async () => {
            callOrder.push('hook-two');
        });

        const bootstrap = createGeneratedBootstrap(preLiftSetup, coreBootstrap, [
            { name: 'hook-one', bootstrap: hookOne },
            { name: 'hook-two', bootstrap: hookTwo }
        ]);

        await runBootstrap(bootstrap);

        expect(callOrder).to.deep.equal(['preLift', 'core', 'hook-one', 'hook-two']);
        expect((global as any).sails.log.verbose.calledWith('Core bootstrap complete.')).to.be.true;
        expect((global as any).sails.log.verbose.calledWith('Hook bootstrap complete: hook-one')).to.be.true;
        expect((global as any).sails.log.verbose.calledWith('Hook bootstrap complete: hook-two')).to.be.true;
    });

    it('should export a post-bootstrap snapshot when enabled', async function () {
        process.env.EXPORT_BOOTSTRAP_CONFIG_JSON = 'true';
        const circular: Record<string, unknown> = { name: 'root' };
        circular.self = circular;

        (global as any).sails.config = {
            fn: function namedFn() { return 'ok'; },
            circular,
            list: [1, { nested: true }]
        };

        const bootstrap = createGeneratedBootstrap(
            sinon.stub(),
            sinon.stub().resolves(),
            []
        );

        await runBootstrap(bootstrap);

        const snapshotPath = path.join(sandboxDir, 'support', 'debug-config', 'post-bootstrap-config.json');
        const snapshot = JSON.parse(await fsPromises.readFile(snapshotPath, 'utf8'));

        expect(snapshot._meta.stage).to.equal('post-bootstrap');
        expect(snapshot._meta.environment).to.equal(process.env.NODE_ENV || 'development');
        expect(snapshot.fn).to.equal('[Function: namedFn]');
        expect(snapshot.circular.self).to.equal('[Circular]');
        expect(snapshot.list).to.deep.equal([1, { nested: true }]);
        expect((global as any).sails.log.info.calledWithMatch('Exported config snapshot to ')).to.be.true;
    });

    it('should warn and continue when exporting a post-bootstrap snapshot fails', async function () {
        process.env.EXPORT_BOOTSTRAP_CONFIG_JSON = 'true';
        const writeFailure = new Error('disk full');
        sinon.stub(fsPromises, 'writeFile').rejects(writeFailure);

        const bootstrap = createGeneratedBootstrap(
            sinon.stub(),
            sinon.stub().resolves(),
            []
        );

        await runBootstrap(bootstrap);

        const snapshotPath = path.join(sandboxDir, 'support', 'debug-config', 'post-bootstrap-config.json');
        expect((global as any).sails.log.warn.calledWithMatch(snapshotPath)).to.be.true;
        expect((global as any).sails.log.warn.calledWithMatch(writeFailure.message)).to.be.true;
    });

    it('should pass errors to the callback and log bootstrap failure', async function () {
        const failure = new Error('hook exploded');
        const bootstrap = createGeneratedBootstrap(
            sinon.stub(),
            sinon.stub().resolves(),
            [{ name: 'broken-hook', bootstrap: sinon.stub().rejects(failure) }]
        );

        let caughtError: unknown;
        try {
            await runBootstrap(bootstrap);
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).to.equal(failure);
        expect((global as any).sails.log.verbose.calledWith('Bootstrap failed!!!')).to.be.true;
        expect((global as any).sails.log.error.calledWith(failure)).to.be.true;
    });

    it('should pass synchronous preLift errors to the callback', async function () {
        const failure = new Error('preLift exploded');
        const coreBootstrap = sinon.stub().resolves();
        const bootstrap = createGeneratedBootstrap(
            sinon.stub().throws(failure),
            coreBootstrap,
            []
        );

        let caughtError: unknown;
        try {
            await runBootstrap(bootstrap);
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).to.equal(failure);
        expect(coreBootstrap.called).to.be.false;
    });
});
