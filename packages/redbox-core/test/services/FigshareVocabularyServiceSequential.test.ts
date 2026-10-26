import { figshareVocabularyInput } from '../helpers/figshareVocabularyInput';
import { createDomainFixture } from './testHelper';
let environment: any;
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { stubVocabularyPersistence } from '../fixtures/vocabulary-stubs';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareVocabularyService';

describe('Figshare vocabulary sequential writes', () => {
  const ctx = { brandId: 'brand', userId: 'user' };
  let service: Services.FigshareVocabularyService;
  let crosswalk: {
    id: string;
    branding: string;
    localVocabulary: string;
    figshareSource: string;
    workingRevision: number;
    status: string;
    approvedRevision?: number;
  };
  let mappings: Array<{ id: string; localEntry: string; figshareCategory: string; status: string }>;
  let order: string[];
  let failMapping: string | undefined;
  let warn: sinon.SinonSpy;
  const failure = new Error('mapping write failed');

  beforeEach(() => {
    stubVocabularyPersistence();

    order = [];
    failMapping = undefined;
    crosswalk = {
      id: 'crosswalk',
      branding: ctx.brandId,
      localVocabulary: 'local',
      figshareSource: 'source',
      workingRevision: 1,
      status: 'draft',
    };
    mappings = [
      { id: 'm1', localEntry: 'entry1', figshareCategory: 'cat1', status: 'proposed' },
      { id: 'm2', localEntry: 'entry2', figshareCategory: 'cat2', status: 'proposed' },
    ];
    warn = sinon.spy();
    environment = createDomainFixture();
    const app = environment;
    app.log.warn = warn;

    Reflect.set(repositoryFixtures, 'Vocabulary', { findOne: async () => ({ id: 'local', name: 'Local' }) });
    Reflect.set(repositoryFixtures, 'VocabularyEntry', {
      findOne: async ({ id }: { id: string }) => (id === 'foreign' ? null : { id, vocabulary: 'local' }),
    });
    Reflect.set(repositoryFixtures, 'FigshareVocabularyCategory', {
      findOne: async ({ id }: { id: string }) => ({ id, source: 'source' }),
      count: async () => 0,
    });
    Reflect.set(repositoryFixtures, 'FigshareVocabularySource', { findOne: async () => ({ id: 'source' }) });
    Reflect.set(repositoryFixtures, 'FigshareVocabularyCrosswalk', {
      findOne: async () => ({ ...crosswalk }),
      updateOne: () => ({
        set: async (patch: object) => {
          order.push('crosswalk');
          Object.assign(crosswalk, patch);
          return { ...crosswalk };
        },
      }),
    });
    Reflect.set(repositoryFixtures, 'FigshareVocabularyCrosswalkMapping', {
      find: async () => mappings.map(row => ({ ...row })),
      count: async () => mappings.length,
      findOne: async () => null,
      create: (values: { localEntry: string; figshareCategory: string; status: string }) => ({
        fetch: async () => {
          const row = { ...values, id: `m${mappings.length + 1}` };
          order.push(row.id);
          mappings.push(row);
          return { ...row };
        },
      }),
      updateOne: ({ id }: { id: string }) => ({
        set: async (patch: object) => {
          order.push(id);
          if (id === failMapping) throw failure;
          const row = mappings.find(candidate => candidate.id === id)!;
          Object.assign(row, patch);
          return { ...row };
        },
      }),
    });
    service = new Services.FigshareVocabularyService(figshareVocabularyInput(environment));
  });

  afterEach(() => {
    sinon.assert.notCalled(warn);
    sinon.restore();
  });

  it('approves mappings in order before publishing the crosswalk revision', async () => {
    const result = await service.approveCrosswalk('crosswalk', 1, ctx);
    assert.deepEqual(order, ['m1', 'm2', 'crosswalk']);
    assert.deepEqual(
      mappings.map(row => row.status),
      ['approved', 'approved']
    );
    assert.equal(result.approvedRevision, 1);
  });

  it('retains an earlier approval when a later mapping write fails', async () => {
    failMapping = 'm2';
    await assert.rejects(service.approveCrosswalk('crosswalk', 1, ctx), error => error === failure);
    assert.deepEqual(order, ['m1', 'm2']);
    assert.deepEqual(
      mappings.map(row => row.status),
      ['approved', 'proposed']
    );
    assert.equal(crosswalk.status, 'draft');
    assert.equal(crosswalk.approvedRevision, undefined);
  });

  it('retains a saved mapping when a later change fails its ownership check', async () => {
    await assert.rejects(
      service.saveMappings(
        'crosswalk',
        {
          revision: 1,
          changes: [
            { op: 'add', localEntryId: 'entry3', figshareCategoryId: 'cat3' },
            { op: 'add', localEntryId: 'foreign', figshareCategoryId: 'cat4' },
          ],
        },
        ctx
      ),
      /local entry does not belong/
    );
    assert.deepEqual(order, ['m3']);
    assert.equal(mappings[2].localEntry, 'entry3');
    assert.equal(crosswalk.workingRevision, 1);
  });

  for (const cleanupFails of [false, true]) {
    it(`preserves clone compensation and the original error (cleanup fails: ${cleanupFails})`, async () => {
      const vocabulary = Reflect.get(repositoryFixtures, 'Vocabulary');
      const entries = Reflect.get(repositoryFixtures, 'VocabularyEntry');
      const categories = Reflect.get(repositoryFixtures, 'FigshareVocabularyCategory');
      const crosswalkModel = Reflect.get(repositoryFixtures, 'FigshareVocabularyCrosswalk');
      Reflect.set(categories, 'find', async () => [{ id: 'cat1', sourceId: 'src1', entry: 'mirror-entry' }]);
      Reflect.set(entries, 'find', async () => [{ id: 'mirror-entry', label: 'Mirrored term' }]);
      Reflect.set(vocabulary, 'create', () => ({
        fetch: async () => {
          order.push('clone');
          return { id: 'clone' };
        },
      }));
      Reflect.set(entries, 'create', () => ({
        fetch: async () => {
          order.push('entry');
          return { id: 'cloned-entry' };
        },
      }));
      Reflect.set(crosswalkModel, 'findOne', async () => null);
      Reflect.set(crosswalkModel, 'create', () => ({
        fetch: async () => {
          order.push('crosswalk-create');
          throw failure;
        },
      }));
      Reflect.set(entries, 'destroy', async (criteria: object) => {
        assert.deepEqual(criteria, { vocabulary: 'clone' });
        order.push('entry-cleanup');
        if (cleanupFails) throw new Error('cleanup failed');
      });
      Reflect.set(vocabulary, 'destroyOne', async (criteria: object) => {
        assert.deepEqual(criteria, { id: 'clone' });
        order.push('clone-cleanup');
      });
      await assert.rejects(service.cloneMirror('source', { name: 'Clone' }, ctx), error => error === failure);
      assert.deepEqual(order, [
        'clone',
        'entry',
        'crosswalk-create',
        'entry-cleanup',
        ...(cleanupFails ? [] : ['clone-cleanup']),
      ]);
    });
  }
});
