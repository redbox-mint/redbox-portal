import assert from 'node:assert/strict';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { resolveFigsharePublishingConfigData } from '../../src/queries/FigshareStatus';
import { resolveFigshareVocabularyConfigData } from '../../src/vocabulary/FigshareConfiguration';

describe('portal Figshare development configuration', () => {
  const env = { REDBOX_SESSION_SECRET: 'fixture-configuration-secret-at-least-32-characters' };
  const fixtures = { article: { id: 'fixture-123' }, categories: [{ id: 1, title: 'Fixture category' }] };
  const development = { enabled: true, mode: 'fixture', fixtures };
  const extensions = (figshareDev: unknown) => ({
    providers: [{ name: 'fixture', root: __dirname, declaration: { apiVersion: 1 as const, config: { figshareDev } } }],
  });

  it('retains fixture data and the production guard for publishing and vocabulary', async () => {
    for (const environment of ['development', 'integrationtest', 'production']) {
      const config = await loadPortalConfiguration({ environment, env, extensions: extensions(development) });
      assert.deepEqual(config.figshareDev, development);
      assert(Object.isFrozen(config.figshareDev.fixtures?.article));
      const brand = { figsharePublishing: { enabled: true, connection: { token: 'fixture-token' } } };
      const expected =
        environment === 'production' ? { mode: 'live', fixtures: undefined } : { mode: 'fixture', fixtures };
      assert.deepEqual(resolveFigsharePublishingConfigData(brand, config.figshareDev, environment)?.runtime, expected);
      assert.deepEqual(resolveFigshareVocabularyConfigData(brand, config.figshareDev, environment)?.runtime, expected);
    }
    assert.equal(Object.isFrozen(fixtures.article), false);
    const defaults = await loadPortalConfiguration({ env });
    assert.equal(defaults.figshareDev.enabled, false);
    assert.equal(defaults.figshareDev.mode, 'live');
  });

  it('rejects malformed fixture settings before resource acquisition', async () => {
    for (const figshareDev of [
      { enabled: 'true', mode: 'fixture' },
      { enabled: true, mode: 'unknown' },
      { enabled: true, mode: 'fixture', fixtures: { categories: 'invalid' } },
      { enabled: true, mode: 'fixture', fixtures: { article: () => ({}) } },
      { enabled: true, mode: 'fixture', unexpected: true },
    ]) {
      await assert.rejects(loadPortalConfiguration({ env, extensions: extensions(figshareDev) }), /figshareDev/);
    }
  });
});
