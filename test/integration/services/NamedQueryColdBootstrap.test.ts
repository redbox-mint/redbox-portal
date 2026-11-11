import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';
import { lifecycleDefinitions } from '../helpers/named-query-lifecycle.fixtures';

/** Two fresh application processes, not a re-import into the suite's warm Sails instance. */
describe('named query cold bootstrap and process restart', function () {
  this.timeout(240_000);
  const database = `named_query_lifecycle_${randomUUID().replace(/-/g, '')}`;
  const storageDatabase = `${database}_storage`;
  let client: MongoClient;
  let root: string;
  let mongoUrl: string;
  let storageUrl: string;
  let coldFinished = false;

  before(async () => {
    const url = new URL(sails.config.datastores.mongodb.url);
    url.pathname = `/${database}`;
    mongoUrl = url.toString();
    url.pathname = `/${storageDatabase}`;
    storageUrl = url.toString();
    client = await MongoClient.connect(mongoUrl);
    assert.deepEqual(await client.db().listCollections().toArray(), [], 'cold database must be empty');
    assert.deepEqual(await client.db(storageDatabase).listCollections().toArray(), [], 'cold storage must be empty');
    root = await fs.mkdtemp(path.resolve('.tmp/named-query-lifecycle-'));
    await fs.mkdir(path.join(root, 'namedqueries'));
    for (const [name, definition] of Object.entries(lifecycleDefinitions())) {
      await fs.writeFile(path.join(root, 'namedqueries', `${name}.json`), JSON.stringify(definition));
    }
  });

  after(async () => {
    if (client) {
      await Promise.all([client.db().dropDatabase(), client.db(storageDatabase).dropDatabase()]);
      await client.close();
    }
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  async function run(phase: 'cold' | 'restart') {
    const log = path.resolve(`.tmp/junit/backend-mocha/named-query-lifecycle-${phase}.log`);
    await fs.mkdir(path.dirname(log), { recursive: true });
    try {
      const result = await promisify(execFile)(
        process.execPath,
        [
          '--no-experimental-strip-types',
          '--require',
          'ts-node/register/transpile-only',
          'test/integration/helpers/named-query-lifecycle.worker.ts',
          phase,
          root,
        ],
        {
          env: {
            ...process.env,
            NAMED_QUERY_LIFECYCLE_MONGO_URL: mongoUrl,
            NAMED_QUERY_LIFECYCLE_STORAGE_URL: storageUrl,
          },
          timeout: 210_000,
          killSignal: 'SIGKILL',
          maxBuffer: 32 * 1024 * 1024,
        }
      );
      await fs.writeFile(log, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(`NAMED_QUERY_LIFECYCLE_${phase.toUpperCase()}_PASS`));
    } catch (error) {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        await fs.writeFile(log, String(error.stdout) + String(error.stderr));
      }
      // Keep child startup/assertion diagnostics in the mounted runner output even
      // though successful teardown removes its isolated database and fixture tree.
      console.error(await fs.readFile(log, 'utf8').catch(() => 'Child did not produce a log.'));
      throw error;
    }
  }

  it('imports form-dependent GraphQL and legacy files on an empty first lift while execution is disabled', async () => {
    await run('cold');
    coldFinished = true;
  });

  it('retains persisted edits, identities and executable saved/direct results in a new process', async () => {
    assert.ok(coldFinished, 'cold phase must pass before restart can be verified');
    await run('restart');
  });
});
