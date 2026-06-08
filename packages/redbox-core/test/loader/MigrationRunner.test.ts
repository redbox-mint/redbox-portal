let expect: Chai.ExpectStatic;
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';

import { runPendingMigrations, type RedboxMigration } from '../../src/loader/MigrationRunner';

const fsPromises = fs.promises;

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
        hadOriginalSails = Object.prototype.hasOwnProperty.call(global as any, 'sails');
        originalSails = (global as any).sails;

        await fsPromises.mkdir(sandboxDir, { recursive: true });
        await fsPromises.writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
        process.chdir(sandboxDir);

        (global as any).sails = {
            models: {},
            log: {
                verbose: sinon.stub(),
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
    });

    afterEach(async function () {
        sinon.restore();
        process.chdir(originalCwd);
        if (hadOriginalSails) {
            (global as any).sails = originalSails;
        } else {
            delete (global as any).sails;
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
            destroy: sinon.stub().resolves([])
        };
        (global as any).sails.models.migration = model;
        return { model, created, sort };
    }

    it('should no-op for an empty migration list', async function () {
        await runPendingMigrations([]);
        expect((global as any).sails.models.migration).to.be.undefined;
    });

    it('should execute pending migrations in lexical name order and log each success', async function () {
        const { created } = setMigrationModel();
        const callOrder: string[] = [];
        const migrations: RedboxMigration[] = [
            {
                name: '2026.06.08T10.00.00-second',
                source: 'hook',
                up: sinon.stub().callsFake(async () => callOrder.push('second'))
            },
            {
                name: '2026.06.08T09.00.00-first',
                source: 'app',
                up: sinon.stub().callsFake(async () => callOrder.push('first'))
            }
        ];

        await runPendingMigrations(migrations);

        expect(callOrder).to.deep.equal(['first', 'second']);
        expect(created.map(row => row.name)).to.deep.equal([
            '2026.06.08T09.00.00-first',
            '2026.06.08T10.00.00-second'
        ]);
        expect(created[0].source).to.equal('app');
        expect(created[0].appVersion).to.equal('1.2.3');
        expect(created[0].ranAt).to.be.a('number');
    });

    it('should skip already executed migrations', async function () {
        const { created } = setMigrationModel(['2026.06.08T09.00.00-first']);
        const first = sinon.stub().resolves();
        const second = sinon.stub().resolves();

        await runPendingMigrations([
            { name: '2026.06.08T09.00.00-first', up: first },
            { name: '2026.06.08T10.00.00-second', up: second }
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
                { name: '2026.06.08T10.00.00-second', up: second }
            ]);
        } catch (error) {
            caughtError = error;
        }

        expect((caughtError as { cause?: unknown }).cause).to.equal(failure);
        expect(second.called).to.be.false;
        expect(created).to.deep.equal([]);
    });

    it('should tolerate executed migration names missing from the current migration list', async function () {
        const { created } = setMigrationModel(['2026.06.08T08.00.00-removed']);
        const pending = sinon.stub().resolves();

        await runPendingMigrations([
            { name: '2026.06.08T09.00.00-pending', up: pending }
        ]);

        expect(pending.calledOnce).to.be.true;
        expect(created.map(row => row.name)).to.deep.equal(['2026.06.08T09.00.00-pending']);
    });
});
