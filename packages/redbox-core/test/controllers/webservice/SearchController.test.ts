let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/SearchController';

describe('Webservice SearchController', () => {
    let controller: Controllers.Search;
    let mockSails: any;
    let originalSails: any;
    let originalBrandingService: any;

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalBrandingService = (global as any).BrandingService;

        mockSails = {
            config: {
                search: { serviceName: 'solrsearchservice' },
                record: { search: { returnFields: ['id', 'title'] } }
            },
            services: {
                recordsservice: {
                    getMeta: sinon.stub(),
                    getRecords: sinon.stub()
                },
                solrsearchservice: {
                    index: sinon.stub(),
                    remove: sinon.stub(),
                    searchFuzzy: sinon.stub()
                }
            },
            log: { verbose: sinon.stub(), debug: sinon.stub(), error: sinon.stub() },
            after: sinon.stub(),
            on: sinon.stub()
        };

        (global as any).sails = mockSails;
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1' })
        };

        controller = new Controllers.Search();
        controller.init();
        // Trigger the hook ready event handler
        const readyHandler = mockSails.after.firstCall.args[1];
        readyHandler();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
    });

    describe('index', () => {
        it('should fetch record meta and index it', async () => {
            const req = { param: sinon.stub().withArgs('oid').returns('123') } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const mockRecord = { id: '123', metadata: { title: 'Test' } };
            mockSails.services.recordsservice.getMeta.resolves(mockRecord);
            mockSails.services.solrsearchservice.index.resolves();
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.index(req, res);

            expect(mockSails.services.recordsservice.getMeta.calledWith('123')).to.be.true;
            expect(mockSails.services.solrsearchservice.index.calledWith('123', mockRecord)).to.be.true;
            expect(apiRespondStub.called).to.be.true;
        });
    });

    describe('removeAll', () => {
        it('should call remove with wildcard', async () => {
            const req = { session: { branding: 'default' } } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            mockSails.services.solrsearchservice.remove.resolves();
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.removeAll(req, res);

            expect(mockSails.services.solrsearchservice.remove.calledWith('*')).to.be.true;
            expect(apiRespondStub.called).to.be.true;
        });
    });
});
