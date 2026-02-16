import { expect } from 'chai';
import { i18nLanguages } from '../../src/policies/i18nLanguages';

// Mock globals

(global as any).sails = {
    config: {
        i18n: {
            next: {
                init: {
                    supportedLngs: ['en', 'de']
                }
            }
        }
    },
    log: {
        warn: () => { }
    }
};

(global as any).BrandingService = {
    getBrandNameFromReq: (req: any) => 'default',
    getBrand: (name: string) => ({ name })
};

(global as any).I18nEntriesService = {
    listBundles: async (branding: any) => [
        { locale: 'en', displayName: 'English', enabled: true },
        { locale: 'de', displayName: 'Deutsch', enabled: true }
    ],
    getLanguageDisplayName: async (code: string) => code === 'en' ? 'English' : code
};

describe('i18nLanguages policy', function () {
    let originalSails: any;
    let originalBrandingService: any;
    let originalI18nEntriesService: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
        originalBrandingService = (global as any).BrandingService;
        originalI18nEntriesService = (global as any).I18nEntriesService;

        (global as any).sails = {
            config: {
                i18n: {
                    next: {
                        init: {
                            supportedLngs: ['en', 'de']
                        }
                    }
                }
            },
            log: {
                warn: () => { }
            }
        };

        (global as any).BrandingService = {
            getBrandNameFromReq: () => 'default',
            getBrand: (name: string) => ({ name })
        };

        (global as any).I18nEntriesService = {
            listBundles: async () => [
                { locale: 'en', displayName: 'English', enabled: true },
                { locale: 'de', displayName: 'Deutsch', enabled: true }
            ],
            getLanguageDisplayName: async (code: string) => code === 'en' ? 'English' : code
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
        (global as any).I18nEntriesService = originalI18nEntriesService;
    });

    function createMockReqRes() {
        const req: any = {};
        const res: any = { options: { locals: {} } };
        return { req, res };
    }

    it('should populate res.locals.availableLanguages from bundles', async function () {
        const { req, res } = createMockReqRes();
        let nextCalled = false;

        await i18nLanguages(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals.availableLanguages).to.deep.equal([
            { code: 'en', displayName: 'English' },
            { code: 'de', displayName: 'Deutsch' }
        ]);
    });

    it('should filter out disabled languages', async function () {
        (global as any).I18nEntriesService.listBundles = async () => [
            { locale: 'en', displayName: 'English', enabled: true },
            { locale: 'fr', displayName: 'Français', enabled: false }
        ];

        const { req, res } = createMockReqRes();

        await i18nLanguages(req, res, () => { });

        expect(res.locals.availableLanguages).to.deep.equal([
            { code: 'en', displayName: 'English' }
        ]);
    });

    it('should filter out cimode locale', async function () {
        (global as any).I18nEntriesService.listBundles = async () => [
            { locale: 'en', displayName: 'English', enabled: true },
            { locale: 'cimode', displayName: 'CI Mode', enabled: true }
        ];

        const { req, res } = createMockReqRes();

        await i18nLanguages(req, res, () => { });

        expect(res.locals.availableLanguages).to.have.length(1);
        expect(res.locals.availableLanguages[0].code).to.equal('en');
    });

    it('should use locale as displayName if not provided', async function () {
        (global as any).I18nEntriesService.listBundles = async () => [
            { locale: 'es', enabled: true }
        ];

        const { req, res } = createMockReqRes();

        await i18nLanguages(req, res, () => { });

        expect(res.locals.availableLanguages).to.deep.equal([
            { code: 'es', displayName: 'es' }
        ]);
    });

    it('should fallback to configured languages when no branding or service', async function () {
        (global as any).BrandingService.getBrand = () => null;

        const { req, res } = createMockReqRes();

        await i18nLanguages(req, res, () => { });

        // Fallback path writes to res.options.locals instead of res.locals
        expect(res.options.locals.availableLanguages).to.exist;
    });

    it('should provide English fallback on error', async function () {
        (global as any).BrandingService.getBrandNameFromReq = () => { throw new Error('fail'); };

        const { req, res } = createMockReqRes();
        let nextCalled = false;

        await i18nLanguages(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals.availableLanguages).to.deep.equal([
            { code: 'en', displayName: 'English' }
        ]);
    });

    it('should always call next', async function () {
        const { req, res } = createMockReqRes();
        let nextCalled = false;

        await i18nLanguages(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
    });
});
