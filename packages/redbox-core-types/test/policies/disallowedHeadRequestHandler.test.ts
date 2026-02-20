let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { disallowedHeadRequestHandler } from '../../src/policies/disallowedHeadRequestHandler';

describe('disallowedHeadRequestHandler policy', function () {
    function createMockReqRes(method: string) {
        const req: any = { method };
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

    it('should block HEAD requests with 400 status', function () {
        const { req, res, getStatus, getBody } = createMockReqRes('HEAD');
        let nextCalled = false;

        disallowedHeadRequestHandler(req, res, () => { nextCalled = true; });

        expect(getStatus()).to.equal(400);
        expect(getBody()).to.include('HEAD method is not allowed');
        expect(nextCalled).to.be.false;
    });

    it('should allow GET requests', function () {
        const { req, res, getStatus } = createMockReqRes('GET');
        let nextCalled = false;

        disallowedHeadRequestHandler(req, res, () => { nextCalled = true; });

        expect(getStatus()).to.be.undefined;
        expect(nextCalled).to.be.true;
    });

    it('should allow POST requests', function () {
        const { req, res, getStatus } = createMockReqRes('POST');
        let nextCalled = false;

        disallowedHeadRequestHandler(req, res, () => { nextCalled = true; });

        expect(getStatus()).to.be.undefined;
        expect(nextCalled).to.be.true;
    });

    it('should allow PUT requests', function () {
        const { req, res, getStatus } = createMockReqRes('PUT');
        let nextCalled = false;

        disallowedHeadRequestHandler(req, res, () => { nextCalled = true; });

        expect(getStatus()).to.be.undefined;
        expect(nextCalled).to.be.true;
    });

    it('should allow DELETE requests', function () {
        const { req, res, getStatus } = createMockReqRes('DELETE');
        let nextCalled = false;

        disallowedHeadRequestHandler(req, res, () => { nextCalled = true; });

        expect(getStatus()).to.be.undefined;
        expect(nextCalled).to.be.true;
    });
});
