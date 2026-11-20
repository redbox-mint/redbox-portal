import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { canonical, rawSocketFixture } from './rawSocketFixture';
import { withoutSideEffects } from './noSideEffects';

describe('Selected Companion policy on the production host', function () {
  this.timeout(120000);

  it('refuses the adapter before dispatch when the deployment selects a deny policy', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-denied-'));
    try {
      const f = await rawSocketFixture(true, {
        policyConfiguration: { ...portalHttpPolicies(), CompanionController: { handle: false } },
        companion: {
          enabled: true,
          route: '/imports',
          secret: 'fixture-companion-secret-at-least-32-characters',
          filePath: directory,
          metrics: false,
          server: { host: 'portal.example.invalid', protocol: 'https', path: '/imports' },
          uploadUrls: ['https://uploads.example.invalid/'],
        },
      });
      try {
        const denial = await withoutSideEffects(
          { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
          () =>
            fetch(f.url + '/imports/health', {
              headers: { Authorization: 'Bearer pilot-api-token', Origin: canonical },
            }),
          { sessionCollection: 'pilotSessions' }
        );
        assert.equal(denial.status, 403);
        assert.equal(await denial.text(), '');
      } finally {
        await f.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
