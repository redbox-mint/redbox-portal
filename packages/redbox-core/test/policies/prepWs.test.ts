let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { prepWs } from '../../src/policies/prepWs';

describe('prepWs policy', function () {
    describe('WebSocket requests (isSocket=true)', function () {
        it('should set isAuthenticated method based on session.user', function () {
            const req: any = {
                isSocket: true,
                session: { user: { id: 'user123' } }
            };
            const res: any = {};
            let nextCalled = false;

            prepWs(req, res, () => { nextCalled = true; });

            expect(nextCalled).to.be.true;
            expect(req.isAuthenticated).to.be.a('function');
            expect(req.isAuthenticated()).to.be.true;
            expect(req.user).to.deep.equal({ id: 'user123' });
        });

        it('should return false from isAuthenticated when no session.user', function () {
            const req: any = {
                isSocket: true,
                session: {}
            };
            const res: any = {};
            let nextCalled = false;

            prepWs(req, res, () => { nextCalled = true; });

            expect(nextCalled).to.be.true;
            expect(req.isAuthenticated()).to.be.false;
            expect(req.user).to.be.undefined;
        });

        it('should return false from isAuthenticated when session.user is null', function () {
            const req: any = {
                isSocket: true,
                session: { user: null }
            };
            const res: any = {};

            prepWs(req, res, () => { });

            expect(req.isAuthenticated()).to.be.false;
        });
    });

    describe('HTTP requests (isSocket=false or undefined)', function () {
        it('should synchronize req.user to session.user', function () {
            const req: any = {
                user: { id: 'httpUser' },
                session: {}
            };
            const res: any = {};
            let nextCalled = false;

            prepWs(req, res, () => { nextCalled = true; });

            expect(nextCalled).to.be.true;
            expect(req.session.user).to.deep.equal({ id: 'httpUser' });
        });

        it('should not define isAuthenticated method for HTTP requests', function () {
            const req: any = {
                user: { id: 'httpUser' },
                session: {}
            };
            const res: any = {};

            prepWs(req, res, () => { });

            // isAuthenticated should remain undefined for HTTP requests
            // (Sails provides its own)
            expect(req.isAuthenticated).to.be.undefined;
        });

        it('should handle isSocket=false explicitly', function () {
            const req: any = {
                isSocket: false,
                user: { id: 'httpUser2' },
                session: {}
            };
            const res: any = {};
            let nextCalled = false;

            prepWs(req, res, () => { nextCalled = true; });

            expect(nextCalled).to.be.true;
            expect(req.session.user).to.deep.equal({ id: 'httpUser2' });
        });
    });
});
