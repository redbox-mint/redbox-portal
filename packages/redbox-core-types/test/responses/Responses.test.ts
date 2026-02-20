let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { ok } from '../../src/responses/ok';
import { badRequest } from '../../src/responses/badRequest';
import { created } from '../../src/responses/created';
import { forbidden } from '../../src/responses/forbidden';
import { serverError } from '../../src/responses/serverError';

describe('Responses', function() {
  let req: any;
  let res: any;
  let sailsStub: any;

  beforeEach(function() {
    sailsStub = {
      log: {
        silly: sinon.stub(),
        verbose: sinon.stub(),
        error: sinon.stub()
      },
      config: {
        hooks: {
          views: true
        }
      }
    };

    req = {
      _sails: sailsStub,
      wantsJSON: true,
      options: {}
    };

    res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
      view: sinon.stub(),
      guessView: sinon.stub().callsFake((data, cb) => cb())
    };
  });

  describe('ok', function() {
    it('should return JSON when wantsJSON is true', function() {
      const context = { req, res };
      ok.call(context, { data: 'test' });
      
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.calledWith({ data: 'test' })).to.be.true;
    });

    it('should return view when view option provided', function() {
      req.wantsJSON = false;
      const context = { req, res };
      ok.call(context, { data: 'test' }, 'myView');
      
      expect(res.view.calledWith('myView')).to.be.true;
    });

    it('should send 200 status', function() {
      const context = { req, res };
      ok.call(context);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('should guess view when no view provided', function() {
      req.wantsJSON = false;
      const context = { req, res };
      ok.call(context, { data: 'test' });
      
      expect(res.guessView.called).to.be.true;
    });
  });

  describe('badRequest', function() {
    it('should return 400', function() {
      const context = { req, res };
      badRequest.call(context, 'error');
      
      expect(res.status.calledWith(400)).to.be.true;
      expect(res.json.calledWith('error')).to.be.true;
    });
  });

  describe('created', function() {
    it('should return 201', function() {
      const context = { req, res };
      created.call(context, { id: 1 });
      
      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledWith({ id: 1 })).to.be.true;
    });
  });

  describe('forbidden', function() {
    it('should return 403', function() {
      const context = { req, res };
      forbidden.call(context, 'denied');
      
      expect(res.status.calledWith(403)).to.be.true;
      expect(res.json.calledWith('denied')).to.be.true;
    });
  });

  describe('serverError', function() {
    it('should return 500', function() {
      const context = { req, res };
      serverError.call(context, 'oops');
      
      expect(res.status.calledWith(500)).to.be.true;
      expect(res.json.calledWith('oops')).to.be.true;
    });
  });
});
