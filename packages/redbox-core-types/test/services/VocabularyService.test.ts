import { expect } from 'chai';
import * as sinon from 'sinon';
import * as lodash from 'lodash';
import * as fs from 'node:fs/promises';
import { Services as VocabularyServiceModule } from '../../src/services/VocabularyService';
import type { VocabularyAttributes } from '../../src/waterline-models';

type ReaddirResult = Awaited<ReturnType<typeof fs.readdir>>;

type StubbedLogger = {
  error: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

type StubbedSails = {
  log: StubbedLogger;
  config: {
    auth: { defaultBrand: string };
    bootstrap?: { bootstrapDataPath?: string };
    vocab?: { bootstrapRvaImports?: boolean };
  };
  services: Record<string, unknown>;
};

type VocabularyFindChain = {
  sort: (...args: unknown[]) => VocabularyFindChain;
  skip: (...args: unknown[]) => VocabularyFindChain;
  limit: (...args: unknown[]) => Promise<Array<{ id: string; name: string }>>;
};

type VocabularyModelStub = {
  count: (...args: unknown[]) => Promise<number>;
  find: (...args: unknown[]) => VocabularyFindChain;
  findOne: (...args: unknown[]) => Promise<{ id: string; name: string; type: 'flat' } | null>;
  create: (...args: unknown[]) => { fetch: (...args: unknown[]) => Promise<{ id: string }> };
  updateOne: (...args: unknown[]) => { set: (...args: unknown[]) => Promise<{ id: string }> };
  destroyOne: (...args: unknown[]) => Promise<void>;
};

type VocabularyEntryModelStub = {
  count: (...args: unknown[]) => Promise<number>;
  find: (...args: unknown[]) => {
    sort: (...args: unknown[]) => {
      sort: (...args: unknown[]) => {
        skip: (...args: unknown[]) => {
          limit: (...args: unknown[]) => Promise<Array<Record<string, unknown>>>
        }
      }
    }
  };
  destroy: (...args: unknown[]) => Promise<void>;
  findOne: (...args: unknown[]) => Promise<null>;
  create: (...args: unknown[]) => { fetch: (...args: unknown[]) => Promise<{ id: string }> };
  updateOne: (...args: unknown[]) => { set: (...args: unknown[]) => Promise<{ id: string }> };
};

type TestGlobals = typeof globalThis & {
  sails: StubbedSails;
  Vocabulary: VocabularyModelStub;
  VocabularyEntry: VocabularyEntryModelStub;
  BrandingService: { getBrand?: (nameOrId: string) => { id?: string } | null };
};

describe('VocabularyService', () => {
  let service: VocabularyServiceModule.VocabularyService;
  let g: TestGlobals;
  let previousUnderscore: unknown;

  beforeEach(() => {
    g = globalThis as TestGlobals;
    previousUnderscore = Reflect.get(globalThis, '_');
    Reflect.set(globalThis, '_', lodash);
    g.sails = {
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() },
      config: { auth: { defaultBrand: 'default' } },
      services: {
        brandingservice: { getDefault: sinon.stub().returns('default') },
        rvaimportservice: { importRvaVocabulary: sinon.stub().resolves({ id: 'rva-v1' }) }
      }
    };

    g.Vocabulary = {
      count: sinon.stub().resolves(1),
      find: sinon.stub().returns({ sort: sinon.stub().returnsThis(), skip: sinon.stub().returnsThis(), limit: sinon.stub().resolves([{ id: 'v1', name: 'V1' }]) }),
      findOne: sinon.stub().resolves({ id: 'v1', name: 'V1', type: 'flat' }),
      create: sinon.stub().returns({ fetch: sinon.stub().resolves({ id: 'v1' }) }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'v1' }) }),
      destroyOne: sinon.stub().resolves()
    };

    g.VocabularyEntry = {
      count: sinon.stub().resolves(2),
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          sort: sinon.stub().returns({
            skip: sinon.stub().returns({
              limit: sinon.stub().resolves([])
            })
          })
        })
      }),
      destroy: sinon.stub().resolves(),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns({ fetch: sinon.stub().resolves({ id: 'e1' }) }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'e1' }) })
    };

    const entries = [
      { id: 'e1', vocabulary: 'v1', label: 'Parent', value: 'parent', order: 0 },
      { id: 'e2', vocabulary: 'v1', label: 'Child', value: 'child', parent: 'e1', order: 1 }
    ];
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().callsFake(() => ({
        sort: sinon.stub().callsFake(() => ({
          skip: sinon.stub().returns({
            limit: sinon.stub().resolves(entries)
          })
        }))
      }))
    });

    service = new VocabularyServiceModule.VocabularyService();
    g.BrandingService = {
      getBrand: sinon.stub().returns({ id: 'default' })
    };
  });

  afterEach(() => {
    sinon.restore();
    Reflect.deleteProperty(globalThis, 'Vocabulary');
    Reflect.deleteProperty(globalThis, 'VocabularyEntry');
    Reflect.deleteProperty(globalThis, 'BrandingService');
    Reflect.deleteProperty(globalThis, 'sails');
    if (previousUnderscore === undefined) {
      Reflect.deleteProperty(globalThis, '_');
    } else {
      Reflect.set(globalThis, '_', previousUnderscore);
    }
  });

  it('lists vocabularies with pagination metadata', async () => {
    const result = await service.list({ limit: 10, offset: 0 });
    expect(result.meta.limit).to.equal(10);
    expect(result.data).to.have.length(1);
  });

  it('normalizes entries', () => {
    const normalized = service.normalizeEntry({
      id: 'e-normalize',
      label: '  Science ',
      value: ' SCI ',
      identifier: 'science',
      order: 0,
      historical: true
    });
    expect(normalized.label).to.equal('Science');
    expect(normalized.value).to.equal('SCI');
    expect(normalized.historical).to.equal(true);
  });

  it('builds a tree response', async () => {
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().callsFake(() => ({
        sort: sinon.stub().resolves([
          { id: 'e1', vocabulary: 'v1', label: 'Parent', value: 'parent', order: 0 },
          { id: 'e2', vocabulary: 'v1', label: 'Child', value: 'child', parent: 'e1', order: 1 }
        ])
      }))
    }) as unknown as VocabularyEntryModelStub['find'];
    const tree = await service.getTree('v1');
    expect(tree).to.have.length(1);
    expect(tree[0].children).to.have.length(1);
  });

  it('gets vocabulary by id first then slug fallback', async () => {
    const findOne = sinon.stub();
    findOne.onFirstCall().resolves(null);
    findOne.onSecondCall().resolves({ id: 'v1', name: 'Access rights', type: 'flat', slug: 'access-rights' });
    g.Vocabulary.findOne = findOne as unknown as VocabularyModelStub['findOne'];

    const result = await service.getByIdOrSlug('default', 'access-rights');

    expect(result?.id).to.equal('v1');
    expect(findOne.callCount).to.equal(2);
  });

  it('returns null when getByIdOrSlug has no branding or value', async () => {
    const result = await service.getByIdOrSlug('', '');
    expect(result).to.equal(null);
  });

  it('gets entries with metadata and search filter', async () => {
    g.Vocabulary.findOne = sinon.stub().onFirstCall().resolves({ id: 'v1', name: 'Access rights', type: 'flat', slug: 'access-rights', branding: 'default' }) as unknown as VocabularyModelStub['findOne'];
    const countStub = sinon.stub().resolves(2);
    g.VocabularyEntry.count = countStub as unknown as VocabularyEntryModelStub['count'];
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().returns({
        sort: sinon.stub().returns({
          skip: sinon.stub().returns({
            limit: sinon.stub().resolves([
              { id: 'e1', label: 'Open', value: 'open' },
              { id: 'e2', label: 'Closed', value: 'closed' }
            ])
          })
        })
      })
    }) as unknown as VocabularyEntryModelStub['find'];

    const result = await service.getEntries('default', 'access-rights', { search: 'op', limit: 5000, offset: 1 });

    expect(result?.meta.total).to.equal(2);
    expect(result?.meta.limit).to.equal(1000);
    expect(result?.meta.offset).to.equal(1);
    expect(result?.meta.vocabularyId).to.equal('v1');
    expect(countStub.calledOnce).to.equal(true);
  });

  it('returns null from getEntries when vocabulary does not exist', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves(null) as unknown as VocabularyModelStub['findOne'];
    const result = await service.getEntries('default', 'missing');
    expect(result).to.equal(null);
  });

  it('getChildren returns direct root entries and hasChildren metadata', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves({
      id: 'v1', name: 'ANZSRC', type: 'tree', slug: 'anzsrc-2020-for', branding: 'default'
    }) as unknown as VocabularyModelStub['findOne'];
    g.VocabularyEntry.findOne = sinon.stub().resolves(null) as unknown as VocabularyEntryModelStub['findOne'];
    g.VocabularyEntry.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
      if (typeof criteria.parent === 'object' && criteria.parent !== null) {
        return Promise.resolve([
          { id: 'e3', label: 'Pure Mathematics', value: '0101', identifier: '0101', parent: 'e1' }
        ]);
      }
      return {
        sort: sinon.stub().returns({
          sort: sinon.stub().resolves(
            criteria.parent === null
              ? [
                { id: 'e1', label: 'Mathematical Sciences', value: '01', identifier: '01', parent: null },
                { id: 'e2', label: 'Physical Sciences', value: '02', identifier: '02', parent: null }
              ]
              : []
          )
        })
      };
    }) as unknown as VocabularyEntryModelStub['find'];

    const result = await service.getChildren('default', 'anzsrc-2020-for');

    expect(result?.entries).to.have.length(2);
    expect(result?.entries[0].id).to.equal('e1');
    expect(result?.entries[0].hasChildren).to.equal(true);
    expect(result?.entries[1].hasChildren).to.equal(false);
    expect(result?.meta.parentId).to.equal(null);
  });

  it('getChildren returns only direct children for supplied parentId', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves({
      id: 'v1', name: 'ANZSRC', type: 'tree', slug: 'anzsrc-2020-for', branding: 'default'
    }) as unknown as VocabularyModelStub['findOne'];
    g.VocabularyEntry.findOne = sinon.stub().resolves({
      id: 'e1', vocabulary: 'v1', label: 'Mathematical Sciences', value: '01', parent: null
    }) as unknown as VocabularyEntryModelStub['findOne'];
    g.VocabularyEntry.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
      if (typeof criteria.parent === 'object' && criteria.parent !== null) {
        return Promise.resolve([]);
      }
      return {
        sort: sinon.stub().returns({
          sort: sinon.stub().resolves(
            criteria.parent === 'e1'
              ? [
                { id: 'e3', label: 'Pure Mathematics', value: '0101', identifier: '0101', parent: 'e1' },
                { id: 'e4', label: 'Applied Mathematics', value: '0102', identifier: '0102', parent: 'e1' }
              ]
              : []
          )
        })
      };
    }) as unknown as VocabularyEntryModelStub['find'];

    const result = await service.getChildren('default', 'anzsrc-2020-for', 'e1');

    expect(result?.entries).to.have.length(2);
    expect(result?.entries.every((entry) => entry.parent === 'e1')).to.equal(true);
    expect(result?.meta.parentId).to.equal('e1');
  });

  it('getChildren rejects with invalid-parent-id when parent does not belong to vocabulary', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves({
      id: 'v1', name: 'ANZSRC', type: 'tree', slug: 'anzsrc-2020-for', branding: 'default'
    }) as unknown as VocabularyModelStub['findOne'];
    g.VocabularyEntry.findOne = sinon.stub().resolves(null) as unknown as VocabularyEntryModelStub['findOne'];

    let thrown: unknown = null;
    try {
      await service.getChildren('default', 'anzsrc-2020-for', 'missing-parent');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((thrown as Error & { code?: string }).code).to.equal('invalid-parent-id');
  });

  it('getChildren tolerates orphan and cycle-like entries by returning direct rows only', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves({
      id: 'v1', name: 'ANZSRC', type: 'tree', slug: 'anzsrc-2020-for', branding: 'default'
    }) as unknown as VocabularyModelStub['findOne'];
    g.VocabularyEntry.findOne = sinon.stub().resolves({
      id: 'e1', vocabulary: 'v1', label: 'Node A', value: 'A', parent: 'e2'
    }) as unknown as VocabularyEntryModelStub['findOne'];
    g.VocabularyEntry.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
      if (typeof criteria.parent === 'object' && criteria.parent !== null) {
        return Promise.resolve([
          { id: 'e1', label: 'Node A', value: 'A', identifier: 'A', parent: 'e2' }
        ]);
      }
      return {
        sort: sinon.stub().returns({
          sort: sinon.stub().resolves(
            criteria.parent === 'e1'
              ? [
                { id: 'e2', label: 'Node B', value: 'B', identifier: 'B', parent: 'e1' }
              ]
              : []
          )
        })
      };
    }) as unknown as VocabularyEntryModelStub['find'];

    const result = await service.getChildren('default', 'anzsrc-2020-for', 'e1');

    expect(result?.entries).to.have.length(1);
    expect(result?.entries[0].id).to.equal('e2');
    expect(result?.entries[0].hasChildren).to.equal(true);
  });

  it('upserts entries with synthetic parent ids by remapping parents after create', async () => {
    const updateSetStub = sinon.stub().resolves({ id: 'ok' });
    const updateOneStub = sinon.stub().callsFake(() => ({ set: updateSetStub }));
    g.VocabularyEntry.updateOne = updateOneStub as unknown as VocabularyEntryModelStub['updateOne'];

    const createFetchParent = sinon.stub().resolves({ id: 'db-parent' });
    const createFetchChild = sinon.stub().resolves({ id: 'db-child' });
    g.VocabularyEntry.create = sinon.stub()
      .onFirstCall().returns({ fetch: createFetchParent })
      .onSecondCall().returns({ fetch: createFetchChild }) as unknown as VocabularyEntryModelStub['create'];

    g.VocabularyEntry.findOne = sinon.stub().callsFake(async (criteria: Record<string, unknown>) => {
      if (criteria.id === 'db-parent') {
        return { id: 'db-parent', vocabulary: 'v1', parent: null };
      }
      if (criteria.id === 'db-child') {
        return { id: 'db-child', vocabulary: 'v1', parent: 'db-parent' };
      }
      return null;
    }) as unknown as VocabularyEntryModelStub['findOne'];

    const result = await service.upsertEntries('v1', [
      { id: 'root-0', label: 'Parent', value: 'parent', identifier: 'p', order: 0 },
      { id: 'root-0-0', parent: 'root-0', label: 'Child', value: 'child', identifier: 'c', order: 1 }
    ]);

    expect(result.created).to.equal(2);
    expect(result.updated).to.equal(0);
    const setPayloads = updateSetStub.getCalls().map((call) => call.args[0]);
    expect(setPayloads.some((payload) => payload?.parent === 'db-parent')).to.equal(true);
  });

  describe('bootstrapData', () => {
    const stubBootstrapFileOps = (): { readdirStub: sinon.SinonStub; readFileStub: sinon.SinonStub } => {
      const readdirStub = sinon.stub();
      const readFileStub = sinon.stub();
      sinon.stub(
        service as unknown as { getBootstrapFileOps: () => Pick<typeof fs, 'readdir' | 'readFile'> },
        'getBootstrapFileOps'
      ).returns({
        readdir: readdirStub as unknown as typeof fs.readdir,
        readFile: readFileStub as unknown as typeof fs.readFile
      });
      return { readdirStub, readFileStub };
    };

    it('returns without error when bootstrap directory does not exist', async () => {
      const { readdirStub } = stubBootstrapFileOps();
      readdirStub.rejects({ code: 'ENOENT' });
      const createStub = sinon.stub(service, 'create');

      await service.bootstrapData();

      expect(createStub.called).to.equal(false);
      expect((g.sails.log.verbose as sinon.SinonStub).called).to.equal(true);
    });

    it('creates vocabulary from valid local bootstrap json when vocabulary does not exist', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([{ isFile: () => true, name: 'local.json' }] as unknown as ReaddirResult);
      readFileStub.resolves(JSON.stringify({
        name: 'ANZSRC Type of Activity',
        slug: 'anzsrc-toa',
        description: 'desc',
        type: 'flat',
        entries: [{ label: 'A', value: 'a' }]
      }));
      g.Vocabulary.findOne = sinon.stub().resolves(null) as unknown as VocabularyModelStub['findOne'];
      const createStub = sinon.stub(service, 'create').resolves({ id: 'v-created' } as unknown as VocabularyAttributes);

      await service.bootstrapData();

      expect(createStub.calledOnce).to.equal(true);
      const payload = createStub.firstCall.args[0];
      expect(payload.slug).to.equal('anzsrc-toa');
      expect(payload.branding).to.equal('default');
      expect(payload.entries?.length).to.equal(1);
    });

    it('skips creating local vocabulary when slug and branding already exist', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([{ isFile: () => true, name: 'local.json' }] as unknown as ReaddirResult);
      readFileStub.resolves(JSON.stringify({ name: 'Existing', slug: 'existing' }));
      g.Vocabulary.findOne = sinon.stub().resolves({ id: 'existing-id', name: 'Existing', type: 'flat' }) as unknown as VocabularyModelStub['findOne'];
      const createStub = sinon.stub(service, 'create');

      await service.bootstrapData();

      expect(createStub.called).to.equal(false);
    });

    it('continues processing when one file has malformed json', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([
        { isFile: () => true, name: 'a-bad.json' },
        { isFile: () => true, name: 'b-good.json' }
      ] as unknown as ReaddirResult);
      readFileStub
        .onFirstCall().resolves('{invalid json')
        .onSecondCall().resolves(JSON.stringify({ name: 'Good', slug: 'good' }));
      g.Vocabulary.findOne = sinon.stub().resolves(null) as unknown as VocabularyModelStub['findOne'];
      const createStub = sinon.stub(service, 'create').resolves({ id: 'good-id' } as unknown as VocabularyAttributes);

      await service.bootstrapData();

      expect(createStub.calledOnce).to.equal(true);
      expect((g.sails.log.error as sinon.SinonStub).called).to.equal(true);
    });

    it('logs and skips local file when name or slug is missing', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([{ isFile: () => true, name: 'missing-name.json' }] as unknown as ReaddirResult);
      readFileStub.resolves(JSON.stringify({ slug: 'missing-name' }));
      const createStub = sinon.stub(service, 'create');

      await service.bootstrapData();

      expect(createStub.called).to.equal(false);
      expect((g.sails.log.error as sinon.SinonStub).called).to.equal(true);
    });

    it('imports rva vocabularies when missing and skips existing ones', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([{ isFile: () => true, name: 'rva-imports.json' }] as unknown as ReaddirResult);
      readFileStub.resolves(JSON.stringify({
        imports: [{ rvaId: '316' }, { rvaId: '317' }]
      }));
      const findOneStub = sinon.stub();
      findOneStub.onFirstCall().resolves(null);
      findOneStub.onSecondCall().resolves({ id: 'existing-rva', name: 'Existing RVA', type: 'flat' });
      g.Vocabulary.findOne = findOneStub as unknown as VocabularyModelStub['findOne'];
      const importStub = (g.sails.services.rvaimportservice as { importRvaVocabulary: sinon.SinonStub }).importRvaVocabulary;

      await service.bootstrapData();

      expect(importStub.calledOnce).to.equal(true);
      expect(importStub.firstCall.args[0]).to.equal('316');
    });

    it('does not import rva vocabularies when disabled in config', async () => {
      g.sails.config.vocab = { bootstrapRvaImports: false };
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([{ isFile: () => true, name: 'rva-imports.json' }] as unknown as ReaddirResult);
      readFileStub.resolves(JSON.stringify({ imports: [{ rvaId: '316' }] }));
      const importStub = (g.sails.services.rvaimportservice as { importRvaVocabulary: sinon.SinonStub }).importRvaVocabulary;

      await service.bootstrapData();

      expect(importStub.called).to.equal(false);
    });

    it('processes bootstrap files in sorted filename order', async () => {
      const { readdirStub, readFileStub } = stubBootstrapFileOps();
      readdirStub.resolves([
        { isFile: () => true, name: 'z.json' },
        { isFile: () => true, name: 'a.json' },
        { isFile: () => true, name: 'm.json' }
      ] as unknown as ReaddirResult);
      readFileStub
        .onFirstCall().resolves(JSON.stringify({ name: 'A', slug: 'a' }))
        .onSecondCall().resolves(JSON.stringify({ name: 'M', slug: 'm' }))
        .onThirdCall().resolves(JSON.stringify({ name: 'Z', slug: 'z' }));
      g.Vocabulary.findOne = sinon.stub().resolves(null) as unknown as VocabularyModelStub['findOne'];
      sinon.stub(service, 'create').resolves({ id: 'created' } as unknown as VocabularyAttributes);

      await service.bootstrapData();

      const readOrder = readFileStub.getCalls().map((call) => String(call.args[0]).split('/').pop());
      expect(readOrder).to.deep.equal(['a.json', 'm.json', 'z.json']);
    });
  });
});
