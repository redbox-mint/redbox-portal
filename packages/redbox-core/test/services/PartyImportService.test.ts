import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { parsePartyCsv, mapPartyRows, Services, partyImportHash } from '../../src/services/PartyImportService';
import { partyImportApiRoutes } from '../../src/api-routes/groups/party-import';

async function rejects(fn: () => Promise<unknown>, code: string) {
  let caught: any; try { await fn(); } catch (error) { caught = error; }
  expect(caught?.code).to.equal(code);
}
describe('PartyImportService', () => {
  const brand: any = { id: 'brand-a' };
  const user: any = { id: 'admin-a', username: 'admin', roles: [] };
  let service: Services.PartyImport;
  let records: any;
  beforeEach(() => {
    service = new Services.PartyImport();
    records = { getRecords: sinon.stub().resolves({ isSuccessful: () => true, totalItems: 0, items: [] }), create: sinon.stub().resolves({ wasPersisted: () => true, outcome: 'saved', oid: 'party-created', problems: [] }) };
    (global as any).RecordsService = records;
    (global as any).RecordTypesService = { get: sinon.stub().returns(of({ name: 'party' })) };
  });
  afterEach(() => { sinon.restore(); delete (global as any).RecordsService; delete (global as any).RecordTypesService; });
  it('parses BOM, quotes, commas, CRLF and positional hostile headers without prototype writes', async () => {
    const parsed = await parsePartyCsv('\uFEFF__proto__,Email\r\n"A, ""B""",a@b.org\r\n');
    expect(parsed.headers).to.deep.equal(['__proto__', 'Email']);
    expect(parsed.rows).to.deep.equal([['A, "B"', 'a@b.org']]);
  });
  it('rejects limits, malformed rows and unfinished quotes', async () => {
    await rejects(() => parsePartyCsv('x'.repeat(2 * 1024 * 1024 + 1)), 'size-limit');
    await rejects(() => parsePartyCsv('a,b\n' + 'c,d\n'.repeat(5001)), 'row-limit');
    await rejects(() => parsePartyCsv('a,b\nc\n'), 'invalid-csv');
    await rejects(() => parsePartyCsv('a,b\n"unfinished,d'), 'invalid-csv');
    await rejects(() => parsePartyCsv('a\0,b\nc,d'), 'invalid-csv');
    expect((await parsePartyCsv('a,b\n' + 'c,d\n'.repeat(5000))).rows).to.have.length(5000);
  });
  it('validates mapping, name/email/ORCID, formula injection, control characters and duplicate case-folded emails', () => {
    const rows = mapPartyRows([['Alice', 'A@b.org', ''], ['Bob', 'a@b.org', ''], ['', 'bad', 'invalid'], ['  =HYPERLINK("x")', 'c@d.org', ''], ['<script>', 'e@f.org', ''], ['\tName', 'g@h.org', '']], { fullName: 0, email: 1, orcid: 2 });
    expect(rows[0].metadata).to.include({ fullName: 'Alice', givenName: 'Alice', email: 'a@b.org' });
    expect(rows[1].reasons).to.include('duplicate-file');
    expect(rows[2].reasons).to.include.members(['name-required', 'invalid-email', 'invalid-orcid']);
    for (const index of [3,4,5]) expect(rows[index].reasons).to.include('unsafe-value');
    for (const mapping of [{ email: 0 }, { fullName: 0, email: 0 }, { fullName: 0, email: 8 }, { fullName: 0, email: 1, __proto__: 3 }, { fullName: 0, email: 1, authorization: 2 }]) {
      if (Object.getPrototypeOf(mapping) !== Object.prototype) continue;
      if (Object.keys(mapping).length === 2 && mapping.email === 1) continue;
      expect(() => mapPartyRows([['A','a@b.org']], mapping)).to.throw();
    }
  });
  it('finds brand-scoped likely duplicates and creates only valid rows via the normal record service', async () => {
    records.getRecords.callsFake(async (...args: any[]) => ({ isSuccessful: () => true, totalItems: args[11] === 'existing@b.org' ? 1 : 0, items: args[11] === 'existing@b.org' ? [{ metadata: { email: 'Existing@b.org' } }] : [] }));
    const csv = 'Name,Email\nAlice,a@b.org\nExisting,existing@b.org\nBad,invalid\nAgain,A@b.org';
    const preview = await service.preview(csv, { fullName: 0, email: 1 }, brand, user);
    expect(preview.valid).to.equal(1);
    expect(preview.rows[1].reasons).to.include('duplicate-existing');
    expect(records.getRecords.firstCall.args[6]).to.equal(brand);
    const result = await service.apply(csv, { fullName: 0, email: 1 }, brand, user);
    expect(records.create.calledOnce).to.equal(true);
    const args = records.create.firstCall.args;
    expect(args.slice(0, 1)).to.deep.equal([brand]);
    expect(args[1].metadata.givenName).to.equal('Alice');
    expect(args[3]).to.equal(user);
    expect(args.slice(4, 6)).to.deep.equal([true, true]);
    expect(args[7]).to.include({ routeFamily: 'browser', operation: 'create' });
    expect(result.rows.map(row => row.status)).to.deep.equal(['saved', 'skipped', 'skipped', 'skipped']);
  });
  it('continues after failed, warning and unknown creation outcomes without automatic replay', async () => {
    records.create.onCall(0).resolves({ wasPersisted: () => false, outcome: 'not-saved', problems: [{ kind: 'validation', code: 'record-validation-failed' }] });
    records.create.onCall(1).rejects(new Error('private error'));
    records.create.onCall(2).resolves({ wasPersisted: () => true, outcome: 'saved-with-warnings', oid: 'warning-row', problems: [] });
    const result = await service.apply('Name,Email\nA,a@b.org\nB,b@b.org\nC,c@b.org', { fullName: 0, email: 1 }, brand, user);
    expect(result.rows.map(row => row.status)).to.deep.equal(['failed', 'unknown', 'saved-with-warnings']);
    expect(JSON.stringify(result)).not.to.include('private error');
  });
  it('binds previews to the actor, brand and mapping and protects all HTTP operations with CSRF', () => {
    const input = { csv: 'Name,Email\nA,a@b.org', mapping: { fullName: 0, email: 1 } };
    expect(partyImportHash(input,'a','u')).not.to.equal(partyImportHash(input,'b','u'));
    expect(partyImportHash(input,'a','u')).not.to.equal(partyImportHash(input,'a','v'));
    for (const route of partyImportApiRoutes) { expect(route.csrf).to.equal(true); expect(route.extensions?.['x-redbox-roles']).to.deep.equal(['Admin']); }
  });
});
