let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';

// Mock sails
(global as any).sails = {
    config: {
        passport: {
            authenticate: (strategy: string, callback: Function) => {
                return (req: any, res: any) => {
                    // Default mock: no user from bearer
                    callback(null, false, null);
                };
            }
        }
    }
};

describe('isWebServiceAuthenticated policy', function () {
    let originalSails: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
    });

    afterEach(function () {
        (global as any).sails = originalSails;
    });

    it('should call next immediately if already authenticated', function () {
        const req: any = {
            isAuthenticated: () => true
        };
        const res: any = {};
        let nextCalled = false;

        isWebServiceAuthenticated(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
    });

    it('should attempt bearer authentication if not authenticated', function () {
        let authenticateCalled = false;
        let strategyUsed: string | undefined;

        (global as any).sails = {
            config: {
                passport: {
                    authenticate: (strategy: string, callback: Function) => {
                        authenticateCalled = true;
                        strategyUsed = strategy;
                        return (req: any, res: any) => {
                            callback(null, false, null);
                        };
                    }
                }
            }
        };

        const req: any = {
            isAuthenticated: () => false
        };
        const res: any = {};
        let nextCalled = false;

        isWebServiceAuthenticated(req, res, () => { nextCalled = true; });

        expect(authenticateCalled).to.be.true;
        expect(strategyUsed).to.equal('bearer');
        expect(nextCalled).to.be.true;
    });

    it('should set req.user if bearer authentication succeeds', function () {
        const mockUser = { id: 'bearerUser', username: 'api-user' };

        (global as any).sails = {
            config: {
                passport: {
                    authenticate: (strategy: string, callback: Function) => {
                        return (req: any, res: any) => {
                            callback(null, mockUser, null);
                        };
                    }
                }
            }
        };

        const req: any = {
            isAuthenticated: () => false
        };
        const res: any = {};
        let nextCalled = false;

        isWebServiceAuthenticated(req, res, () => { nextCalled = true; });

        expect(req.user).to.deep.equal(mockUser);
        expect(nextCalled).to.be.true;
    });

    it('should not set req.user if bearer authentication returns false', function () {
        (global as any).sails = {
            config: {
                passport: {
                    authenticate: (strategy: string, callback: Function) => {
                        return (req: any, res: any) => {
                            callback(null, false, null);
                        };
                    }
                }
            }
        };

        const req: any = {
            isAuthenticated: () => false
        };
        const res: any = {};
        let nextCalled = false;

        isWebServiceAuthenticated(req, res, () => { nextCalled = true; });

        expect(req.user).to.be.undefined;
        expect(nextCalled).to.be.true;
    });

    it('should still call next even if bearer auth has error', function () {
        (global as any).sails = {
            config: {
                passport: {
                    authenticate: (strategy: string, callback: Function) => {
                        return (req: any, res: any) => {
                            callback(new Error('Auth error'), false, null);
                        };
                    }
                }
            }
        };

        const req: any = {
            isAuthenticated: () => false
        };
        const res: any = {};
        let nextCalled = false;

        isWebServiceAuthenticated(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
    });
});
