import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/NamedQueryController';

let expect: Chai.ExpectStatic;

describe('Webservice NamedQueryController', () => {
  let controller: Controllers.NamedQuery;
  let originalSails: any;
  let originalBrandingService: any;
  let originalNamedQueryService: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalNamedQueryService = (global as any).NamedQueryService;

    (global as any).sails = {
      log: {
        error: sinon.stub(),
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        trace: sinon.stub()
      }
    };
    (global as any).BrandingService = {
      getBrandFromReq: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).NamedQueryService = {
      list: sinon.stub().resolves([
        { name: 'query-1', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
        { name: 'query-2', collectionName: 'user', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
      ]),
      getNamedQueryConfig: sinon.stub().resolves(null),
      getSupportedCollections: sinon.stub().returns(['record', 'user']),
      create: sinon.stub().returns(of({ id: 'new-query' })),
      update: sinon.stub().returns(of([{ id: 'updated-query' }])),
      delete: sinon.stub().returns(of([{ id: 'deleted-query' }]))
    };

    controller = new Controllers.NamedQuery();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).NamedQueryService = originalNamedQueryService;
  });

  it('lists all named queries', async () => {
    const req = { session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.listQueries(req, res);

    expect((global as any).NamedQueryService.list.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.have.length(2);
    expect(sendRespStub.firstCall.args[2]?.data[0].name).to.equal('query-1');
  });

  it('returns the supported collections', async () => {
    const req = { session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getCollections(req, res);

    expect((global as any).NamedQueryService.getSupportedCollections.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal(['record', 'user']);
  });

  it('gets a named query by name', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('query-1');
    (global as any).NamedQueryService.getNamedQueryConfig = sinon.stub().resolves({
      name: 'query-1', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}
    });
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getQuery(req, res);

    expect((global as any).NamedQueryService.getNamedQueryConfig.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.name).to.equal('query-1');
  });

  it('returns 404 when named query is not found', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('missing-query');
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.status).to.equal('404');
  });

  it('returns 400 when name param is missing for getQuery', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns(undefined);
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.status).to.equal('400');
  });

  it('creates a named query', async () => {
    const req = {
      session: { branding: 'default' },
      body: { name: 'new-query', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect((global as any).NamedQueryService.create.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(201);
    expect(sendRespStub.firstCall.args[2]?.data?.name).to.equal('new-query');
  });

  it('returns 400 when name is reserved in create body', async () => {
    const req = {
      session: { branding: 'default' },
      body: { name: 'collections', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.detail).to.include('reserved');
  });

  it('returns 400 when name is missing in create body', async () => {
    const req = {
      session: { branding: 'default' },
      body: { collectionName: 'record' }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.status).to.equal('400');
  });

  it('maps already exists errors to 409 on create', async () => {
    (global as any).NamedQueryService.create = sinon.stub().throws(new Error("Named query 'new-query' already exists"));
    const req = {
      session: { branding: 'default' },
      body: { name: 'new-query', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(409);
  });

  it('maps brand-scope validation errors to 400 on create', async () => {
    (global as any).NamedQueryService.create = sinon.stub().throws(new Error("Invalid collectionName 'unscopedmodel': model does not expose a brand scope"));
    const req = {
      session: { branding: 'default' },
      body: { name: 'unsafe-query', collectionName: 'unscopedmodel', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
  });

  it('maps model-not-found validation errors to 400 on create (not 404)', async () => {
    (global as any).NamedQueryService.create = sinon.stub().throws(new Error("Invalid collectionName 'badmodel': model not found"));
    const req = {
      session: { branding: 'default' },
      body: { name: 'bad-query', collectionName: 'badmodel', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
  });

  it('maps brand-scope validation errors to 400 on update', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('unsafe-query');
    (global as any).NamedQueryService.update = sinon.stub().throws(new Error("Invalid collectionName 'unscopedmodel': model does not expose a brand scope"));
    const req = {
      session: { branding: 'default' },
      param,
      body: { collectionName: 'unscopedmodel', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.updateQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
  });

  it('updates a named query', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('query-1');
    const req = {
      session: { branding: 'default' },
      param,
      body: { collectionName: 'user', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.updateQuery(req, res);

    expect((global as any).NamedQueryService.update.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.name).to.equal('query-1');
  });

  it('returns 400 when name param is missing for update', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns(undefined);
    const req = { session: { branding: 'default' }, param, body: {} } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.updateQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.status).to.equal('400');
  });

  it('returns 400 when update attempts to change the name', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('query-1');
    const req = {
      session: { branding: 'default' },
      param,
      body: { name: 'query-2', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.updateQuery(req, res);

    expect((global as any).NamedQueryService.update.called).to.be.false;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.detail).to.equal('Named query name cannot be changed');
  });

  it('maps not found errors to 404 on update', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('missing-query');
    (global as any).NamedQueryService.update = sinon.stub().throws(new Error("Named query 'missing-query' was not found"));
    const req = {
      session: { branding: 'default' },
      param,
      body: { collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.updateQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
  });

  it('deletes a named query', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('query-1');
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.deleteQuery(req, res);

    expect((global as any).NamedQueryService.delete.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.name).to.equal('query-1');
  });

  it('returns 400 when name param is missing for delete', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns(undefined);
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.deleteQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    expect(sendRespStub.firstCall.args[2]?.displayErrors).to.be.an('array');
    expect(sendRespStub.firstCall.args[2]?.displayErrors[0]?.status).to.equal('400');
  });

  it('maps not found errors to 404 on delete', async () => {
    const param = sinon.stub();
    param.withArgs('name').returns('missing-query');
    (global as any).NamedQueryService.delete = sinon.stub().throws(new Error("Named query 'missing-query' not found"));
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.deleteQuery(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
  });
});
