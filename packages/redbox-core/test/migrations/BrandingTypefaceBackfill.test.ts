let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

function matches(row: FakeRow, criteria: Record<string, unknown>): boolean {
  return Object.entries(criteria).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return matches(row, value as Record<string, unknown>);
    }
    return (row[key] as unknown) === value;
  });
}

function asQuery(rows: FakeRow[]) {
  return {
    sort(spec: string): Promise<FakeRow[]> {
      const [field, dir] = spec.split(' ');
      const sorted = [...rows].sort((a, b) => {
        const left = a[field] as number;
        const right = b[field] as number;
        return dir === 'DESC' ? right - left : left - right;
      });
      return Promise.resolve(sorted);
    },
    then<TResult1 = FakeRow[], TResult2 = never>(
      resolve?: (value: FakeRow[]) => TResult1 | PromiseLike<TResult1>,
      reject?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
}

class FakeCollection {
  rows: FakeRow[] = [];
  writes = 0;
  conflictOnce = false;
  private nextId = 1;
  private uniqueKey?: (row: FakeRow) => string;

  constructor(uniqueKey?: (row: FakeRow) => string) {
    this.uniqueKey = uniqueKey;
  }

  seed(rows: FakeRow[]): void {
    this.rows = rows.map(row => ({ ...row }));
  }

  find(criteria: Record<string, unknown>): ReturnType<typeof asQuery> {
    return asQuery(this.rows.filter(row => matches(row, criteria)));
  }

  async findOne(criteria: Record<string, unknown>): Promise<FakeRow | undefined> {
    return this.rows.find(row => matches(row, criteria));
  }

  updateOne(criteria: Record<string, unknown>): {
    set: (patch: Record<string, unknown>) => Promise<FakeRow | undefined>;
  } {
    return {
      set: async (patch: Record<string, unknown>) => {
        const row = this.rows.find(candidate => matches(candidate, criteria));
        if (!row) {
          return undefined;
        }
        Object.assign(row, patch);
        this.writes += 1;
        return row;
      },
    };
  }

  async create(values: Record<string, unknown>): Promise<FakeRow> {
    if (this.conflictOnce) {
      this.conflictOnce = false;
      // Simulate a concurrent migration runner winning the same insert first.
      this.rows.push({ id: `id-${this.nextId++}`, ...values });
      const conflict = new Error('E_UNIQUE: duplicate key') as Error & { code?: string };
      conflict.code = 'E_UNIQUE';
      throw conflict;
    }
    if (this.uniqueKey) {
      const key = this.uniqueKey({ ...(values as FakeRow) });
      if (this.rows.some(row => this.uniqueKey?.(row) === key)) {
        const conflict = new Error('E_UNIQUE: duplicate key') as Error & { code?: string };
        conflict.code = 'E_UNIQUE';
        throw conflict;
      }
    }
    const row: FakeRow = { id: `id-${this.nextId++}`, ...values };
    this.rows.push(row);
    this.writes += 1;
    return row;
  }

  async destroy(criteria: Record<string, unknown>): Promise<void> {
    const before = this.rows.length;
    this.rows = this.rows.filter(row => !matches(row, criteria));
    if (this.rows.length !== before) {
      this.writes += 1;
    }
  }
}

function buildSails() {
  const brandingconfig = new FakeCollection();
  const brandingconfighistory = new FakeCollection(row => `${String(row.branding)}:${String(row.version)}`);
  const infos: string[] = [];
  const sails = {
    models: { brandingconfig, brandingconfighistory },
    config: { branding: { historyMaxVersions: 3 } },
    log: {
      info: (message: string) => infos.push(message),
      verbose: (message: string) => infos.push(message),
    },
  };
  return { sails, brandingconfig, brandingconfighistory, infos };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadedMigration = require('../../../../api/migrations/20260904000000-branding-typeface-backfill.js') as
  | { name: string; up: (params: { context: unknown }) => Promise<void>; down?: unknown }
  | Array<{ name: string; up: (params: { context: unknown }) => Promise<void>; down?: unknown }>;
const migration = (Array.isArray(loadedMigration) ? loadedMigration : [loadedMigration]) as Array<{
  name: string;
  up: (params: { context: unknown }) => Promise<void>;
}>;

function brand(overrides: Record<string, unknown> = {}): FakeRow {
  return {
    id: 'brand-1',
    name: 'default',
    variables: { primary: '#112233' },
    css: 'css-1',
    hash: 'hash-1',
    version: 0,
    ...overrides,
  };
}

function history(brandId: string, version: number, overrides: Record<string, unknown> = {}): FakeRow {
  return {
    id: `history-${version}`,
    branding: brandId,
    version,
    hash: 'hash-1',
    css: 'css-1',
    variables: { primary: '#112233' },
    ...overrides,
  };
}

describe('Branding typeface backfill migration', function () {
  it('keeps an independent blue draft out of published red history', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 2, variables: { primary: '#0000ff' } })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    await migration[0].up({ context: sails });
    expect(brandingconfig.rows[0].version).to.equal(2);
    expect(brandingconfig.rows[0].variables).to.deep.equal({ primary: '#0000ff' });
    expect(brandingconfighistory.rows).to.have.lengthOf(2);
  });

  it('preserves published colours on rollback without copying the draft', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 1, variables: { primary: '#0000ff' } })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    await migration[0].up({ context: sails });
    expect(brandingconfighistory.rows.find(row => row.version === 3)?.variables).to.deep.equal({ primary: '#112233' });
    expect(brandingconfig.rows[0].variables).to.deep.equal({ primary: '#0000ff' });
  });

  for (const limit of [0.5, 1.5, NaN, Infinity, 0, -1]) {
    it(`uses a logged safe retention default for ${limit}`, async function () {
      const { sails, brandingconfig, brandingconfighistory, infos } = buildSails();
      sails.config.branding.historyMaxVersions = limit;
      brandingconfig.seed([brand({ version: 4 })]);
      brandingconfighistory.seed([1, 2, 3, 4].map(version => history('brand-1', version)));
      await migration[0].up({ context: sails });
      expect(brandingconfighistory.rows.map(row => row.version)).to.deep.equal([2, 3, 4]);
      expect(infos.some(message => message.includes('Invalid historyMaxVersions'))).to.equal(true);
    });
  }

  it('recovers restorable editable colours from real published CSS without a matching row', async function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const theme = new Services.BrandingThemeCss();
    const published = theme.generate({ primary: '#ff0000' });
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 5, ...published, variables: { primary: '#0000ff' } })]);
    await migration[0].up({ context: sails });
    const variables = brandingconfighistory.rows[0].variables;
    expect(theme.generate(theme.validateVariables(variables)).css).to.equal(published.css);
    expect(brandingconfig.rows[0].variables).to.deep.equal({ primary: '#0000ff' });
  });

  it('fails before pruning unrecoverable published colours', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 5, css: 'unrecoverable', hash: 'different' })]);
    brandingconfighistory.seed([1, 2, 3, 4].map(version => history('brand-1', version)));
    let error: unknown;
    try {
      await migration[0].up({ context: sails });
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).to.contain('cannot recover published colours');
    expect(brandingconfighistory.rows).to.have.lengthOf(4);
  });

  it('exports a single named migration with up and no destructive down', function () {
    expect(migration).to.be.an('array').with.lengthOf(1);
    expect(migration[0].name).to.equal('20260904000000-branding-typeface-backfill');
    expect(migration[0].up).to.be.a('function');
    expect((migration[0] as { down?: unknown }).down).to.equal(undefined);
  });

  it('backfills a fresh brand with no history', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ typeface: undefined, draftTypeface: undefined, draftRevision: undefined })]);
    await migration[0].up({ context: sails });
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.typeface).to.equal(null);
    expect(updated?.draftTypeface).to.equal(null);
    expect(updated?.draftRevision).to.equal(0);
    expect(brandingconfighistory.rows).to.have.lengthOf(0);
  });

  it('leaves a normal brand untouched apart from backfill', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 2 })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    const writesBefore = brandingconfig.writes + brandingconfighistory.writes;
    await migration[0].up({ context: sails });
    expect(brandingconfighistory.rows.map(row => row.version).sort()).to.deep.equal([1, 2]);
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.version).to.equal(2);
    expect(brandingconfig.writes + brandingconfighistory.writes - writesBefore).to.be.greaterThan(0);
  });

  it('preserves rewound active state before pruning', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 1 })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2), history('brand-1', 3)]);
    await migration[0].up({ context: sails });
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.version).to.equal(4);
    expect(brandingconfighistory.rows.map(row => row.version).sort()).to.deep.equal([2, 3, 4]);
  });

  it('snapshots active state with no matching history', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 5 })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    await migration[0].up({ context: sails });
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.version).to.equal(3);
    expect(brandingconfighistory.rows.map(row => row.version).sort()).to.deep.equal([1, 2, 3]);
  });

  it('preserves divergent active colours over a same-number history', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 2, css: ':root { --rb-primary: #ff0000; }', hash: 'hash-diverged' })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    await migration[0].up({ context: sails });
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.version).to.equal(3);
    const preserved = await brandingconfighistory.findOne({ branding: 'brand-1', version: 3 });
    expect(preserved?.css).to.equal(':root { --rb-primary: #ff0000; }');
    expect(preserved?.typeface).to.equal(null);
  });

  it('prunes over-retained history to the newest three', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 5 })]);
    brandingconfighistory.seed([
      history('brand-1', 1),
      history('brand-1', 2),
      history('brand-1', 3),
      history('brand-1', 4),
      { ...history('brand-1', 5), id: 'history-5' },
    ]);
    await migration[0].up({ context: sails });
    expect(brandingconfighistory.rows.map(row => row.version).sort()).to.deep.equal([3, 4, 5]);
  });

  it('converges when a concurrent runner wins the preservation insert', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 1 })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2), history('brand-1', 3)]);
    brandingconfighistory.conflictOnce = true;
    await migration[0].up({ context: sails });
    const updated = await brandingconfig.findOne({ id: 'brand-1' });
    expect(updated?.version).to.equal(4);
    expect(brandingconfighistory.rows.filter(row => row.version === 4)).to.have.lengthOf(1);
    expect(brandingconfighistory.rows.map(row => row.version).sort()).to.deep.equal([2, 3, 4]);
  });

  it('performs zero writes on rerun', async function () {
    const { sails, brandingconfig, brandingconfighistory } = buildSails();
    brandingconfig.seed([brand({ version: 2 })]);
    brandingconfighistory.seed([history('brand-1', 1), history('brand-1', 2)]);
    await migration[0].up({ context: sails });
    brandingconfig.writes = 0;
    brandingconfighistory.writes = 0;
    await migration[0].up({ context: sails });
    expect(brandingconfig.writes).to.equal(0);
    expect(brandingconfighistory.writes).to.equal(0);
  });
});
