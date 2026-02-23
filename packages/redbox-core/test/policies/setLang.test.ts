let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { setLang } from '../../src/policies/setLang';

// Mock TranslationService
(global as any).TranslationService = {
    handle: async (req: any, res: any, next: any) => { next(); }
};

describe('setLang policy', function () {
    let originalTranslationService: any;

    beforeEach(function () {
        originalTranslationService = (global as any).TranslationService;
    });

    afterEach(function () {
        (global as any).TranslationService = originalTranslationService;
    });

    it('should delegate to TranslationService.handle', async function () {
        let handleCalled = false;
        let receivedReq: any;
        let receivedRes: any;

        (global as any).TranslationService = {
            handle: async (req: any, res: any, next: any) => {
                handleCalled = true;
                receivedReq = req;
                receivedRes = res;
                next();
            }
        };

        const req: any = { session: { lang: 'en' } };
        const res: any = { locals: {} };
        let nextCalled = false;

        await setLang(req, res, () => { nextCalled = true; });

        expect(handleCalled).to.be.true;
        expect(receivedReq).to.equal(req);
        expect(receivedRes).to.equal(res);
        expect(nextCalled).to.be.true;
    });

    it('should wait for TranslationService.handle to complete', async function () {
        let resolveHandle: () => void;
        const handlePromise = new Promise<void>(resolve => { resolveHandle = resolve; });

        (global as any).TranslationService = {
            handle: async (req: any, res: any, next: any) => {
                await handlePromise;
                next();
            }
        };

        const req: any = {};
        const res: any = {};
        let nextCalled = false;

        const policyPromise = setLang(req, res, () => { nextCalled = true; });

        // next should not be called yet
        expect(nextCalled).to.be.false;

        // Resolve the handle promise
        resolveHandle!();
        await policyPromise;

        expect(nextCalled).to.be.true;
    });
});
