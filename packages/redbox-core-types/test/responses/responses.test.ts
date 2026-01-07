import { expect } from 'chai';
import * as Responses from '../../src/responses';
import * as sinon from 'sinon';

describe('Responses', () => {
    let req: any;
    let res: any;
    let sails: any;

    beforeEach(() => {
        sails = {
            log: {
                silly: sinon.spy(),
                verbose: sinon.spy(),
                error: sinon.spy()
            },
            config: {
                environment: 'development',
                hooks: {
                    views: true
                }
            }
        };
        req = {
            _sails: sails,
            wantsJSON: false
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy(),
            view: sinon.spy(),
            guessView: sinon.spy()
        };
    });

    describe('ok', () => {
        it('should send 200 status', () => {
            Responses.ok.call({ req, res });
            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should send json if wantsJSON is true', () => {
            req.wantsJSON = true;
            Responses.ok.call({ req, res }, { foo: 'bar' });
            expect(res.json.calledWith({ foo: 'bar' })).to.be.true;
        });

        it('should call res.view if view option provided', () => {
            Responses.ok.call({ req, res }, { foo: 'bar' }, 'my/view');
            expect(res.view.calledWith('my/view')).to.be.true;
        });
    });

    describe('badRequest', () => {
        it('should send 400 status', () => {
            Responses.badRequest.call({ req, res });
            expect(res.status.calledWith(400)).to.be.true;
        });
    });

    describe('created', () => {
        it('should send 201 status', () => {
            Responses.created.call({ req, res });
            expect(res.status.calledWith(201)).to.be.true;
        });
    });

    describe('forbidden', () => {
        it('should send 403 status', () => {
            Responses.forbidden.call({ req, res });
            expect(res.status.calledWith(403)).to.be.true;
        });
    });

    describe('serverError', () => {
        it('should send 500 status', () => {
            Responses.serverError.call({ req, res });
            expect(res.status.calledWith(500)).to.be.true;
        });
    });

});
