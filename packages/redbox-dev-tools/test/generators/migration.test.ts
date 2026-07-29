const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const loadTs = require('../support/load-ts.cjs');
const migrationGeneratorModule = loadTs(module, '../../src/generators/migration');

describe('MigrationGenerator', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a timestamped migration file in api/migrations', async () => {
    const generator = new migrationGeneratorModule.MigrationGenerator({
      description: 'Backfill dataset label',
      root: tempRoot,
      now: new Date(Date.UTC(2026, 5, 8, 10, 0, 0)),
    });

    await generator.generate();

    const migrationPath = path.join(tempRoot, 'api', 'migrations', '20260608T100000-backfill-dataset-label.js');
    expect(generator.migrationName).to.equal('20260608T100000-backfill-dataset-label');
    expect(generator.migrationPath).to.equal(migrationPath);
    expect(fs.existsSync(migrationPath)).to.be.true;

    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).to.contain("name: '20260608T100000-backfill-dataset-label'");
    expect(content).to.contain('up: async ({ context: sails } = {}) =>');
    expect(content).to.contain('is not implemented yet');
    // The skeleton must be loadable as a valid migration module
    const migration = require(migrationPath);
    expect(migration.name).to.equal('20260608T100000-backfill-dataset-label');
    expect(migration.up).to.be.a('function');
  });

  it('should respect dry-run option', async () => {
    const generator = new migrationGeneratorModule.MigrationGenerator({
      description: 'dry run migration',
      dryRun: true,
      root: tempRoot,
    });

    await generator.generate();

    expect(fs.existsSync(path.join(tempRoot, 'api', 'migrations'))).to.be.false;
  });

  it('should reject descriptions that produce an empty slug', async () => {
    const generator = new migrationGeneratorModule.MigrationGenerator({
      description: '!!!',
      root: tempRoot,
    });

    let caught: Error | undefined;
    try {
      await generator.generate();
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).to.exist;
    expect(caught!.message).to.contain('Cannot derive a migration name');
  });
});
