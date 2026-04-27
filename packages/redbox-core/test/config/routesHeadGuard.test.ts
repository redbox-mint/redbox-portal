let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { routes } from '../../src/config/routes.config';

describe('routes HEAD guards', function () {
    it('should explicitly block HEAD on auth-sensitive endpoints', function () {
        const guardedRoutes = [
            'HEAD /user/login_local',
            'HEAD /user/login_aaf',
            'HEAD /user/login_oidc',
            'HEAD /user/begin_oidc',
            'HEAD /user/info',
            'HEAD /:branding/:portal/user/info',
            'HEAD /:branding/:portal/user/login',
            'HEAD /:branding/:portal/user/logout',
            'HEAD /:branding/:portal/user/find'
        ];

        for (const route of guardedRoutes) {
            expect(routes[route]).to.deep.equal({ policy: 'disallowedHeadRequestHandler' });
        }
    });

    it('should explicitly block HEAD on branded API routes', function () {
        expect(routes['HEAD /:branding/:portal/api/*']).to.deep.equal({ policy: 'disallowedHeadRequestHandler' });
    });

    it('should leave attachment upload routes without explicit HEAD blockers', function () {
        expect(routes['HEAD /:branding/:portal/record/:oid/attach']).to.equal(undefined);
        expect(routes['HEAD /:branding/:portal/record/:oid/attach/:attachId']).to.equal(undefined);
        expect(routes['HEAD /:branding/:portal/companion/record/:oid/attach']).to.equal(undefined);
        expect(routes['HEAD /:branding/:portal/companion/record/:oid/attach/:attachId']).to.equal(undefined);
    });
});