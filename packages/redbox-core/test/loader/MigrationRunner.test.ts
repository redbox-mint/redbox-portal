let expect: Chai.ExpectStatic;
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';

import { getActiveMigrationLease } from '../../src/services/AuthorizationMigrationService';
import { runPendingMigrations, toRunnableMigrations, type RedboxMigration } from '../../src/loader/MigrationRunner';

const fsPromises = fs.promises;

interface TestSailsLog {
  verbose: sinon.SinonStub;
  info: sinon.SinonStub;
  warn: sinon.SinonStub;
  error: sinon.SinonStub;
}

interface TestSailsDouble {
  models: Record<string, unknown>;
  log: TestSailsLog;
}

function getTestSails(): TestSailsDouble {
  const sailsGlobal: unknown = Reflect.get(globalThis, 'sails');
  if (typeof sailsGlobal !== 'object' || sailsGlobal === null) {
    throw new Error('sails global is not set for MigrationRunner tests.');
  }
  return sailsGlobal as TestSailsDouble;
}

describe('MigrationRunner', function () {
  const sandboxDir = path.join(os.tmpdir(), 'redbox-migration-runner-test-' + Date.now());
  let originalCwd: string;
  let hadOriginalSails: boolean;
  let originalSails: unknown;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(async function () {
    originalCwd = process.cwd();
    hadOriginalSails = Object.prototype.hasOwnProperty.call(globalThis, 'sails');
    originalSails = Reflect.get(globalThis, 'sails');

    await fsPromises.mkdir(sandboxDir, { recursive: true });
    await fsPromises.writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    process.chdir(sandboxDir);

    Reflect.set(globalThis, 'sails', {
      models: {},
      log: {
        verbose: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
    });
  });

  afterEach(async function () {
    sinon.restore();
    process.chdir(originalCwd);
    if (hadOriginalSails) {
      Reflect.set(globalThis, 'sails', originalSails);
    } else {
      Reflect.deleteProperty(globalThis, 'sails');
    }
    await fsPromises.rm(sandboxDir, { recursive: true, force: true });
  });

  function setMigrationModel(executedNames: string[] = []) {
    const rows = executedNames.map((name, index) => ({ name, ranAt: index + 1 }));
    const created: Array<Record<string, unknown>> = [];
    const sort = sinon.stub().resolves(rows);
    const model = {
      find: sinon.stub().returns({ sort }),
      create: sinon.stub().callsFake(async (values: Record<string, unknown>) => {
        created.push(values);
        return values;
      }),
      destroy: sinon.stub().resolves([]),
    };
    getTestSails().models.migration = model;
    return { model, created, sort };
  }

  it('should no-op for an empty migration list', async function () {
    await runPendingMigrations([]);
    expect(getTestSails().models.migration).to.be.undefined;
  });

  it('should execute pending migrations in lexical name order and log each success', async function () {
    const { created } = setMigrationModel();
    const callOrder: string[] = [];
    const migrations: RedboxMigration[] = [
      {
        name: '2026.06.08T10.00.00-second',
        source: 'hook',
        up: sinon.stub().callsFake(async () => callOrder.push('second')),
      },
      {
        name: '2026.06.08T09.00.00-first',
        source: 'app',
        up: sinon.stub().callsFake(async () => callOrder.push('first')),
      },
    ];

    await runPendingMigrations(migrations);

    expect(callOrder).to.deep.equal(['first', 'second']);
    expect(created.map(row => row.name)).to.deep.equal(['2026.06.08T09.00.00-first', '2026.06.08T10.00.00-second']);
    expect(created[0].source).to.equal('app');
    expect(created[0].appVersion).to.equal('1.2.3');
    expect(created[0].ranAt).to.be.a('number');
    expect(created[0].durationMs).to.be.a('number');
    expect(created[0].executedBy).to.be.a('string').and.to.not.be.empty;
  });

  it('passes the held lease to migrations independently of service module state', async function () {
    setMigrationModel();
    let called = false;
    await runPendingMigrations([
      {
        name: '2026.06.08T09.00.00-lease',
        up: async params => {
          called = true;
          expect(params?.lease).to.equal(getActiveMigrationLease());
          expect(params?.lease?.owner).to.be.a('string').and.to.not.be.empty;
          expect(params?.lease?.fence).to.be.a('number');
        },
      },
    ]);
    expect(called).to.equal(true);
  });

  it('should log the pending migration names before executing', async function () {
    setMigrationModel(['2026.06.08T09.00.00-first']);

    await runPendingMigrations([
      { name: '2026.06.08T09.00.00-first', up: sinon.stub().resolves() },
      { name: '2026.06.08T10.00.00-second', up: sinon.stub().resolves() },
    ]);

    const info = getTestSails().log.info;
    expect(info.calledWithMatch('Data migrations: 1 pending: 2026.06.08T10.00.00-second')).to.be.true;
  });

  it('should skip all migrations when REDBOX_SKIP_MIGRATIONS=true', async function () {
    const originalValue = process.env.REDBOX_SKIP_MIGRATIONS;
    process.env.REDBOX_SKIP_MIGRATIONS = 'true';
    try {
      const { created } = setMigrationModel();
      const up = sinon.stub().resolves();

      await runPendingMigrations([{ name: '2026.06.08T09.00.00-first', up }]);

      expect(up.called).to.be.false;
      expect(created).to.deep.equal([]);
      const warn = getTestSails().log.warn;
      expect(warn.calledWithMatch('REDBOX_SKIP_MIGRATIONS=true')).to.be.true;
    } finally {
      if (originalValue === undefined) {
        delete process.env.REDBOX_SKIP_MIGRATIONS;
      } else {
        process.env.REDBOX_SKIP_MIGRATIONS = originalValue;
      }
    }
  });

  it('should skip already executed migrations', async function () {
    const { created } = setMigrationModel(['2026.06.08T09.00.00-first']);
    const first = sinon.stub().resolves();
    const second = sinon.stub().resolves();

    await runPendingMigrations([
      { name: '2026.06.08T09.00.00-first', up: first },
      { name: '2026.06.08T10.00.00-second', up: second },
    ]);

    expect(first.called).to.be.false;
    expect(second.calledOnce).to.be.true;
    expect(created.map(row => row.name)).to.deep.equal(['2026.06.08T10.00.00-second']);
  });

  it('should halt on first migration failure', async function () {
    const { created } = setMigrationModel();
    const failure = new Error('migration failed');
    const first = sinon.stub().rejects(failure);
    const second = sinon.stub().resolves();

    let caughtError: unknown;
    try {
      await runPendingMigrations([
        { name: '2026.06.08T09.00.00-first', up: first },
        { name: '2026.06.08T10.00.00-second', up: second },
      ]);
    } catch (error) {
      caughtError = error;
    }

    expect((caughtError as { cause?: unknown }).cause).to.equal(failure);
    expect(second.called).to.be.false;
    expect(created).to.deep.equal([]);
  });

  it('should forward an optional down handler to Umzug for manual rollbacks', async function () {
    const down = sinon.stub().resolves();
    const [runnable] = toRunnableMigrations([{ name: '2026.06.08T09.00.00-first', up: sinon.stub().resolves(), down }]);

    expect(runnable.name).to.equal('2026.06.08T09.00.00-first');
    expect(runnable.down).to.equal(down);

    await runnable.down!({
      name: runnable.name,
      path: undefined,
      context: Reflect.get(globalThis, 'sails') as typeof sails,
    });
    expect(down.calledOnce).to.be.true;
  });

  it('should leave down undefined when a migration omits it', async function () {
    const [runnable] = toRunnableMigrations([{ name: '2026.06.08T09.00.00-first', up: sinon.stub().resolves() }]);

    expect(runnable.down).to.be.undefined;
  });

  it('should tolerate executed migration names missing from the current migration list', async function () {
    const { created } = setMigrationModel(['2026.06.08T08.00.00-removed']);
    const pending = sinon.stub().resolves();

    await runPendingMigrations([{ name: '2026.06.08T09.00.00-pending', up: pending }]);

    expect(pending.calledOnce).to.be.true;
    expect(created.map(row => row.name)).to.deep.equal(['2026.06.08T09.00.00-pending']);
  });
});
