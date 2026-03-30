let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { defineWebpackHook } from '../../src/hooks/webpack';
const noop = () => { };

describe('Webpack Hook', () => {
    let sailsMock: any;
    let webpackMock: any;
    let webpackCompilerMock: any;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };

        // Default env for tests to allow running
        process.env.NODE_ENV = 'docker';
        process.env.WEBPACK_SKIP = 'false';
        delete process.env.WEBPACK_CSS_MINI;

        sailsMock = {
            config: {
                webpack: {
                    config: [{
                        optimization: {
                            minimize: false
                        }
                    }]
                }
            },
            log: {
                info: sinon.spy(),
                warn: sinon.spy(),
                error: sinon.spy()
            }
        };

        webpackCompilerMock = {
            run: sinon.stub()
        };

        webpackMock = sinon.stub().returns(webpackCompilerMock);

        // Reset global isSailsScriptEnv if it exists/was modified
        (global as any).isSailsScriptEnv = undefined;
        (global as any).sails = sailsMock;
    });

    afterEach(() => {
        process.env = originalEnv;
        sinon.restore();
        delete (global as any).sails;
    });

    describe('Configuration Validation', () => {
        it('should return empty object and warn if sails.config.webpack is missing', () => {
            delete sailsMock.config.webpack;
            const result = defineWebpackHook(sailsMock, webpackMock);
            expect(result).to.deep.equal({});
            expect(sailsMock.log.warn.calledWithMatch(/No Webpack options have been defined/)).to.be.true;
        });

        it('should return empty object and warn if sails.config.webpack.config is missing', () => {
            delete sailsMock.config.webpack.config;
            const result = defineWebpackHook(sailsMock, webpackMock);
            expect(result).to.deep.equal({});
            expect(sailsMock.log.warn.calledWithMatch(/Configure your config\/webpack.js file/)).to.be.true;
        });
    });

    describe('Environment Checks', () => {
        it('should skip if NODE_ENV is not docker', () => {
            process.env.NODE_ENV = 'development';
            const result = defineWebpackHook(sailsMock, webpackMock);
            expect(result).to.deep.equal({});
            expect(sailsMock.log.warn.calledWithMatch(/Configured to skip webpack/)).to.be.true;
        });

        it('should skip if WEBPACK_SKIP is true', () => {
            process.env.WEBPACK_SKIP = 'true';
            const result = defineWebpackHook(sailsMock, webpackMock);
            expect(result).to.deep.equal({});
            expect(sailsMock.log.warn.calledWithMatch(/Configured to skip webpack/)).to.be.true;
        });
    });

    describe('Initialization', () => {
        it('should skip if isSailsScriptEnv global is true', async () => {
            (global as any).isSailsScriptEnv = true;
            const hook = defineWebpackHook(sailsMock, webpackMock);
            const initialize = (hook as any).initialize as (done: () => void) => Promise<void>;
            const done = sinon.spy();

            await initialize(done);

            expect(done.calledOnce).to.be.true;
            expect(webpackMock.called).to.be.false;
        });

        it('should enable CSS minimization if WEBPACK_CSS_MINI is true', async () => {
            process.env.WEBPACK_CSS_MINI = 'true';
            const hook = defineWebpackHook(sailsMock, webpackMock);
            const initialize = (hook as any).initialize as (done: () => void) => Promise<void>;

            // Mock compiler run to call callback immediately with success
            webpackCompilerMock.run.yields(null, {
                hasErrors: () => false,
                toString: () => 'stats'
            });

            await initialize(noop);

            expect(sailsMock.config.webpack.config[0].optimization.minimize).to.be.true;
            expect(sailsMock.log.info.calledWithMatch(/CSS minimization/)).to.be.true;
        });

        it('should compile successfully', async () => {
            const hook = defineWebpackHook(sailsMock, webpackMock);
            const initialize = (hook as any).initialize as (done: () => void) => Promise<void>;
            const done = sinon.spy();

            const statsMock = {
                hasErrors: () => false,
                toString: () => 'Build success'
            };
            webpackCompilerMock.run.yields(null, statsMock);

            await initialize(done);

            expect(webpackMock.calledOnce).to.be.true;
            expect(webpackCompilerMock.run.calledOnce).to.be.true;
            expect(sailsMock.log.info.calledWithMatch(/Build success/)).to.be.true;
            expect(done.calledOnce).to.be.true;
        });

        it('should handle compilation errors', async () => {
            const hook = defineWebpackHook(sailsMock, webpackMock);
            const initialize = (hook as any).initialize as (done: () => void) => Promise<void>;
            const done = sinon.spy();

            const error = new Error('Build failed');
            const statsMock = {
                hasErrors: () => true,
                toString: () => 'Error details'
            };

            // The hook implementation throws when there is an error
            webpackCompilerMock.run.yields(error, statsMock);

            try {
                await initialize(done);
                expect.fail('Should have thrown error');
            } catch (e: any) {
                expect(e.message).to.equal('sails-hook-webpack failed');
                expect(sailsMock.log.error.calledWith(error)).to.be.true;
                expect(done.called).to.be.false;
            }
        });

        it('should handle compilation stats errors', async () => {
            const hook = defineWebpackHook(sailsMock, webpackMock);
            const initialize = (hook as any).initialize as (done: () => void) => Promise<void>;
            const done = sinon.spy();

            const statsMock = {
                hasErrors: () => true,
                toString: () => 'Compilation errors'
            };

            webpackCompilerMock.run.yields(null, statsMock);

            try {
                await initialize(done);
                expect.fail('Should have thrown error');
            } catch (e: any) {
                expect(e.message).to.equal('sails-hook-webpack failed');
                expect(sailsMock.log.error.calledWithMatch(/Compilation errors/)).to.be.true;
                expect(done.called).to.be.false;
            }
        });
    });
});
