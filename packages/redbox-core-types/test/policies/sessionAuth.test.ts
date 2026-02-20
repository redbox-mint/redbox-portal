let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { sessionAuth } from '../../src/policies/sessionAuth';

describe('sessionAuth policy', function () {
    function createMockReqRes(authenticated: boolean) {
        const req: any = {
            session: { authenticated }
        };
        let statusCode: number | undefined;
        let sentBody: string | undefined;
        const res: any = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            send: (body: string) => {
                sentBody = body;
                return res;
            }
        };
        return { req, res, getStatus: () => statusCode, getBody: () => sentBody };
    }

    it('should call next when session is authenticated', function () {
        const { req, res, getStatus } = createMockReqRes(true);
        let nextCalled = false;

        sessionAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
    });

    it('should return 403 when session is not authenticated', function () {
        const { req, res, getStatus, getBody } = createMockReqRes(false);
        let nextCalled = false;

        sessionAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getBody()).to.include('not permitted');
    });

    it('should return 403 when session.authenticated is undefined', function () {
        const req: any = { session: {} };
        let statusCode: number | undefined;
        const res: any = {
            status: (code: number) => { statusCode = code; return res; },
            send: () => res
        };
        let nextCalled = false;

        sessionAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(statusCode).to.equal(403);
    });
});
