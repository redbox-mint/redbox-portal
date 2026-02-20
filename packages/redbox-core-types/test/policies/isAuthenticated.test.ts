let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { isAuthenticated } from '../../src/policies/isAuthenticated';

describe('isAuthenticated policy', function () {
    function createMockReqRes(authenticated: boolean) {
        const req: any = {
            isAuthenticated: () => authenticated
        };
        let statusCode: number | undefined;
        let jsonBody: any;
        const res: any = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                jsonBody = body;
                return res;
            }
        };
        return { req, res, getStatus: () => statusCode, getJson: () => jsonBody };
    }

    it('should call next for authenticated users', function () {
        const { req, res, getStatus } = createMockReqRes(true);
        let nextCalled = false;

        isAuthenticated(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
    });

    it('should return 403 for unauthenticated users', function () {
        const { req, res, getStatus, getJson } = createMockReqRes(false);
        let nextCalled = false;

        isAuthenticated(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getJson()).to.deep.equal({ message: 'error-please-login' });
    });
});
