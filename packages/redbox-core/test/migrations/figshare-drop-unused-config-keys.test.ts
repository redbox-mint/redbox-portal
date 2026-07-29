let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { createRequire } from 'node:module';

const testRequire = createRequire(import.meta.url);
const migration = testRequire('../../../../api/migrations/20260729T060000-figshare-drop-unused-config-keys.js');

/**
 * Covers the data migration that drops the `figsharePublishing` keys no runtime code
 * reads. The contract: every live setting survives untouched, a repeated run is a no-op
 * (key presence is the only idempotency signal), and a customised `record.articleUrlPaths`
 * is carried over to `writeBack.articleUrls` rather than silently lost.
 */
describe('migration: figshare drop unused config keys', function () {
  let setSpy: sinon.SinonSpy;
  let updateOne: sinon.SinonStub;
  let find: sinon.SinonStub;
  let warn: sinon.SinonStub;
  let info: sinon.SinonStub;

  function fakeSails(rows: unknown[]) {
    find = sinon.stub().resolves(rows);
    setSpy = sinon.spy(async () => undefined);
    updateOne = sinon.stub().returns({ set: setSpy });
    warn = sinon.stub();
    info = sinon.stub();
    return {
      models: { appconfig: { find, updateOne } },
      log: { warn, info }
    };
  }

  /** The written configData for a given row id, or undefined when it was not written. */
  function writtenConfig(index = 0): any {
    return setSpy.getCall(index)?.args[0]?.configData;
  }

  function legacyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cfg-1',
      configKey: 'figsharePublishing',
      branding: 'brand-1',
      configData: {
        record: {
          articleIdPath: 'metadata.figshare_article_id',
          articleUrlPaths: ['metadata.figshare_article_location'],
          dataLocationsPath: 'metadata.dataLocations'
        },
        authors: { source: 'defaultRedboxContributors', uniqueBy: 'email', contributorPaths: ['metadata.contributors'] },
        assets: {
          enableHostedFiles: true,
          dedupeStrategy: 'sourceId',
          staging: {
            disk: 'figshare-staging',
            keyPrefix: 'figshare/',
            tempDir: '/tmp/figshare',
            cleanupPolicy: 'retainForRetry',
            diskSpaceThresholdBytes: 1073741824
          }
        },
        embargo: {
          mode: 'recordDriven',
          accessRights: {
            accessRights: { kind: 'path', path: 'metadata.accessRights' },
            fullEmbargoUntil: { kind: 'path', path: 'metadata.embargoUntil' },
            fileEmbargoUntil: { kind: 'path', path: 'metadata.embargoUntil' },
            reason: { kind: 'path', path: 'metadata.embargoReason' }
          }
        },
        workflow: { transitionRules: [{ when: 'published' }], transitionJob: { enabled: true, namedQuery: 'nq' } },
        writeBack: { articleId: 'metadata.figshare_article_id', articleUrls: ['metadata.figshare_article_location'] },
        ...overrides
      }
    };
  }

  afterEach(function () {
    sinon.restore();
  });

  it('only looks at figsharePublishing configs', async function () {
    const sails = fakeSails([]);

    await migration.up({ context: sails });

    sinon.assert.calledOnceWithExactly(find, { configKey: 'figsharePublishing' });
  });

  it('removes every dead key', async function () {
    const sails = fakeSails([legacyRow()]);

    await migration.up({ context: sails });

    const written = writtenConfig();
    expect(written.record).to.not.have.property('articleUrlPaths');
    expect(written.authors).to.not.have.property('source');
    expect(written.assets).to.not.have.property('dedupeStrategy');
    expect(written.assets.staging).to.not.have.any.keys('tempDir', 'diskSpaceThresholdBytes');
    expect(written.embargo.accessRights).to.not.have.property('fileEmbargoUntil');
    expect(written.workflow).to.not.have.property('transitionRules');
    sinon.assert.calledOnceWithExactly(updateOne, { id: 'cfg-1' });
  });

  it('leaves every live setting untouched', async function () {
    const sails = fakeSails([legacyRow()]);

    await migration.up({ context: sails });

    const written = writtenConfig();
    expect(written.record.articleIdPath).to.equal('metadata.figshare_article_id');
    expect(written.record.dataLocationsPath).to.equal('metadata.dataLocations');
    expect(written.authors).to.deep.equal({ uniqueBy: 'email', contributorPaths: ['metadata.contributors'] });
    expect(written.assets.enableHostedFiles).to.equal(true);
    expect(written.assets.staging).to.deep.equal({
      disk: 'figshare-staging',
      keyPrefix: 'figshare/',
      cleanupPolicy: 'retainForRetry'
    });
    expect(written.embargo.accessRights.fullEmbargoUntil).to.deep.equal({ kind: 'path', path: 'metadata.embargoUntil' });
    expect(written.embargo.accessRights.reason).to.deep.equal({ kind: 'path', path: 'metadata.embargoReason' });
    expect(written.workflow.transitionJob).to.deep.equal({ enabled: true, namedQuery: 'nq' });
  });

  /** The dead key was a write target in intent, so a customised value must not vanish. */
  it('carries a customised articleUrlPaths over to a default writeBack.articleUrls', async function () {
    const row = legacyRow();
    row.configData.record.articleUrlPaths = ['metadata.customFigshareUrl'];
    const sails = fakeSails([row]);

    await migration.up({ context: sails });

    expect(writtenConfig().writeBack.articleUrls).to.deep.equal(['metadata.customFigshareUrl']);
  });

  it('keeps an explicit writeBack.articleUrls and warns instead of overwriting it', async function () {
    const row = legacyRow();
    row.configData.record.articleUrlPaths = ['metadata.customFigshareUrl'];
    row.configData.writeBack.articleUrls = ['metadata.chosenFigshareUrl'];
    const sails = fakeSails([row]);

    await migration.up({ context: sails });

    expect(writtenConfig().writeBack.articleUrls).to.deep.equal(['metadata.chosenFigshareUrl']);
    sinon.assert.calledWithMatch(warn, /customised record.articleUrlPaths/);
  });

  it('does not rewrite a config that has already been migrated', async function () {
    const sails = fakeSails([
      {
        id: 'cfg-clean',
        configKey: 'figsharePublishing',
        configData: {
          record: { articleIdPath: 'metadata.figshare_article_id' },
          workflow: { transitionJob: { enabled: false } }
        }
      }
    ]);

    await migration.up({ context: sails });

    sinon.assert.notCalled(updateOne);
  });

  it('tolerates a config missing whole sections', async function () {
    const sails = fakeSails([
      { id: 'cfg-partial', configKey: 'figsharePublishing', configData: { assets: { dedupeStrategy: 'url' } } }
    ]);

    await migration.up({ context: sails });

    expect(writtenConfig().assets).to.deep.equal({});
  });
});
