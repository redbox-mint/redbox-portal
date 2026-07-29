let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { createRequire } from 'node:module';

const testRequire = createRequire(import.meta.url);
const migration = testRequire('../../../../api/migrations/20260728T120000-figshare-categories-crosswalk-binding.js');

/**
 * Covers the data migration that moves Figshare crosswalk category resolution off the
 * Categories panel (`categories.resolutionMode` / `sourceVocabularyId` / `crosswalkId`)
 * and onto the categories ValueBinding.
 *
 * The contract: crosswalk-mode configs keep resolving exactly as before, mappingTable-mode
 * configs are untouched apart from losing the dead keys, and a repeated run is a no-op —
 * the presence of a legacy key is the only idempotency signal, so it must hold even if the
 * process died before Umzug logged the previous run.
 */
describe('migration: figshare categories crosswalk binding', function () {
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

  const pathBinding = { kind: 'path', path: 'metadata.forCodes', defaultValue: [] };

  function crosswalkModeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cfg-1',
      configKey: 'figsharePublishing',
      branding: 'brand-1',
      configData: {
        metadata: { categories: { source: { ...pathBinding } } },
        categories: {
          resolutionMode: 'crosswalk',
          sourceVocabularyId: 'vocab-1',
          crosswalkId: 'crosswalk-1',
          mappingTable: [{ sourceCode: '0101', figshareCategoryId: 10 }],
          allowUnmapped: false
        },
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

  it('wraps the existing categories binding as the inner source of a crosswalk binding', async function () {
    const sails = fakeSails([crosswalkModeRow()]);

    await migration.up({ context: sails });

    const written = writtenConfig();
    expect(written.metadata.categories.source).to.deep.equal({
      kind: 'crosswalk',
      source: { kind: 'path', path: 'metadata.forCodes', defaultValue: [] },
      sourceVocabularyId: 'vocab-1',
      crosswalkId: 'crosswalk-1',
      // Exactly preserves the previous behaviour.
      outputs: 'categoryId'
    });
    sinon.assert.calledOnceWithExactly(updateOne, { id: 'cfg-1' });
  });

  it('removes the three legacy keys but preserves mappingTable and allowUnmapped', async function () {
    const sails = fakeSails([crosswalkModeRow()]);

    await migration.up({ context: sails });

    const categories = writtenConfig().categories;
    expect(categories).to.not.have.any.keys('resolutionMode', 'sourceVocabularyId', 'crosswalkId');
    expect(categories.mappingTable).to.deep.equal([{ sourceCode: '0101', figshareCategoryId: 10 }]);
    expect(categories.allowUnmapped).to.equal(false);
  });

  it('strips the legacy keys from a mappingTable config without touching its binding', async function () {
    const row = {
      id: 'cfg-2',
      configKey: 'figsharePublishing',
      configData: {
        metadata: { categories: { source: { ...pathBinding } } },
        categories: {
          resolutionMode: 'mappingTable',
          // Stale ids from a mode the admin switched away from.
          sourceVocabularyId: 'vocab-9',
          crosswalkId: 'crosswalk-9',
          mappingTable: [],
          allowUnmapped: true
        }
      }
    };
    const sails = fakeSails([row]);

    await migration.up({ context: sails });

    const written = writtenConfig();
    expect(written.metadata.categories.source).to.deep.equal(pathBinding);
    expect(written.categories).to.deep.equal({ mappingTable: [], allowUnmapped: true });
  });

  it('treats a config with no legacy keys as already migrated', async function () {
    const sails = fakeSails([{
      id: 'cfg-3',
      configKey: 'figsharePublishing',
      configData: {
        metadata: { categories: { source: { kind: 'crosswalk', source: pathBinding, sourceVocabularyId: 'v', crosswalkId: 'c', outputs: 'categoryId' } } },
        categories: { mappingTable: [], allowUnmapped: true }
      }
    }]);

    await migration.up({ context: sails });

    sinon.assert.notCalled(updateOne);
  });

  it('is a no-op on a second run over the migrated output', async function () {
    const row = crosswalkModeRow();
    let sails = fakeSails([row]);
    await migration.up({ context: sails });
    const afterFirstRun = writtenConfig();

    sails = fakeSails([{ id: 'cfg-1', configKey: 'figsharePublishing', configData: afterFirstRun }]);
    await migration.up({ context: sails });

    sinon.assert.notCalled(updateOne);
  });

  /** An interrupted earlier run can leave the binding wrapped but the keys present. */
  it('does not double-wrap a binding that is already a crosswalk', async function () {
    const alreadyWrapped = {
      kind: 'crosswalk',
      source: { ...pathBinding },
      sourceVocabularyId: 'vocab-1',
      crosswalkId: 'crosswalk-1',
      outputs: 'categoryId'
    };
    const sails = fakeSails([crosswalkModeRow({
      metadata: { categories: { source: alreadyWrapped } }
    })]);

    await migration.up({ context: sails });

    const written = writtenConfig();
    expect(written.metadata.categories.source).to.deep.equal(alreadyWrapped);
    expect(written.categories).to.not.have.any.keys('resolutionMode', 'sourceVocabularyId', 'crosswalkId');
  });

  it('warns and leaves the binding alone when crosswalk mode is incomplete', async function () {
    const sails = fakeSails([{
      id: 'cfg-4',
      configKey: 'figsharePublishing',
      configData: {
        metadata: { categories: { source: { ...pathBinding } } },
        categories: { resolutionMode: 'crosswalk', sourceVocabularyId: 'vocab-1', mappingTable: [], allowUnmapped: true }
      }
    }]);

    await migration.up({ context: sails });

    expect(writtenConfig().metadata.categories.source).to.deep.equal(pathBinding);
    sinon.assert.calledWithMatch(warn, /crosswalk mode was incomplete/);
  });

  it('warns when crosswalk mode has no categories binding to wrap', async function () {
    const sails = fakeSails([{
      id: 'cfg-5',
      configKey: 'figsharePublishing',
      configData: {
        metadata: {},
        categories: {
          resolutionMode: 'crosswalk',
          sourceVocabularyId: 'vocab-1',
          crosswalkId: 'crosswalk-1',
          mappingTable: [],
          allowUnmapped: true
        }
      }
    }]);

    await migration.up({ context: sails });

    sinon.assert.calledWithMatch(warn, /no metadata\.categories\.source/);
    expect(writtenConfig().categories).to.not.have.any.keys('resolutionMode', 'crosswalkId');
  });

  it('skips a config with no categories section at all', async function () {
    const sails = fakeSails([{ id: 'cfg-6', configKey: 'figsharePublishing', configData: { metadata: {} } }]);

    await migration.up({ context: sails });

    sinon.assert.notCalled(updateOne);
  });

  /** Waterline hands back live objects; mutating them in place is not safe. */
  it('does not mutate the row it was given', async function () {
    const row = crosswalkModeRow();
    const sails = fakeSails([row]);

    await migration.up({ context: sails });

    expect(row.configData.categories).to.include({
      resolutionMode: 'crosswalk',
      crosswalkId: 'crosswalk-1'
    });
    expect(row.configData.metadata.categories.source).to.deep.equal(pathBinding);
  });

  it('processes every config and reports the count', async function () {
    const sails = fakeSails([
      crosswalkModeRow(),
      { ...crosswalkModeRow(), id: 'cfg-7' },
      { id: 'cfg-8', configKey: 'figsharePublishing', configData: { categories: { mappingTable: [], allowUnmapped: true } } }
    ]);

    await migration.up({ context: sails });

    expect(updateOne.callCount).to.equal(2);
    sinon.assert.calledWithMatch(info, /updated 2 of 3 figsharePublishing config\(s\)/);
  });

  /** mappingTable configs lose their stale ids, so the reverse is lossy by design. */
  it('declares no down migration', function () {
    expect(migration.down).to.equal(undefined);
    expect(migration.name).to.equal('20260728T120000-figshare-categories-crosswalk-binding');
  });
});
