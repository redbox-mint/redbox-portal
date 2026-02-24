let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/ActionController';

describe('ActionController', () => {
    let controller: Controllers.Action;
    let mockSails: any;
    let originalSails: any;

    beforeEach(() => {
        originalSails = (global as any).sails;
        mockSails = {
            config: {
                action: {
                    testAction: {
                        service: {
                            testMethod: sinon.stub()
                        },
                        method: 'testMethod'
                    }
                }
            },
            log: { verbose: sinon.stub(), error: sinon.stub() }
        };
        (global as any).sails = mockSails;
        controller = new Controllers.Action();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
    });

    describe('callService', () => {
        it('should call the configured service method', () => {
            const paramStub = sinon.stub();
            const req = {
                param: paramStub
            } as unknown as Sails.Req;
            paramStub.withArgs('action').returns('testAction');
            paramStub.withArgs('oid').returns('123');
            
            const res = {
                writableEnded: true
            } as unknown as Sails.Res;

            controller.callService(req, res);

            expect(mockSails.config.action.testAction.service.testMethod.calledOnce).to.be.true;
            expect(mockSails.config.action.testAction.service.testMethod.calledWith(req, res, sinon.match({ config: mockSails.config.action.testAction }))).to.be.true;
        });

        it('should subscribe to response if not writableEnded', () => {
            const paramStub = sinon.stub();
            const req = {
                param: paramStub
            } as unknown as Sails.Req;
            paramStub.withArgs('action').returns('testAction');
            paramStub.withArgs('oid').returns('123');
            
            const res = {
                writableEnded: false
            } as unknown as Sails.Res;

            const mockResult = { data: 'test' };
            const mockObservable = {
                subscribe: sinon.stub().callsArgWith(0, mockResult)
            };
            mockSails.config.action.testAction.service.testMethod.returns(mockObservable);

            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            controller.callService(req, res);

            expect(mockObservable.subscribe.calledOnce).to.be.true;
            expect(sendRespStub.calledWith(req, res, sinon.match({ data: mockResult }))).to.be.true;
        });
    });
});
