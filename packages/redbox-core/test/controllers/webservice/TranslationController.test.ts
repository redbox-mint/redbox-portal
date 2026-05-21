let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/TranslationController';

function makeReq(req: Record<string, unknown>): Sails.Req {
    return {
        ...req,
        apiRequest: (req.apiRequest as Sails.Req['apiRequest']) ?? {
            params: (req.params ?? {}) as Record<string, unknown>,
            query: (req.query ?? {}) as Record<string, unknown>,
            body: req.body,
            files: (req.files as Record<string, unknown[]>) ?? {},
        },
    } as Sails.Req;
}

describe('Webservice TranslationController', () => {
    let controller: Controllers.Translation;

    beforeEach(() => {
        (global as any).sails = {
            services: {
                brandingservice: {
                    getBrandNameFromReq: sinon.stub().returns('default'),
                    getBrand: sinon.stub().returns({ id: 'default' }),
                },
                i18nentriesservice: {
                    setBundle: sinon.stub().resolves({ id: 'bundle-1' }),
                },
                translationservice: {
                    reloadResources: sinon.stub(),
                },
            },
            log: { warn: sinon.stub(), error: sinon.stub(), debug: sinon.stub(), verbose: sinon.stub() },
        };
        controller = new Controllers.Translation();
        (global as any).BrandingService = (global as any).sails.services.brandingservice;
        (global as any).I18nEntriesService = (global as any).sails.services.i18nentriesservice;
        (global as any).TranslationService = (global as any).sails.services.translationservice;
    });

    afterEach(() => {
        sinon.restore();
        delete (global as any).BrandingService;
        delete (global as any).I18nEntriesService;
        delete (global as any).TranslationService;
        delete (global as any).sails;
    });

    it('preserves false query params when setting a bundle', async () => {
        const req = makeReq({
            params: { locale: 'en', namespace: 'translation' },
            query: { splitToEntries: false, overwriteEntries: false },
            body: { data: { greeting: 'hello' } },
        });
        const res = {} as Sails.Res;
        const apiRespond = sinon.stub(controller as any, 'apiRespond');

        await controller.setBundle(req, res);

        expect((global as any).I18nEntriesService.setBundle.calledOnce).to.be.true;
        expect((global as any).I18nEntriesService.setBundle.firstCall.args[5]).to.deep.equal({
            splitToEntries: false,
            overwriteEntries: false,
        });
        expect(apiRespond.calledOnce).to.be.true;
    });
});
