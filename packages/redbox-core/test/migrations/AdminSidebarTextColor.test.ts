import { migrateBrandingSidebar } from '../../src/persistence/branding/sidebarMigration';
import type { CorePrismaClient, StoragePrismaClient } from '../../src/persistence/prisma/client';
import * as sinon from 'sinon';

let expect: Chai.ExpectStatic;
const migration = require('../../../../api/migrations/20261014T000000-admin-sidebar-text-color.js');

interface BrandingRow {
  _id: string;
  variables?: Record<string, string> | null;
  css?: string;
  hash?: string;
  version?: number;
}

function modelFor(rows: BrandingRow[]) {
  const updateOne = sinon.stub().callsFake(async ({ _id }, patch) => {
    const row = rows.find(candidate => candidate._id === _id);
    if (!row) throw new Error('missing fixture');
    Object.assign(row, patch);
  });
  return {
    select: () => ({ all: () => ({ toArray: async () => rows }) }),
    where: (where: object) => ({ update: (patch: object) => updateOne(where, patch) }),
    updateOne,
  };
}

function contextFor(brands: BrandingRow[] = [], histories: BrandingRow[] = []) {
  return {
    ormFixtures: {
      brandingconfig: modelFor(brands),
      brandingconfighistory: modelFor(histories),
    },
    log: { info: sinon.stub() },
  };
}

describe('Admin sidebar text colour migration', function () {
  let repositoryStub: sinon.SinonStub;
  beforeEach(() => {
    const runtime = require('@researchdatabox/redbox-core/dist/persistence/branding/runtime');
    repositoryStub = sinon.stub(runtime, 'getBrandingRepository').callsFake((...args: unknown[]) => {
      const app = args[0] as ReturnType<typeof contextFor>;
      return {
        migrateAdminSidebarTextColor: () =>
          migrateBrandingSidebar(
            { orm: { brandingconfig: app.ormFixtures.brandingconfig } } as unknown as CorePrismaClient,
            { orm: { brandingconfighistory: app.ormFixtures.brandingconfighistory } } as unknown as StoragePrismaClient
          ),
      };
    });
  });
  afterEach(() => repositoryStub.restore());

  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('preserves custom colours for drafts and each rollback snapshot without publishing drafts', async function () {
    const brands: BrandingRow[] = [
      {
        _id: 'brand',
        variables: { 'panel-branding-background-color': '#123456', 'panel-branding-color': '#ffffff' },
        css: ':root { --rb-panel-branding-background-color: #654321; }',
        hash: 'published-hash',
        version: 3,
      },
    ];
    const histories: BrandingRow[] = [
      {
        _id: 'history',
        variables: { 'panel-branding-background-color': '#654321', 'panel-branding-color': '#ffffff' },
        css: brands[0].css,
        hash: brands[0].hash,
        version: 3,
      },
    ];
    const beforeBrand = structuredClone(brands[0]);
    const beforeHistory = structuredClone(histories[0]);
    const context = contextFor(brands, histories);

    await migration.up({ context });

    expect(brands[0]).to.deep.equal({
      ...beforeBrand,
      variables: { ...beforeBrand.variables, 'admin-sidebar-text-color': '#123456' },
    });
    expect(histories[0]).to.deep.equal({
      ...beforeHistory,
      variables: { ...beforeHistory.variables, 'admin-sidebar-text-color': '#654321' },
    });
    expect(context.log.info.calledWithMatch('migrated 2')).to.equal(true);
  });

  it('uses the readable legacy default for absent, empty and invalid settings', async function () {
    const brands: BrandingRow[] = [
      { _id: 'absent' },
      { _id: 'null', variables: null },
      { _id: 'empty', variables: {} },
      { _id: 'invalid', variables: { 'panel-branding-background-color': 'url(bad)' } },
    ];

    await migration.up({ context: contextFor(brands) });

    for (const row of brands) {
      expect(row.variables?.['admin-sidebar-text-color']).to.equal('#b1101a');
      expect(row.css).to.equal(undefined);
      expect(row.hash).to.equal(undefined);
      expect(row.version).to.equal(undefined);
    }
  });

  it('honours legacy colour aliases, Sass key prefixes and hex normalization', async function () {
    const brands: BrandingRow[] = [
      { _id: 'alias', variables: { 'panel-branding-background-colour': ' #ABC ' } },
      { _id: 'sass', variables: { '$panel-branding-background-color': '#13579B' } },
      {
        _id: 'both',
        variables: { 'panel-branding-background-color': '#123', '$panel-branding-background-colour': '#456' },
      },
    ];

    await migration.up({ context: contextFor(brands) });

    expect(brands.map(row => row.variables?.['admin-sidebar-text-color'])).to.deep.equal([
      '#aabbcc',
      '#13579b',
      '#445566',
    ]);
  });

  it('retains legacy variables outside the current allowlist', async function () {
    const brands: BrandingRow[] = [
      {
        _id: 'legacy',
        variables: { 'panel-branding-background-color': '#123456', 'branding-font-family': 'Arial' },
      },
    ];

    await migration.up({ context: contextFor(brands) });

    expect(brands[0].variables).to.deep.equal({
      'panel-branding-background-color': '#123456',
      'branding-font-family': 'Arial',
      'admin-sidebar-text-color': '#123456',
    });
  });

  it('retains explicit sidebar colours, including aliases, and performs no writes on rerun', async function () {
    const brands: BrandingRow[] = [
      { _id: 'custom', variables: { 'admin-sidebar-text-color': '#112233' } },
      { _id: 'alias', variables: { '$admin-sidebar-text-colour': '#334455' } },
      { _id: 'legacy', variables: { 'panel-branding-background-color': '#456789' } },
    ];
    const context = contextFor(brands);

    await migration.up({ context });
    expect(context.ormFixtures.brandingconfig.updateOne.callCount).to.equal(1);
    expect(brands[0].variables).to.deep.equal({ 'admin-sidebar-text-color': '#112233' });
    expect(brands[1].variables).to.deep.equal({ '$admin-sidebar-text-colour': '#334455' });
    const after = structuredClone(brands);

    await migration.up({ context });

    expect(brands).to.deep.equal(after);
    expect(context.ormFixtures.brandingconfig.updateOne.callCount).to.equal(1);
    expect(context.log.info.calledWithMatch('migrated 0')).to.equal(true);
  });

  it('can resume after a history write fails without repeating completed writes', async function () {
    const brands: BrandingRow[] = [{ _id: 'brand', variables: { 'panel-branding-background-color': '#123456' } }];
    const histories: BrandingRow[] = [{ _id: 'history', variables: { 'panel-branding-background-color': '#654321' } }];
    const context = contextFor(brands, histories);
    context.ormFixtures.brandingconfighistory.updateOne.onFirstCall().rejects(new Error('database unavailable'));

    try {
      await migration.up({ context });
      expect.fail('migration should stop on a database error');
    } catch (error) {
      expect((error as Error).message).to.equal('database unavailable');
    }
    await migration.up({ context });

    expect(context.ormFixtures.brandingconfig.updateOne.callCount).to.equal(1);
    expect(histories[0].variables?.['admin-sidebar-text-color']).to.equal('#654321');
  });

  it('does nothing on a fresh installation', async function () {
    const context = contextFor();

    await migration.up({ context });

    expect(context.ormFixtures.brandingconfig.updateOne.called).to.equal(false);
    expect(context.ormFixtures.brandingconfighistory.updateOne.called).to.equal(false);
  });
});
