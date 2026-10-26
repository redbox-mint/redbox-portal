import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { persistenceOperation, persistenceStatus, runAcceptedPersistenceWork } from '../../src/persistence/runtime';
import { Services as Vocab } from '../../src/vocabulary/Vocabulary';
import { Services as Figshare } from '../../src/vocabulary/FigshareVocabulary';

describe('configured vocabulary import ownership', () => {
  for (const kind of ['Figshare', 'RVA settlement timeout', 'RVA early row'] as const)
    it(`retains ${kind} import work and completion admission after its bootstrap wait expires`, async () => {
      const owner = { config: {}, log: nothingLogger };
      const release = Promise.withResolvers<void>();
      let writes = 0, attempts = 0, reads = 0;
      const runAcceptedWork = <T>(operation: () => Promise<T>) => runAcceptedPersistenceWork(owner, operation);
      const finish = async () => {
        attempts++;
        await release.promise;
        return persistenceOperation(owner, async () => { writes++; return { id: 'vocabulary' }; });
      };
      const service = kind === 'Figshare'
        ? new Figshare.FigshareVocabularyService({
          runAcceptedWork, log: nothingLogger, brandName: () => 'default', defaultBrandId: () => 'brand',
          configuration: () => ({}), appConfiguration: () => ({}),
          repository: { getSource: async () => null, getRun: async () => ({ proposals: [] }) },
        } as any)
        : new Vocab.VocabularyService({
          runAcceptedWork, log: nothingLogger, config: {}, getBrand: () => ({ id: 'brand' }),
          defaultBrand: () => ({ id: 'brand' }),
          repository: { getVocabulary: async () => ++reads > 1 && kind === 'RVA early row' ? { id: 'vocabulary' } : null },
          rva: { importRvaVocabulary: finish },
        } as any);
      const manifest = kind === 'Figshare' ? 'figshare-imports.json' : 'rva-imports.json';
      sinon.stub(service as any, 'getBootstrapFileOps').returns({
        readdir: async () => [{ isFile: () => true, name: manifest }],
        readFile: async () => JSON.stringify({ imports: [{ rvaId: '123', scope: 'public', taxonomyId: '123', localCloneName: 'clone' }] }),
      });
      if (kind === 'Figshare') {
        sinon.stub(service as Figshare.FigshareVocabularyService, 'createPreview').callsFake(async () => {
          await finish(); return { runId: 'run', remoteHash: 'hash' } as any;
        });
        sinon.stub(service as Figshare.FigshareVocabularyService, 'applyPreview').resolves({} as any);
      }
      const realTimeout = global.setTimeout;
      const timer = sinon.stub(global, 'setTimeout').callsFake(((fn: (...args: unknown[]) => void, ms: number, ...args: unknown[]) =>
        realTimeout(fn, ms === 30_000 || ms === 120_000 ? 5 : ms === 1000 ? 1 : ms, ...args)) as typeof setTimeout);
      const app = new ApplicationRuntime(owner, [{ name: 'vocabulary', create: () => ({
        initialize: async () => {}, drain: () => service.drain(), close: () => service.close(),
      }) }], { coreBootstrap: [{ name: 'configured-import', run: () => service.bootstrapData() }] });
      try {
        await app.initialize(); timer.restore(); await app.activate();
        assert.equal(attempts, 1);
        assert.equal(persistenceStatus(owner).operations, 1);
        await assert.rejects(app.stop({ deadlineMs: 15 }), /deadline/);
        assert.equal(app.status().cleanupPending, true);
        await assert.rejects(persistenceOperation(owner, async () => {}), /draining/);
        release.resolve(); await app.stop({ deadlineMs: 1000 });
        assert.equal(writes, 1);
        assert.equal(persistenceStatus(owner).operations, 0);
      } finally { timer.restore(); release.resolve(); await app.stop(); sinon.restore(); }
    });
});
