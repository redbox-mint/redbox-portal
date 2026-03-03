let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { companionAttachmentUploadAuth } from '../../src/policies/companionAttachmentUploadAuth';

describe('companionAttachmentUploadAuth policy', function () {
    let originalSails: unknown;

    beforeEach(function () {
        originalSails = (global as Record<string, unknown>).sails;
        (global as Record<string, unknown>).sails = {
            config: {
                companion: {
                    secret: 'companion-secret-value',
                    attachmentSecret: 'companion-secret-value',
                    attachmentSecretHeader: 'x-companion-secret',
                    attachmentLocalOnly: true,
                }
            },
            log: {
                warn: () => undefined
            }
        };
    });

    afterEach(function () {
        (global as Record<string, unknown>).sails = originalSails;
    });

    function createReqRes(options?: {
        method?: string;
        attachId?: string;
        secret?: string;
        isAuthenticated?: boolean;
        remoteAddress?: string;
        forwardedFor?: string;
        realIp?: string;
        forwarded?: string;
        localOnly?: boolean;
        configuredSecret?: string;
    }): { req: any; res: any; getStatus: () => number | undefined; getJson: () => unknown } {
        if (options?.localOnly != null) {
            ((global as any).sails.config.companion as any).attachmentLocalOnly = options.localOnly;
        }
        if (options?.configuredSecret != null) {
            ((global as any).sails.config.companion as any).attachmentSecret = options.configuredSecret;
        }

        const req: any = {
            method: options?.method || 'POST',
            param: (key: string) => key === 'attachId' ? options?.attachId : undefined,
            headers: {},
            isAuthenticated: () => options?.isAuthenticated === true,
            socket: { remoteAddress: options?.remoteAddress || '127.0.0.1' },
        };
        if (options?.secret != null) {
            req.headers['x-companion-secret'] = options.secret;
        }
        if (options?.forwardedFor != null) {
            req.headers['x-forwarded-for'] = options.forwardedFor;
        }
        if (options?.realIp != null) {
            req.headers['x-real-ip'] = options.realIp;
        }
        if (options?.forwarded != null) {
            req.headers['forwarded'] = options.forwarded;
        }

        let statusCode: number | undefined;
        let jsonBody: unknown;
        const res: any = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: unknown) => {
                jsonBody = body;
                return res;
            }
        };
        return { req, res, getStatus: () => statusCode, getJson: () => jsonBody };
    }

    it('should allow non-companion requests to proceed to normal auth', function () {
        const { req, res, getStatus, getJson } = createReqRes({ secret: undefined, isAuthenticated: true });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.companionAttachmentUploadAuthorized).to.be.undefined;
        expect(getStatus()).to.be.undefined;
        expect(getJson()).to.be.undefined;
    });

    it('should reject unauthenticated create requests without companion secret', function () {
        const { req, res, getStatus, getJson } = createReqRes({ secret: undefined, isAuthenticated: false });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getJson()).to.deep.equal({ message: 'Companion upload secret is required' });
    });

    it('should reject invalid shared secret', function () {
        const { req, res, getStatus, getJson } = createReqRes({ secret: 'wrong-secret' });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getJson()).to.deep.equal({ message: 'Invalid companion upload secret' });
    });

    it('should reject public-origin requests when local-only mode is enabled', function () {
        const { req, res, getStatus, getJson } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '203.0.113.5',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getJson()).to.deep.equal({ message: 'Companion upload requests must originate locally' });
    });

    it('should allow valid local companion upload requests and mark bypass flag', function () {
        const { req, res, getStatus } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '::1',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should allow private proxy chain addresses', function () {
        const { req, res, getStatus } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '172.18.0.5',
            forwardedFor: '10.0.2.15, 172.18.0.5',
            realIp: '10.0.2.15',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should allow IPv4-mapped IPv6 remote addresses', function () {
        const { req, res, getStatus } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '::ffff:192.168.107.1',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should reject proxy chain containing public addresses', function () {
        const { req, res, getStatus, getJson } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '172.18.0.5',
            forwardedFor: '203.0.113.10',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(getStatus()).to.equal(403);
        expect(getJson()).to.deep.equal({ message: 'Companion upload requests must originate locally' });
    });

    it('should parse RFC 7239 Forwarded header', function () {
        const { req, res, getStatus } = createReqRes({
            secret: 'companion-secret-value',
            remoteAddress: '127.0.0.1',
            forwarded: 'for=\"[::1]\";proto=https;by=127.0.0.1',
            localOnly: true
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should allow PATCH chunk requests with valid secret and attach id', function () {
        const { req, res, getStatus } = createReqRes({
            method: 'PATCH',
            attachId: 'upload-id',
            secret: 'companion-secret-value'
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should allow HEAD upload requests with valid secret and attach id', function () {
        const { req, res, getStatus } = createReqRes({
            method: 'HEAD',
            attachId: 'upload-id',
            secret: 'companion-secret-value'
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.equal(true);
    });

    it('should ignore non-companion methods', function () {
        const { req, res, getStatus } = createReqRes({
            method: 'DELETE',
            secret: 'companion-secret-value'
        });
        let nextCalled = false;

        companionAttachmentUploadAuth(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getStatus()).to.be.undefined;
        expect(req.companionAttachmentUploadAuthorized).to.be.undefined;
    });
});
