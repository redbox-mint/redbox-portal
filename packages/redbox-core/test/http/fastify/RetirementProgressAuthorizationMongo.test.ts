import assert from 'node:assert/strict';
import { withoutSideEffects } from './noSideEffects';
import sinon from 'sinon';
import { progressOperationRoutes, progressSocketGrantRoute } from '../../../src/http/progressRoutes';
import { getProgressRepositories } from '../../../src/persistence/progress/runtime';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { wire, type Wire } from './mutationDifferentialSupport';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { assertGolden, goldenControls } from './goldenContracts';

const family = 'retirementProgressAuthorization';
const target = '/default/rdmp/asynch';
const bearer = { Authorization: 'Bearer pilot-api-token', Origin: referenceOrigin };
const visible = 'reference-record';
const newlySelected = 'another-readable-record';
const denied = 'denied-record';
const foreign = 'foreign-record';
const missingId = '000000000000000000000097';
const now = '2026-11-14T08:00:00.000Z';
type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;

async function seed(f: Fixture) {
  const brand = Object.assign(new BrandingModel(), f.brand);
  for (const [id, allowed] of [
    [newlySelected, true],
    [denied, false],
  ] as const)
    await f.data.storage().create(
      brand,
      {
        redboxOid: id,
        metadata: { title: id },
        metaMetadata: { brandId: brand.id, type: 'dataRecord' },
        authorization: { view: allowed ? ['pilot-admin'] : [], edit: [], viewRoles: [], editRoles: [] },
      },
      'dataRecord'
    );
  const repository = getProgressRepositories(f.owner).progress;
  const definitions = [
    ['visible', visible, 'pilot-admin', f.brand.id],
    ['denied', denied, 'pilot-admin', f.brand.id],
    ['foreign-record', foreign, 'pilot-admin', f.brand.id],
    ['other-owner', visible, 'another-actor', f.brand.id],
    ['foreign-row', visible, 'pilot-admin', f.otherBrand.id],
  ] as const;
  const rows = new Map<(typeof definitions)[number][0], Awaited<ReturnType<typeof repository.startProgress>>>();
  for (const [index, [name, relatedRecordId, owner, branding]] of definitions.entries())
    rows.set(
      name,
      await repository.startProgress({
        id: '00000000000000000000009' + index,
        name,
        relatedRecordId,
        status: 'pending',
        message: 'payload:' + name,
        started_by: owner,
        branding,
        date_started: '2001-01-01T00:00:00',
        createdAt: now,
        updatedAt: now,
      })
    );
  const read = async () => (await repository.listProgress({})).sort((a, b) => a.name.localeCompare(b.name));
  return { rows, repository, read };
}
function stable(reply: Wire) {
  const headers = { ...reply.headers };
  if (headers['content-length']) assert.equal(Number(headers['content-length']), Buffer.byteLength(reply.text));
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  return { ...reply, headers };
}
function detail(response: Wire, version: string, expected: string) {
  const body = JSON.parse(response.text);
  assert.equal(version === '2.0' ? body.errors[0].detail : body.message, expected);
}

