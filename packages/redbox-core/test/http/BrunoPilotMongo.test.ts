import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { pilotFixture } from './pilotFixture';

describe('existing Bruno record-type requests on standalone Mongo HTTP', () => {
  it('runs both correctly targeted collection requests without a Sails host', async () => {
    const fixture = await pilotFixture();
    try {
      const collection = path.resolve('../../test/bruno');
      const result = await promisify(execFile)(
        process.execPath,
        [
          path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
          'run',
          '1 - REST API/5 - Record Type Management/List Record Types.bru',
          '1 - REST API/5 - Record Type Management/Get Record Type.bru',
          '--env',
          'int-test',
          '--env-var',
          'host=' + fixture.url,
          '--env-var',
          'token=pilot-api-token',
          '--reporter-skip-all-headers',
        ],
        { cwd: collection, timeout: 30_000, maxBuffer: 1024 * 1024 }
      );
      console.log(result.stdout);
    } finally {
      await fixture.close();
    }
  });
});
