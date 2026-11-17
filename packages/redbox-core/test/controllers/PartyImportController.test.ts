import { expect } from 'chai';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/PartyImportController';
import { partyImportHash } from '../../src/services/PartyImportService';
describe('PartyImportController', () => {
  let controller: Controllers.PartyImport; let req: any; let send: sinon.SinonStub; let deleteOne: sinon.SinonStub;
  const brand: any = { id: 'brand-a' }; const user = { id: 'admin-a', username: 'admin' };
  beforeEach(() => {
    controller = new Controllers.PartyImport(); send = sinon.stub(controller as any, 'sendResp');
    (global as any).BrandingService = { getBrand: sinon.stub().returns(brand) };
    (global as any).RolesService = { getRoleByName: () => ({ id: 'role-a' }) };
    (global as any).UsersService = { hasRole: () => true };
    (global as any).PartyImportService = { preview: sinon.stub().resolves({ rows: [], valid: 0, invalid: 0 }), apply: sinon.stub().resolves({ rows: [] }) };
    deleteOne = sinon.stub().resolves({ deletedCount: 1 });
    (global as any).CacheEntry = { destroy: sinon.stub().resolves(), create: sinon.stub().resolves(), tableName: 'cacheentry', getDatastore: () => ({ manager: { collection: () => ({ deleteOne }) } }) };
    req = { params: { branding: 'a' }, user, isAuthenticated: () => true, session: { save: (fn: any) => fn() }, body: { csv: 'Name,Email\nA,a@b.org', mapping: { fullName: 0, email: 1 } } };
  });
  afterEach(() => { sinon.restore(); for (const key of ['BrandingService','RolesService','UsersService','PartyImportService','CacheEntry']) delete (global as any)[key]; });
  it('denies unauthenticated and other-brand actors before touching import services', async () => {
    req.isAuthenticated = () => false; await controller.preview(req, {} as any); expect(send.lastCall.args[2].status).to.equal(403);
    req.isAuthenticated = () => true; (global as any).UsersService.hasRole = () => false;
    await controller.preview(req, {} as any); expect(send.lastCall.args[2].status).to.equal(403);
    expect((global as any).PartyImportService.preview.called).to.equal(false);
  });
  it('rejects stale, altered and consumed previews and claims once before creation', async () => {
    req.body.token = 'token';
    req.session.partyImport = { token: 'token', hash: 'wrong', expires: Date.now() + 10000 };
    await controller.apply(req, {} as any); expect(send.lastCall.args[2].status).to.equal(409);
    req.session.partyImport.hash = partyImportHash({ csv: req.body.csv, mapping: req.body.mapping }, brand.id, user.id);
    await controller.apply(req, {} as any);
    expect(deleteOne.calledOnce).to.equal(true);
    expect(deleteOne.firstCall.args[0]).to.deep.equal({ name: 'party-import:token', 'data.hash': req.session.partyImport?.hash ?? partyImportHash({ csv: req.body.csv, mapping: req.body.mapping }, brand.id, user.id) });
    expect((global as any).PartyImportService.apply.calledOnce).to.equal(true);
    await controller.apply(req, {} as any); expect(send.lastCall.args[2].status).to.equal(409);
  });
  it('does not create rows when another worker already deleted the preview claim', async () => {
    req.body.token = 'token';
    req.session.partyImport = { token: 'token', hash: partyImportHash({ csv: req.body.csv, mapping: req.body.mapping }, brand.id, user.id), expires: Date.now() + 10000 };
    deleteOne.resolves({ deletedCount: 0 });
    await controller.apply(req, {} as any);
    expect(send.lastCall.args[2].status).to.equal(409);
    expect((global as any).PartyImportService.apply.called).to.equal(false);
  });
});