describe('Progress ownership and filtering on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  let fixture: Awaited<ReturnType<typeof seed>>;
  before(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, { declarations: progressOperationRoutes });
    fixture = await seed(f);
  });
  after(async () => f?.close());

  for (const version of ['1.0', '2.0']) {
    const path = (query?: unknown) =>
      target +
      '?apiVersion=' +
      version +
      (query === undefined ? '' : '&fq=' + encodeURIComponent(JSON.stringify(query)));
    for (const [method, row, proposed, status, reason] of [
      ['PUT', 'visible', newlySelected, 400, 'Progress record ownership cannot change'],
      ['DELETE', 'visible', newlySelected, 400, 'Progress record ownership cannot change'],
      ['PUT', 'other-owner', undefined, 403, 'Access Denied'],
      ['DELETE', 'other-owner', undefined, 403, 'Access Denied'],
      ['PUT', 'missing', undefined, 403, 'Access Denied'],
      ['DELETE', 'missing', undefined, 403, 'Access Denied'],
      ['PUT', 'foreign-row', undefined, 403, 'Access Denied'],
      ['PUT', 'denied', undefined, 403, 'Access Denied'],
      ['DELETE', 'denied', undefined, 403, 'Access Denied'],
      ['POST', 'denied', denied, 403, 'Access Denied'],
      ['POST', 'foreign-record', foreign, 403, 'Access Denied'],
    ] as const)
      it(`refuses ${method} for ${row} (${reason}) in API ${version}`, async () => {
        const { repository, rows, read } = fixture;
        const before = await read();
        const spies = sinon.createSandbox();
        try {
          const list = spies.spy(repository, 'listProgress');
          const start = spies.spy(repository, 'startProgress');
          const revise = spies.spy(repository, 'reviseProgress');
          const id = row === 'missing' ? missingId : rows.get(row)!.id;
          const response = await withoutSideEffects(f, () =>
            wire(
              f.url + path(),
              method,
              { ...bearer, 'Content-Type': 'application/json' },
              JSON.stringify({ id, relatedRecordId: proposed, name: 'would-write' })
            )
          );
          assert.equal(response.status, status, response.text);
          detail(response, version, reason);
          if (method !== 'POST') assert.deepEqual(list.firstCall?.args[0], { id, branding: f.brand.id });
          assert.equal(start.callCount, 0);
          assert.equal(revise.callCount, 0);
          const after = await read();
          assert.deepEqual(after, before);
          assertGolden(family, `${method}/${row}/${version}`, {
            wire: stable(response),
            state: { start: start.callCount, revise: revise.callCount, progress: after },
          });
        } finally {
          spies.restore();
        }
      });

    for (const [label, query] of [
      ['foreign tenant override', { where: { branding: '000000000000000000000012' } }],
      ['selector object', { where: { id: { $ne: '' } } }],
    ] as const)
      it(`rejects a ${label} before progress storage in API ${version}`, async () => {
        const list = sinon.spy(fixture.repository, 'listProgress');
        try {
          const response = await wire(f.url + path(query), 'GET', bearer);
          assert.equal(response.status, 400, response.text);
          detail(response, version, 'Invalid progress query');
          assert.equal(list.callCount, 0);
          assertGolden(family, `${label}/${version}`, { wire: stable(response), state: { reads: list.callCount } });
        } finally {
          list.restore();
        }
      });

    it(`returns only readable progress in the current tenant in API ${version}`, async () => {
      const list = sinon.spy(fixture.repository, 'listProgress');
      try {
        const response = await wire(f.url + path({ where: { status: 'pending' } }), 'GET', bearer);
        assert.equal(response.status, 200, response.text);
        assert.deepEqual(list.firstCall?.args[0], { where: { branding: f.brand.id, status: 'pending' }, limit: 1000 });
        const parsed = JSON.parse(response.text);
        const rows = version === '2.0' ? parsed.data : parsed;
        assert.deepEqual(
          rows.map((r: { id: string }) => r.id).sort(),
          ['visible', 'other-owner']
            .map(k => (k === 'visible' ? fixture.rows.get('visible')!.id : fixture.rows.get('other-owner')!.id))
            .sort()
        );
        assert.doesNotMatch(response.text, /foreign|payload:denied/);
        assertGolden(family, `list/${version}`, {
          wire: stable(response),
          state: { firstRead: list.firstCall?.args[0] },
        });
      } finally {
        list.restore();
      }
    });
  }
});

describe('Progress foreign actor with reduced production policies', function () {
  this.timeout(120000);
  let f: Fixture;
  before(async () => {
    f = await referenceProductionFixture(true, { '*': ['noCache', 'brandingAndPortal', 'browserActor'] }, undefined, {
      declarations: [...progressOperationRoutes, progressSocketGrantRoute],
    });
  });
  after(async () => f?.close());
  for (const version of ['1.0', '2.0'])
    for (const [method, suffix] of [
      ['GET', ''],
      ['POST', '/socket-token'],
    ] as const)
      it(`refuses ${method} ${target}${suffix} for a foreign actor in API ${version}`, async () => {
        const response = await withoutSideEffects(f, () =>
          wire(f.url + target + suffix + '?apiVersion=' + version, method, {
            ...bearer,
            Authorization: 'Bearer foreign-token',
          })
        );
        assert.equal(response.status, 403, response.text);
        detail(response, version, 'Access Denied');
        assertGolden(family, `foreign-actor/${method}/${version}`, stable(response));
      });
});

goldenControls(family);
