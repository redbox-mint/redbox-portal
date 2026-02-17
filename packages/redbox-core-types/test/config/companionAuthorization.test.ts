import { expect } from 'chai';
import { authorizeCompanionRequest } from '../../src/config/http.config';

type MockRequestOptions = {
    authenticated?: boolean;
    branding?: string;
    roles?: unknown[];
};

function createMockRequest(options: MockRequestOptions = {}): Record<string, unknown> {
    const {
        authenticated = false,
        branding,
        roles = []
    } = options;

    return {
        session: {
            branding
        },
        user: {
            roles
        },
        isAuthenticated: () => authenticated
    };
}

describe('authorizeCompanionRequest', function () {
    beforeEach(function () {
        (global as any).BrandingService = {
            getBrand: (name: string) => ({ id: `brand-${name}`, name })
        };
        (global as any).PathRulesService = {
            getRulesFromPath: () => null,
            canRead: () => true
        };
    });

    it('should allow non-companion requests without applying auth checks', function () {
        const req = createMockRequest({ authenticated: false });
        const decision = authorizeCompanionRequest(req as any, '/companion', '/record/view/123');
        expect(decision).to.deep.equal({
            isCompanionRequest: false,
            allowed: true
        });
    });

    it('should reject unauthenticated companion requests with 401', function () {
        const req = createMockRequest({ authenticated: false });
        const decision = authorizeCompanionRequest(req as any, '/companion', '/companion/drive/list/root');
        expect(decision.isCompanionRequest).to.equal(true);
        expect(decision.allowed).to.equal(false);
        expect(decision.statusCode).to.equal(401);
        expect(decision.body).to.deep.equal({ message: 'Authentication required' });
    });

    it('should reject authenticated companion requests with missing branding context', function () {
        const req = createMockRequest({ authenticated: true, branding: '' });
        const decision = authorizeCompanionRequest(req as any, '/companion', '/companion/drive/list/root');
        expect(decision.isCompanionRequest).to.equal(true);
        expect(decision.allowed).to.equal(false);
        expect(decision.statusCode).to.equal(403);
        expect(decision.body).to.deep.equal({ message: 'Access Denied' });
    });

    it('should allow authenticated companion requests when no companion path rules match', function () {
        const req = createMockRequest({ authenticated: true, branding: 'default' });
        (global as any).PathRulesService.getRulesFromPath = () => null;
        const decision = authorizeCompanionRequest(req as any, '/companion', '/companion/drive/list/root');
        expect(decision).to.deep.equal({
            isCompanionRequest: true,
            allowed: true
        });
    });

    it('should reject authenticated companion requests when matching companion path rule denies access', function () {
        const req = createMockRequest({ authenticated: true, branding: 'default', roles: [{ id: 'researcher' }] });
        (global as any).PathRulesService.getRulesFromPath = () => [{ path: '/companion/*' }];
        (global as any).PathRulesService.canRead = () => false;
        const decision = authorizeCompanionRequest(req as any, '/companion', '/companion/drive/list/root');
        expect(decision.isCompanionRequest).to.equal(true);
        expect(decision.allowed).to.equal(false);
        expect(decision.statusCode).to.equal(403);
        expect(decision.body).to.deep.equal({ message: 'Access Denied' });
    });

    it('should allow authenticated companion requests when matching companion path rule grants access', function () {
        const req = createMockRequest({ authenticated: true, branding: 'default', roles: [{ id: 'researcher' }] });
        (global as any).PathRulesService.getRulesFromPath = () => [{ path: '/companion/*' }];
        (global as any).PathRulesService.canRead = () => true;
        const decision = authorizeCompanionRequest(req as any, '/companion', '/companion/drive/list/root');
        expect(decision).to.deep.equal({
            isCompanionRequest: true,
            allowed: true
        });
    });
});
