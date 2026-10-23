import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { encodeProgress, decodeProgress } from '../../src/persistence/progress/physical';
import { initializeProgressPersistence, getProgressRepositories } from '../../src/persistence/progress/runtime';
import {
  progressCriteria,
  prismaProgressRepositories,
} from '../../src/persistence/progress/PrismaProgressRepositories';
import type { CorePrismaClient } from '../../src/persistence/prisma/client';
import { cleanupPersistence } from '../../src/persistence/runtime';

describe('J1 progress boundaries', () => {
  const brand = '012345678901234567890123';
  it('keeps branding BSON private and preserves zero/null JSON, extension fields and string references', () => {
    const doc = encodeProgress('asynchprogress', {
      name: 'test',
      branding: brand,
      started_by: 'admin',
      metadata: { result: false, nil: null },
      extra: { keep: true },
      relatedRecordId: 'opaque',
    });
    assert(doc.branding instanceof ObjectId);
    assert.equal(doc.currentIdx, 0);
    assert.equal(doc.message, '');
    const row = decodeProgress<Record<string, unknown>>('asynchprogress', { ...doc, _id: new ObjectId() })!;
    assert.equal(row.branding, brand);
    assert.equal(row.relatedRecordId, 'opaque');
    assert.deepEqual(row.extra, { keep: true });
    assert.throws(() => decodeProgress('asynchprogress', { ...doc, _id: new ObjectId(), unsupported: new Date() }));
    assert.throws(() => encodeProgress('asynchprogress', { currentIdx: null }, true));
  });
  it('refuses accessors without invoking them and preserves patch missing fields', () => {
    let called = false;
    const values = Object.defineProperty({}, 'name', {
      enumerable: true,
      get() {
        called = true;
        return 'bad';
      },
    });
    assert.throws(() => encodeProgress('asynchprogress', values));
    assert.equal(called, false);
    const patch = encodeProgress('asynchprogress', { currentIdx: 1 }, true);
    assert.equal(patch.metadata, undefined);
  });
  it('keeps progress filters in the legacy dialect and refuses caller-supplied native regex', () => {
    assert.deepEqual(progressCriteria({ name: { contains: 'a.b' } }), { name: { $regex: 'a\\.b' } });
    assert.throws(() => progressCriteria({ name: { $regex: 'a.*', $options: 'i' } }));
    assert.throws(() => progressCriteria({ name: { $exists: true } }));
    assert.deepEqual(progressCriteria({ currentIdx: { '>=': '4' }, name: 123, metadata: { score: '4' } }), {
      currentIdx: { $gte: 4 },
      name: '123',
      'metadata.score': '4',
    });
    assert.deepEqual(progressCriteria({ currentIdx: null }), { currentIdx: null });
    assert.throws(() => progressCriteria({ currentIdx: { in: ['invalid'] } }));
    for (const field of ['currentIdx.sub', 'name.sub', 'branding.sub'])
      assert.throws(() => progressCriteria({ [field]: 2 }), /Unsupported named-query/);
  });
  it('omits empty text modifiers without discarding their sibling predicates', () => {
    for (const modifier of ['contains', 'startsWith', 'endsWith']) {
      assert.deepEqual(progressCriteria({ name: { [modifier]: '', '>=': 'm', '!=': 'z' } }), {
        name: { $gte: 'm', $ne: 'z' },
      });
      assert.deepEqual(progressCriteria({ 'metadata.number': { [modifier]: '' } }), {});
      assert.throws(() => progressCriteria({ currentIdx: { [modifier]: '', '>=': 2 } }));
    }
  });
  it('refuses trailing progress ordering tokens before executing a query', async () => {
    let executed = false;
    const cursor = {
      where() {
        return this;
      },
      all() {
        return this;
      },
      orderBy() {
        return this;
      },
      async toArray() {
        executed = true;
        return [];
      },
    };
    const repo = prismaProgressRepositories({
      orm: { asynchprogress: cursor, workspaceasync: {} },
    } as unknown as CorePrismaClient);
    for (const directive of ['name ASC garbage', 'currentIdx DESC name ASC']) {
      for (const sort of [directive, [directive]]) {
        await assert.rejects(
          repo.progress.listProgress({ sort }),
          error => error instanceof Error && 'code' in error && error.code === 'progress-query'
        );
        assert.equal(executed, false);
      }
    }
    for (const sort of [42, true, null, new Date(0), () => {}, [42], [null], [[]]]) {
      executed = false;
      await assert.rejects(
        repo.progress.listProgress({ sort }),
        error => error instanceof Error && 'code' in error && error.code === 'progress-query'
      );
      assert.equal(executed, false);
    }
    for (const sort of ['name', 'name asc', 'currentIdx DESC'])
      assert.deepEqual(await repo.progress.listProgress({ sort }), []);
  });

});
