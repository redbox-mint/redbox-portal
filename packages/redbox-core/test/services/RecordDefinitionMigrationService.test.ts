import { strict as assert } from 'node:assert';
import {
  WaterlineRecordDefinitionMigrationReader,
  RecordDefinitionMigrationService,
} from '../../src/services/RecordDefinitionMigrationService';
import type { RuntimeRecord } from '../../src/runtimeValues';
import { seedAuthority } from '../helpers/record-definition-seed-fixture';
import {
  deriveRecordDefinitionId,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionRevisionId,
  hashRecordDefinition,
} from '../../src/record-workflow-administration';

describe('B11 migration recovery', () => {
  const globals = global as any;
  let originals: any;
  let tables: any;
  let failHistory: boolean;
  let loseActivationAck: boolean;
  let service: RecordDefinitionMigrationService;
  let writes: string[];

  beforeEach(() => {
    originals = Object.fromEntries(
      ['RecordType', 'RecordDefinitionRevision', 'RecordDefinitionHistory'].map(name => [name, globals[name]])
    );
    tables = {
      RecordType: [
        { id: 'legacy-a', branding: 'brand-a', key: 'brand-a_dataset', name: 'dataset' },
        { id: 'legacy-b', branding: 'brand-b', key: 'brand-b_dataset', name: 'dataset' },
      ],
      RecordDefinitionRevision: [],
      RecordDefinitionHistory: [],
    };
    writes = [];
    failHistory = false;
    loseActivationAck = false;
    for (const [name, rows] of Object.entries(tables) as any) {
      globals[name] = {
        findOne: (criteria: any) => {
          const result = Promise.resolve(
            structuredClone(
              rows.find((row: any) => Object.entries(criteria).every(([key, value]) => row[key] === value))
            )
          );
          return Object.assign(result, { meta: () => result });
        },
        find: (criteria: any) => {
          const matches = (rows as any[]).filter((row: any) =>
            Object.entries(criteria ?? {}).every(([key, value]) => {
              if (
                value !== null &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                'in' in (value as Record<string, unknown>)
              )
                return ((value as { in: unknown[] }).in ?? []).includes(row[key]);
              return row[key] === value;
            })
          );
          const chain: any = {
            meta: () => chain,
            sort: (spec: string) => {
              const [field, direction] = spec.split(' ');
              matches.sort((left: any, right: any) =>
                direction === 'DESC' ? right[field] - left[field] : left[field] - right[field]
              );
              return chain;
            },
            limit: (maximum: number) => Promise.resolve(structuredClone(matches.slice(0, maximum))),
          };
          return chain;
        },
        create: (entry: any) => ({
          fetch: async () => {
            writes.push(name);
            if (name === 'RecordDefinitionHistory' && failHistory) throw Error('PASSWORD-IN-DRIVER-ERROR');
            if (rows.some((row: any) => row.id === entry.id)) throw Error('duplicate');
            rows.push(structuredClone(entry));
            return structuredClone(entry);
          },
        }),
      };
    }
    globals.RecordType.getDatastore = () => ({
      manager: {
        collection: () => ({
          createIndex: async () => 'index',
          updateOne: async (filter: any, update: any) => {
            writes.push('activate');
            const row = tables.RecordType.find(
              (entry: any) => entry.key === filter.key && !entry.activeRevisionId && (entry.version ?? 0) === 0
            );
            if (row) Object.assign(row, update.$set);
            if (loseActivationAck) throw Error('PASSWORD-IN-DRIVER-ERROR');
            return { modifiedCount: row ? 1 : 0 };
          },
        }),
      },
    });
    service = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async id => [
          {
            name: 'draft',
            recordType: id,
            starting: true,
            config: {
              workflow: { stage: 'draft', stageLabel: id },
              form: 'dataset-form',
              authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
            },
          },
        ],
      },
      seedAuthority
    );
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globals[key];
      else globals[key] = value;
    }
  });

  for (const representation of ['string', 'ObjectId', 'mixed']) {
    it(`enumerates native ${representation} history before initial migration writes with CLI parity`, async () => {
      const { ObjectId } = await import('mongodb');
      const id = '0123456789abcdef01234567';
      tables.RecordType[1].id = id;
      const nativeRows = (representation === 'mixed' ? ['string', 'ObjectId'] : [representation]).map(
        (kind, index) => ({
          id: `rdh_${String(index).repeat(32)}`,
          recordType: kind === 'string' ? id : new ObjectId(id),
          operation: 'publish',
          resultingIdentityVersion: -1 - index,
          actor: { password: 'NATIVE-HISTORY-SECRET' },
        })
      );
      const queries: boolean[] = [];
      globals.RecordDefinitionHistory.find = ({ recordType }: any) => {
        const strings = false;
        let offset = 0;
        const chain = {
          meta: () => chain,
          sort: () => chain,
          skip: (value: number) => {
            offset = value;
            return chain;
          },
          limit: async (maximum: number) => {
            queries.push(strings);
            return nativeRows
              .filter(row => String(row.recordType) === recordType && (typeof row.recordType === 'string') === strings)
              .slice(offset, offset + maximum)
              .map(row => ({ ...row, recordType: String(row.recordType) }));
          },
        };
        return chain;
      };
      let closed = 0;
      globals.RecordDefinitionHistory.getDatastore = () => ({
        manager: {
          collection: () => ({
            find: ({ recordType }: any) => {
              let maximum = 513;
              const cursor = {
                sort: () => cursor,
                limit: (value: number) => {
                  maximum = value;
                  return cursor;
                },
                maxTimeMS: () => cursor,
                batchSize: () => cursor,
                close: async () => {
                  closed++;
                },
                async *[Symbol.asyncIterator]() {
                  queries.push(true);
                  for (const row of nativeRows.filter(row => row.recordType === recordType).slice(0, maximum))
                    yield { ...row, _id: row.id };
                },
              };
              return cursor;
            },
          }),
        },
      });
      const reader = (service as any).reader;
      const nativeReader = new WaterlineRecordDefinitionMigrationReader();
      const recovered = await nativeReader.history({ recordType: id, resultingIdentityVersion: -1 });
      assert.equal(recovered?.id, nativeRows[0].id);
      assert.equal(recovered?.recordType, id);
      const native = new RecordDefinitionMigrationService(
        { ...reader, histories: value => nativeReader.histories(value) },
        seedAuthority
      );
      const cli = new RecordDefinitionMigrationService(
        {
          ...reader,
          histories: async value =>
            nativeRows
              .filter(row => String(row.recordType) === value)
              .map(row => ({ ...row, recordType: String(row.recordType) })),
        },
        seedAuthority
      );
      const before = structuredClone(tables);
      globals.RecordType.getDatastore = () => {
        throw Error('must not reach indexes or activation');
      };
      const errors: string[] = [];
      for (const target of [native, cli]) {
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(run(), error => {
            const message = String(error);
            assert.ok(message.length < 512);
            assert.ok(!message.includes('NATIVE-HISTORY-SECRET'));
            errors.push(message);
            return true;
          });
          assert.deepEqual(writes, []);
          assert.deepEqual(tables, before);
        }
      }
      assert.equal(new Set(errors).size, 1);
      assert.ok(queries.includes(false));
      assert.ok(queries.includes(true));
      assert.equal(closed, 3);
    });
  }

  for (const representation of ['Waterline', 'native', 'mixed']) {
    for (const scenario of [
      'oversized first row',
      'malformed first row',
      'cumulative bytes',
      'row limit',
      'accepted',
    ]) {
      it(`stops ${representation} history reads at ${scenario}`, async () => {
        const id = '0123456789abcdef01234567';
        const count = scenario === 'row limit' ? 513 : 512;
        const makeRow = (index: number): RuntimeRecord => ({
          id: `rdh_${String(index).padStart(32, '0')}`,
          recordType: id,
          note:
            scenario === 'oversized first row' && index === 0
              ? 'SECRET'.repeat(6000)
              : scenario === 'cumulative bytes'
                ? 'é'.repeat(16000)
                : 'accepted',
          ...(scenario === 'malformed first row' && index === 0 ? { forged: 'SECRET' } : {}),
        });
        const waterlineCount = representation === 'native' ? 0 : representation === 'mixed' ? 100 : count;
        let fetched = 0;
        let closed = 0;
        let opened = 0;
        globals.RecordDefinitionHistory.find = () => {
          let offset = 0;
          const chain = {
            meta: () => chain,
            sort: () => chain,
            skip: (value: number) => {
              offset = value;
              return chain;
            },
            limit: async (maximum: number) => {
              const length = Math.min(maximum, Math.max(0, waterlineCount - offset));
              fetched += length;
              return Array.from({ length }, (_, index) => makeRow(offset + index));
            },
          };
          return chain;
        };
        globals.RecordDefinitionHistory.getDatastore = () => ({
          manager: {
            collection: () => ({
              find: () => {
                opened++;
                const cursor = {
                  sort: () => cursor,
                  limit: (maximum: number) => {
                    assert.equal(maximum, 513 - waterlineCount);
                    return cursor;
                  },
                  maxTimeMS: () => cursor,
                  batchSize: (size: number) => {
                    assert.equal(size, 1);
                    return cursor;
                  },
                  close: async () => {
                    closed++;
                  },
                  async *[Symbol.asyncIterator]() {
                    for (let index = waterlineCount; index < count; index++) {
                      fetched++;
                      const { id: rowId, ...row } = makeRow(index);
                      yield { ...row, _id: rowId };
                    }
                  },
                };
                return cursor;
              },
            }),
          },
        });
        globals.RecordType.getDatastore = () => {
          throw Error('must not reach indexes or activation');
        };
        const reader = new WaterlineRecordDefinitionMigrationReader();
        const before = structuredClone(tables);
        if (scenario === 'accepted') {
          assert.deepEqual(
            await reader.histories(id),
            Array.from({ length: count }, (_, index) => makeRow(index))
          );
        } else {
          const code =
            scenario === 'cumulative bytes'
              ? 'database-byte-limit'
              : scenario === 'row limit'
                ? 'database-row-limit'
                : scenario === 'malformed first row'
                  ? 'invalid-history-property'
                  : 'unsafe-or-unbounded-data';
          await assert.rejects(reader.histories(id), error => {
            assert.ok(String(error).includes(code));
            assert.ok(String(error).length < 512);
            assert.ok(!String(error).includes('SECRET'));
            return true;
          });
        }
        const expected =
          scenario === 'cumulative bytes'
            ? Math.floor(8_000_000 / Buffer.byteLength(JSON.stringify(makeRow(0)), 'utf8')) + 1
            : scenario === 'oversized first row' || scenario === 'malformed first row'
              ? 1
              : count;
        assert.equal(fetched, expected);
        assert.equal(closed, opened);
        assert.equal(
          opened,
          representation === 'native' ||
            (representation === 'mixed' && expected > waterlineCount) ||
            scenario === 'accepted'
            ? 1
            : 0
        );
        assert.deepEqual(writes, []);
        assert.deepEqual(tables, before);
      });
    }
  }

  it('preflight performs no writes and matches migration hashes and counts', async () => {
    const before = structuredClone(tables);
    const report = await service.preflight();
    assert.deepEqual(tables, before);
    assert.deepEqual(writes, []);
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(writes, [
      'RecordDefinitionRevision',
      'RecordDefinitionHistory',
      'activate',
      'RecordDefinitionRevision',
      'RecordDefinitionHistory',
      'activate',
    ]);
    assert.deepEqual(
      tables.RecordDefinitionRevision.map((row: any) => row.canonicalHash),
      report.entries.map(entry => entry.canonicalHash)
    );
    assert.ok(
      tables.RecordDefinitionHistory.every(
        (row: any) => row.operation === 'migration' && row.validation.scope === 'migration'
      )
    );
    const after = structuredClone(tables);
    writes.length = 0;
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(tables, after);
    assert.deepEqual(writes, []);
  });

  for (const retirement of [
    {},
    { retiredAt: null },
    { retiredBy: null, retirementReason: null },
    { retiredAt: null, retiredBy: null, retirementReason: '' },
  ]) {
    it(`preserves cleared legacy retirement metadata ${JSON.stringify(retirement)}`, async () => {
      Object.assign(tables.RecordType[1], retirement);
      const report = await service.preflight();
      assert.deepEqual(writes, []);
      assert.deepEqual(await service.migrate(), report);
      for (const [key, value] of Object.entries(retirement)) assert.deepEqual(tables.RecordType[1][key], value);
      assert.deepEqual(await service.preflight(), report);
    });
  }

  it('rejects malformed legacy retirement before indexes, artifacts or activation across the whole batch', async () => {
    const secret = 'LEGACY-RETIREMENT-SECRET';
    const retired = { retiredAt: '2026-09-05T00:00:00.000Z', retiredBy: { id: 'admin' } };
    const cases: RuntimeRecord[] = [
      { retiredAt: null, retiredBy: { id: secret }, retirementReason: { secret } },
      { retiredBy: { id: secret } },
      { retirementReason: secret },
      { retiredAt: retired.retiredAt },
      { ...retired, retiredBy: null },
      { ...retired, retiredBy: { id: '' } },
      { ...retired, retiredBy: { id: 'admin', displayName: { secret } } },
      { ...retired, retirementReason: 'x'.repeat(4097) },
    ];
    for (const value of [false, true, {}, { secret }, 42, [], [secret]]) {
      cases.push(
        { retiredAt: value },
        { retiredBy: value },
        { retirementReason: value },
        { ...retired, retiredBy: value },
        { ...retired, retirementReason: value }
      );
    }
    for (const value of ['', secret, '2026-02-30T00:00:00.000Z', '2026-09-05', '2026-09-05T25:00:00Z'])
      cases.push({ ...retired, retiredAt: value });
    const original = structuredClone(tables.RecordType[1]);
    let datastoreReads = 0;
    globals.RecordType.getDatastore = () => {
      datastoreReads++;
      throw Error('must not access indexes or activation');
    };
    for (const retirement of cases) {
      // The second legacy brand is adversarial: even the valid first brand must remain unwritten.
      tables.RecordType[1] = { ...original, ...retirement };
      const before = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-retirement|invalid-artifact-timestamp/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(tables, before);
        assert.deepEqual(writes, []);
        assert.equal(datastoreReads, 0);
      }
      assert.equal(messages[0], messages[1]);
    }
  });

  it('validates legitimate retired legacy metadata but preserves the quiescence guard', async () => {
    for (const retiredAt of ['2026-09-05T00:00:00.000Z', new Date('2026-09-05T00:00:00.000Z')]) {
      for (const reason of [
        {},
        { retirementReason: null },
        { retirementReason: '' },
        { retirementReason: 'Retired' },
      ]) {
        Object.assign(tables.RecordType[1], { retiredAt, retiredBy: { id: 'admin' } }, reason);
        await assert.rejects(service.preflight(), /identity-is-not-quiescent/);
        await assert.rejects(service.migrate(), /identity-is-not-quiescent/);
      }
    }
    assert.deepEqual(writes, []);
  });

  it('recovers after history failure before activation and after lost activation acknowledgement', async () => {
    failHistory = true;
    await assert.rejects(service.migrate(), /history-write-unconfirmed/);
    assert.equal(tables.RecordDefinitionRevision.length, 1);
    assert.equal(tables.RecordType[0].activeRevisionId, undefined);
    failHistory = false;
    loseActivationAck = true;
    await service.migrate();
    assert.equal(tables.RecordDefinitionRevision.length, 2);
    assert.equal(tables.RecordDefinitionHistory.length, 2);
    assert.ok(tables.RecordType.every((row: any) => row.activeRevisionId));
  });

  it('rejects corrupt orphan artifacts instead of adopting them', async () => {
    failHistory = true;
    await assert.rejects(service.migrate());
    tables.RecordDefinitionRevision[0].createdBy.id = 'attacker';
    failHistory = false;
    await assert.rejects(service.migrate(), /conflicting-migration-revision/);
    assert.equal(tables.RecordType[0].activeRevisionId, undefined);
  });

  for (const field of ['publishedAt', 'occurredAt']) {
    for (const value of [null, 0, false, {}, [], 'not-a-date', new Date(NaN)]) {
      it(`rejects non-contract ${field} on retry in preflight and migration: ${String(value)}`, async () => {
        await service.migrate();
        const artifact =
          field === 'publishedAt' ? tables.RecordDefinitionRevision[0] : tables.RecordDefinitionHistory[0];
        artifact[field] = value;
        writes.length = 0;
        await assert.rejects(service.preflight());
        await assert.rejects(service.migrate());
        assert.deepEqual(writes, []);
      });
    }
  }

  for (const mutate of [
    (t: any) => {
      t.RecordType[0].activeRevisionId = 'invalid';
    },
    (t: any) => {
      t.RecordType[0].version = -1;
    },
    (t: any) => {
      t.RecordType[0].activeRevisionNumber = 999;
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].source.operation = 'invalid';
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].source.sourceRevisionNumber = -1;
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].definition = {};
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].canonicalHash = 'sha256:' + '0'.repeat(64);
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].actionContracts = [{}];
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].createdBy = { id: 'corrupt' };
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].expectedIdentityVersion = -1;
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].actor = { id: 'corrupt' };
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].validation = {};
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].source.operation = 'invalid';
    },
    (t: any) => {
      t.RecordDefinitionHistory.length = 0;
    },
    (t: any) => {
      t.RecordType[0].draftId = {};
    },
    (t: any) => {
      t.RecordType[0].definitionLifecycleOperation = {};
    },
  ]) {
    it(`fails closed on managed state corruption ${mutate.toString()}`, async () => {
      await service.migrate();
      mutate(tables);
      writes.length = 0;
      await assert.rejects(service.preflight());
      await assert.rejects(service.migrate());
      assert.deepEqual(writes, []);
    });
  }

  function makePublished(): void {
    for (const revision of tables.RecordDefinitionRevision) revision.source.operation = 'publish';
    for (const history of tables.RecordDefinitionHistory) {
      history.source.operation = 'publish';
      history.operation = 'publish';
      history.operationId =
        history.branding === 'brand-a'
          ? '11111111-1111-4111-8111-111111111111'
          : '22222222-2222-4222-8222-222222222222';
      history.id = `rdh_${history.operationId.replace(/-/g, '')}`;
      history.expectedDraftVersion = 0;
      history.validation.scope = 'publication';
      delete history.note;
    }
  }

  it('preserves validated administrative publications without reinterpreting legacy hooks', async () => {
    await service.migrate();
    makePublished();
    tables.RecordType[0].hooks = { onCreate: { pre: [{ function: 'INVALID-LEGACY' }] } };
    writes.length = 0;
    const report = await service.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(writes, []);
  });

  for (const mutate of [
    (t: any) => {
      t.RecordType[0].activeRevisionNumber = 999;
    },
    (t: any) => {
      t.RecordType[0].version = -1;
    },
    (t: any) => {
      t.RecordType[0].retiredBy = { id: 'corrupt' };
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].id = 'invalid';
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].definition = {};
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].source.operation = 'invalid';
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].source.sourceRevisionNumber = 1;
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].canonicalHash = 'sha256:' + '0'.repeat(64);
    },
    (t: any) => {
      t.RecordDefinitionRevision[0].actionContracts = [{ actionId: 'core.email.send', contractVersion: 1 }];
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].expectedActiveRevisionNumber = 999;
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].expectedDraftVersion = -1;
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].actor = { id: 'corrupt' };
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].occurredAt = null;
    },
    (t: any) => {
      t.RecordDefinitionHistory[0].changes = [];
    },
    (t: any) => {
      t.RecordType[0].recordCreationFence = {};
    },
  ]) {
    it(`does not skip corrupt administrative state ${mutate.toString()}`, async () => {
      await service.migrate();
      makePublished();
      mutate(tables);
      writes.length = 0;
      await assert.rejects(service.preflight());
      await assert.rejects(service.migrate());
      assert.deepEqual(writes, []);
    });
  }

  it('permits quiescent mutable identity-version advances without fabricated publication history', async () => {
    await service.migrate();
    makePublished();
    tables.RecordType[0].version = 2;
    const report = await service.preflight();
    assert.equal(report.skipped, 2);
  });

  it('accepts native Date event times without invoking serialization overrides', async () => {
    await service.migrate();
    for (const revision of tables.RecordDefinitionRevision) revision.publishedAt = new Date(revision.publishedAt);
    for (const history of tables.RecordDefinitionHistory) history.occurredAt = new Date(history.occurredAt);
    writes.length = 0;
    await service.preflight();
    await service.migrate();
    assert.deepEqual(writes, []);
  });

  for (const field of ['publishedAt', 'occurredAt']) {
    it(`rejects null ${field} on immutable reuse before activation, including epoch history`, async () => {
      await service.migrate();
      Object.assign(tables.RecordType[0], { activeRevisionId: null, activeRevisionNumber: null, version: 0 });
      tables.RecordDefinitionRevision[0].publishedAt = '1970-01-01T00:00:00.000Z';
      tables.RecordDefinitionHistory[0].occurredAt = '1970-01-01T00:00:00.000Z';
      const artifact = field === 'publishedAt' ? tables.RecordDefinitionRevision[0] : tables.RecordDefinitionHistory[0];
      artifact[field] = null;
      writes.length = 0;
      await assert.rejects(service.preflight());
      await assert.rejects(service.migrate());
      assert.deepEqual(writes, []);
    });
  }

  it('rejects an occupied revision-number slot with a noncanonical ID during preparation', async () => {
    failHistory = true;
    await assert.rejects(service.migrate());
    tables.RecordDefinitionRevision[0].id = 'invalid';
    writes.length = 0;
    await assert.rejects(service.preflight(), /conflicting-migration-revision/);
    await assert.rejects(service.migrate(), /conflicting-migration-revision/);
    assert.deepEqual(writes, []);
  });

  for (const malformed of [false, true]) {
    it(`rejects an occupied operationId slot before all writes (malformed=${malformed})`, async () => {
      const operationId = `rdh_${deriveRecordDefinitionId({ brandId: 'brand-b', recordTypeKey: 'dataset' }).slice(4)}`;
      tables.RecordDefinitionHistory.push({
        id: 'rdh_' + 'a'.repeat(32),
        operationId,
        recordType: 'different-identity',
        resultingIdentityVersion: 9,
        ...(malformed ? { occurredAt: { password: 'SECRET' } } : {}),
      });
      globals.RecordType.getDatastore = () => {
        writes.push('index-access');
        throw Error('must not reach writes');
      };
      const before = structuredClone(tables);
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => /conflicting-migration-history/.test(String(error)) && !String(error).includes('SECRET')
        );
      }
      assert.deepEqual(tables, before);
      assert.deepEqual(writes, []);
    });
  }

  for (const operation of ['publish', 'rollback']) {
    for (const advanced of [false, true]) {
      it(`requires canonical ${operation} history ID on managed skip (advanced=${advanced})`, async () => {
        await service.migrate();
        makePublished();
        const row = tables.RecordType[0];
        const revision = tables.RecordDefinitionRevision[0];
        const history = tables.RecordDefinitionHistory[0];
        if (operation === 'rollback') {
          const id = deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, 2);
          const operationId = '55555555-5555-4555-8555-555555555555';
          const rev1Revision = structuredClone(revision);
          const rev1History = structuredClone(history);
          Object.assign(row, { activeRevisionId: id, activeRevisionNumber: 2, version: 2 });
          tables.RecordDefinitionRevision.push({
            ...rev1Revision,
            id,
            revisionNumber: 2,
            source: { operation, sourceRevisionNumber: 1 },
          });
          tables.RecordDefinitionHistory.push({
            ...rev1History,
            id: `rdh_${operationId.replace(/-/g, '')}`,
            operationId,
            revision: id,
            revisionNumber: 2,
            operation,
            source: { operation, sourceRevisionNumber: 1 },
            expectedIdentityVersion: 1,
            resultingIdentityVersion: 2,
            expectedDraftVersion: null,
            expectedActiveRevisionNumber: 1,
            validation: {
              ...rev1History.validation,
              scope: 'rollback',
              validatedDraftVersion: 0,
              validatedActiveRevisionNumber: 1,
            },
            impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: 1 },
          });
        }
        if (advanced) row.version++;
        assert.equal((await service.preflight()).skipped, 2);
        const forged =
          operation === 'rollback'
            ? tables.RecordDefinitionHistory[tables.RecordDefinitionHistory.length - 1]
            : history;
        forged.id = 'rdh_' + 'f'.repeat(32);
        writes.length = 0;
        await assert.rejects(service.preflight(), /invalid-active-provenance/);
        await assert.rejects(service.migrate(), /invalid-active-provenance/);
        assert.deepEqual(writes, []);
      });
    }
  }

  it('detects conflicting orphan provenance during read-only preparation', async () => {
    failHistory = true;
    await assert.rejects(service.migrate());
    tables.RecordDefinitionRevision[0].publishedBy.id = 'SECRET';
    writes.length = 0;
    const errors: string[] = [];
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), error => {
        errors.push(String(error));
        return !String(error).includes('SECRET');
      });
    }
    assert.equal(errors[0], errors[1]);
    assert.match(errors[0], /conflicting-migration-revision/);
    assert.deepEqual(writes, []);
  });

  for (const kind of [
    'prototype',
    'non-enumerable',
    'getter',
    'proxy',
    'function',
    'metadata-getter',
    'hidden-function',
    'date-serializer',
    'undefined-property',
  ]) {
    it(`rejects original service row ${kind} without executing it`, async () => {
      let invoked = 0;
      const row = { ...tables.RecordType[0] };
      const trap = () => {
        invoked++;
        throw Error('SECRET');
      };
      let unsafe = row;
      if (kind === 'prototype') Object.setPrototypeOf(row, { inherited: true });
      if (kind === 'non-enumerable') Object.defineProperty(row, 'searchable', { value: true });
      if (kind === 'getter') Object.defineProperty(row, 'searchable', { get: trap, enumerable: true });
      if (kind === 'metadata-getter') Object.defineProperty(row, 'createdAt', { get: trap, enumerable: true });
      if (kind === 'proxy') unsafe = new Proxy(row, { getPrototypeOf: trap, ownKeys: trap, get: trap });
      if (kind === 'function') row.searchCore = trap;
      if (kind === 'undefined-property') row.searchCore = undefined;
      if (kind === 'hidden-function') Object.defineProperty(row, 'toJSON', { value: trap });
      if (kind === 'date-serializer') {
        row.createdAt = new Date();
        row.createdAt.toJSON = trap;
      }
      const hostile = new RecordDefinitionMigrationService(
        {
          recordTypes: async () => [unsafe],
          workflowSteps: async () => [],
        },
        seedAuthority
      );
      await assert.rejects(hostile.preflight());
      await assert.rejects(hostile.migrate());
      assert.equal(invoked, 0);
      assert.deepEqual(writes, []);
    });
  }

  it('validates activation confirmation descriptors before reading their values', async () => {
    let invoked = 0;
    const findOne = globals.RecordType.findOne;
    globals.RecordType.findOne = (criteria: any) => {
      const result = findOne(criteria).then((row: any) => {
        Object.defineProperty(row, 'version', {
          enumerable: true,
          get: () => {
            invoked++;
            throw Error('SECRET');
          },
        });
        return row;
      });
      return Object.assign(result, { meta: () => result });
    };
    await assert.rejects(service.migrate(), /unsafe-storage-property/);
    assert.equal(invoked, 0);
  });

  it('bounds reader and driver failures identically without exposing their messages', async () => {
    const failing = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => {
          throw Error('PASSWORD-IN-DRIVER-ERROR');
        },
        workflowSteps: async () => [],
      },
      seedAuthority
    );
    for (const run of [() => failing.preflight(), () => failing.migrate()]) {
      await assert.rejects(
        run(),
        error => /migration-operation-failed/.test(String(error)) && !String(error).includes('PASSWORD')
      );
    }
    assert.deepEqual(writes, []);
  });

  it('validates the entire multi-brand batch before writing', async () => {
    tables.RecordType[1].hooks = { onCreate: { pre: [{ function: 'PASSWORD-SECRET' }] } };
    await assert.rejects(service.migrate(), error => !String(error).includes('PASSWORD-SECRET'));
    assert.deepEqual(writes, []);
  });

  it('preserves an existing managed incomplete draft without interpreting it as legacy data', async () => {
    const row = {
      ...tables.RecordType[0],
      draftId: deriveRecordDefinitionDraftId({ brandId: 'brand-a', recordTypeKey: 'dataset' }),
      version: 0,
      schemaVersion: 1,
    };
    const definitionId = deriveRecordDefinitionId({ brandId: row.branding, recordTypeKey: row.name });
    row.definitionId = definitionId;
    const draft: any = {
      id: row.draftId,
      schemaVersion: 1,
      version: 0,
      baseRevisionId: null,
      baseRevisionNumber: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
      createdBy: { id: 'admin' },
      updatedBy: { id: 'admin' },
      validation: null,
      recordType: row.id,
      branding: row.branding,
      recordTypeId: definitionId,
      recordTypeKey: row.name,
      definition: {
        schemaVersion: 1,
        definitionState: 'draft-incomplete',
        recordType: {},
        stages: [],
        transitions: [],
        actionBindings: [],
      },
    };
    const managed = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => [row],
        workflowSteps: async () => {
          throw Error('must not read legacy steps');
        },
        draft: async () => draft,
      },
      seedAuthority
    );
    const report = await managed.migrate();
    assert.equal(report.identities, 0);
    assert.equal(report.skipped, 1);
    assert.deepEqual(writes, []);
    for (const retirement of [
      {},
      { retiredAt: null, retiredBy: null, retirementReason: '' },
      { retiredAt: '2026-09-05T00:00:00.000Z', retiredBy: { id: 'admin' }, retirementReason: 'Retired' },
    ]) {
      Object.assign(row, retirement);
      assert.equal((await managed.preflight()).skipped, 1);
      assert.equal((await managed.migrate()).skipped, 1);
    }
    for (const field of ['retiredAt', 'retiredBy', 'retirementReason']) {
      for (const value of [false, {}, 42, [], 'invalid', null]) {
        Object.assign(row, { retiredAt: null, retiredBy: null, retirementReason: null });
        if (field === 'retiredAt') row.retiredBy = { id: 'admin' };
        if (field === 'retiredBy') row.retiredAt = '2026-09-05T00:00:00.000Z';
        if (field === 'retirementReason' && value === null) row.retiredBy = { id: 'admin' };
        row[field] = value;
        await assert.rejects(managed.preflight());
        await assert.rejects(managed.migrate());
      }
    }
    for (const value of [false, {}, 42, [], 'x'.repeat(4097)]) {
      Object.assign(row, {
        retiredAt: '2026-09-05T00:00:00.000Z',
        retiredBy: { id: 'admin' },
        retirementReason: value,
      });
      await assert.rejects(managed.preflight());
      await assert.rejects(managed.migrate());
    }
    Object.assign(row, { retiredAt: null, retiredBy: null, retirementReason: null });
    for (const [key, value] of [
      ['id', 'invalid'],
      ['version', -1],
      ['baseRevisionNumber', 999],
      ['updatedAt', null],
      ['createdBy', {}],
      ['validation', {}],
      ['lifecycleOperationToken', 'pending'],
    ]) {
      const before = draft[key as string];
      draft[key as string] = value;
      await assert.rejects(managed.preflight());
      await assert.rejects(managed.migrate());
      if (before === undefined) delete draft[key as string];
      else draft[key as string] = before;
    }
    assert.deepEqual(writes, []);
  });

  it('accepts a clone-publish retained null draft base on managed skip', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const definitionId = deriveRecordDefinitionId({ brandId: row.branding, recordTypeKey: row.name });
    row.definitionId = definitionId;
    const draftId = deriveRecordDefinitionDraftId({ brandId: row.branding, recordTypeKey: row.name });
    // B04 clone creates the draft with a null base and B05 publication retains
    // it: the published cloned identity keeps active revision 1 with a null
    // draft base. Both entry points must skip rather than reject.
    const draft: any = {
      id: draftId,
      schemaVersion: 1,
      version: 0,
      baseRevisionId: null,
      baseRevisionNumber: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
      createdBy: { id: 'admin' },
      updatedBy: { id: 'admin' },
      validation: null,
      recordType: row.id,
      branding: row.branding,
      recordTypeId: definitionId,
      recordTypeKey: row.name,
      definition: {
        schemaVersion: 1,
        definitionState: 'draft-incomplete',
        recordType: {},
        stages: [],
        transitions: [],
        actionBindings: [],
      },
    };
    Object.assign(row, { draftId, schemaVersion: 1 });
    const cloned = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async () => {
          throw Error('must not read legacy steps for managed identities');
        },
        draft: async () => structuredClone(draft),
      },
      seedAuthority
    );
    writes.length = 0;
    const report = await cloned.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await cloned.migrate(), report);
    assert.deepEqual(writes, []);
    // A historical base at or before the active revision is equally valid.
    draft.baseRevisionId = row.activeRevisionId;
    draft.baseRevisionNumber = 1;
    writes.length = 0;
    assert.equal((await cloned.preflight()).skipped, 2);
    assert.deepEqual(await cloned.migrate(), await cloned.preflight());
    assert.deepEqual(writes, []);
    // Future, mismatched and orphan bases still fail closed with zero writes.
    const validBaseId = draft.baseRevisionId;
    for (const [key, value] of [
      ['baseRevisionNumber', 999],
      ['baseRevisionNumber', 0],
      ['baseRevisionId', 'invalid'],
    ] as const) {
      const before = draft[key as string];
      draft[key as string] = value;
      writes.length = 0;
      await assert.rejects(cloned.preflight(), /invalid-managed-draft/);
      await assert.rejects(cloned.migrate(), /invalid-managed-draft/);
      assert.deepEqual(writes, []);
      draft[key as string] = before;
    }
    draft.baseRevisionId = validBaseId;
    draft.baseRevisionNumber = null;
    writes.length = 0;
    await assert.rejects(cloned.preflight(), /invalid-managed-draft/);
    await assert.rejects(cloned.migrate(), /invalid-managed-draft/);
    assert.deepEqual(writes, []);
  });

  it('accepts retained-base draft saves with independently bound report active revisions', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const definitionId = deriveRecordDefinitionId({ brandId: row.branding, recordTypeKey: row.name });
    row.definitionId = definitionId;
    const draftId = deriveRecordDefinitionDraftId({ brandId: row.branding, recordTypeKey: row.name });
    // B04 clone creates the draft with a null base, B05 publish retains it and
    // the subsequent B04 save stamps its validation report from the current
    // active revision: draft version 1, null base, validatedActiveRevisionNumber 1.
    const reportFor = (validatedDraftVersion: number, validatedActiveRevisionNumber: any) => ({
      schemaVersion: 1,
      brandId: row.branding,
      recordTypeKey: row.name,
      scope: 'draft-save',
      status: 'valid',
      definitionState: 'draft-incomplete',
      validatedDraftVersion,
      validatedActiveRevisionNumber,
      issues: [],
      redactions: [],
      truncated: false,
    });
    const draft: any = {
      id: draftId,
      schemaVersion: 1,
      version: 1,
      baseRevisionId: null,
      baseRevisionNumber: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
      createdBy: { id: 'admin' },
      updatedBy: { id: 'admin' },
      validation: reportFor(1, 1),
      recordType: row.id,
      branding: row.branding,
      recordTypeId: definitionId,
      recordTypeKey: row.name,
      definition: {
        schemaVersion: 1,
        definitionState: 'draft-incomplete',
        recordType: {},
        stages: [],
        transitions: [],
        actionBindings: [],
      },
    };
    // The save advances the identity version past the publication history.
    Object.assign(row, { draftId, schemaVersion: 1, version: 2 });
    const saved = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async () => {
          throw Error('must not read legacy steps for managed identities');
        },
        draft: async () => structuredClone(draft),
      },
      seedAuthority
    );
    writes.length = 0;
    const report = await saved.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await saved.migrate(), report);
    assert.deepEqual(writes, []);
    // An untouched clone-time report referencing no active revision is equally
    // valid alongside the same null base.
    draft.validation = reportFor(1, null);
    writes.length = 0;
    assert.equal((await saved.preflight()).skipped, 2);
    assert.deepEqual(await saved.migrate(), await saved.preflight());
    assert.deepEqual(writes, []);
    draft.validation = reportFor(1, 1);
    // A historical base with the same independently bound report is equally valid.
    draft.baseRevisionId = row.activeRevisionId;
    draft.baseRevisionNumber = 1;
    writes.length = 0;
    assert.equal((await saved.preflight()).skipped, 2);
    assert.deepEqual(await saved.migrate(), await saved.preflight());
    assert.deepEqual(writes, []);
    // A rollback save binds its report to the rollback revision, not the base.
    const rollbackId = deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, 2);
    const rollbackOperationId = '44444444-4444-4444-8444-444444444444';
    Object.assign(row, { activeRevisionId: rollbackId, activeRevisionNumber: 2, version: 3 });
    const retainedRev1 = structuredClone(tables.RecordDefinitionRevision[0]);
    const retainedHist1 = structuredClone(tables.RecordDefinitionHistory[0]);
    tables.RecordDefinitionRevision.push({
      ...retainedRev1,
      id: rollbackId,
      revisionNumber: 2,
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
    });
    tables.RecordDefinitionHistory.push({
      ...retainedHist1,
      id: `rdh_${rollbackOperationId.replace(/-/g, '')}`,
      operationId: rollbackOperationId,
      operation: 'rollback',
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: rollbackId,
      revisionNumber: 2,
      validation: {
        ...retainedHist1.validation,
        scope: 'rollback',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: 1,
      },
      impact: { ...retainedHist1.impact, draftVersion: 0, activeRevisionNumber: 1 },
    });
    draft.version = 2;
    draft.validation = reportFor(2, 2);
    writes.length = 0;
    assert.equal((await saved.preflight()).skipped, 2);
    assert.deepEqual(await saved.migrate(), await saved.preflight());
    assert.deepEqual(writes, []);
    // Stale reports at or before the active revision are equally valid.
    for (const stale of [null, 1]) {
      draft.validation = reportFor(2, stale);
      writes.length = 0;
      assert.equal((await saved.preflight()).skipped, 2);
      assert.deepEqual(await saved.migrate(), await saved.preflight());
      assert.deepEqual(writes, []);
    }
    draft.validation = reportFor(2, 2);
    // Future, mismatched, wrong-identity and divergent report values fail closed.
    const validValidation = structuredClone(draft.validation);
    const validBaseId = draft.baseRevisionId;
    const validBaseNumber = draft.baseRevisionNumber;
    const secret = 'DRAFT-REPORT-SECRET';
    const cases: { name: string; mutate: (value: any) => void }[] = [
      { name: 'future report active revision', mutate: value => void (value.validatedActiveRevisionNumber = 999) },
      { name: 'stale report draft version', mutate: value => void (value.validatedDraftVersion = 0) },
      { name: 'future report draft version', mutate: value => void (value.validatedDraftVersion = 999) },
      { name: 'wrong report brand identity', mutate: value => void (value.brandId = secret) },
      { name: 'wrong report record-type identity', mutate: value => void (value.recordTypeKey = 'other') },
      { name: 'future retained base', mutate: () => void (draft.baseRevisionNumber = 999) },
      {
        name: 'broken null base pairing',
        mutate: () => void ((draft.baseRevisionId = validBaseId), (draft.baseRevisionNumber = null)),
      },
    ];
    for (const { mutate } of cases) {
      draft.baseRevisionId = validBaseId;
      draft.baseRevisionNumber = validBaseNumber;
      draft.validation = structuredClone(validValidation);
      mutate(draft.validation);
      writes.length = 0;
      const messages: string[] = [];
      for (const run of [() => saved.preflight(), () => saved.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-managed-draft/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
    }
    draft.baseRevisionId = validBaseId;
    draft.baseRevisionNumber = validBaseNumber;
    draft.validation = validValidation;
    writes.length = 0;
    assert.equal((await saved.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('accepts operation-specific rollback history while rejecting scope and draft-version mismatches', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const rollbackId = deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, 2);
    const operationId = '44444444-4444-4444-8444-444444444444';
    Object.assign(row, { activeRevisionId: rollbackId, activeRevisionNumber: 2, version: 2 });
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: rollbackId,
      revisionNumber: 2,
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
    });
    tables.RecordDefinitionHistory.push({
      ...rev1History,
      id: `rdh_${operationId.replace(/-/g, '')}`,
      operationId,
      operation: 'rollback',
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: rollbackId,
      revisionNumber: 2,
      validation: {
        ...rev1History.validation,
        scope: 'rollback',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: 1,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: 1 },
    });
    const history = tables.RecordDefinitionHistory[tables.RecordDefinitionHistory.length - 1];
    const revision = tables.RecordDefinitionRevision[tables.RecordDefinitionRevision.length - 1];
    writes.length = 0;
    const report = await service.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(writes, []);
    // A draft existing at rollback time is recorded in both reports, not in
    // the null expected draft version.
    history.validation.validatedDraftVersion = 2;
    history.impact.draftVersion = 2;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    history.validation.validatedDraftVersion = 0;
    history.impact.draftVersion = 0;
    const validValidation = structuredClone(history.validation);
    const validImpact = structuredClone(history.impact);
    const cases: { name: string; mutate: (h: any, r: any) => void; match: RegExp }[] = [
      {
        name: 'rollback with publication scope',
        mutate: h => {
          h.validation.scope = 'publication';
        },
        match: /invalid-active-history/,
      },
      {
        name: 'rollback with numeric expected draft version',
        mutate: h => {
          h.expectedDraftVersion = 0;
        },
        match: /invalid-active-provenance/,
      },
      {
        name: 'rollback with null source revision',
        mutate: (h, r) => {
          const source = { operation: 'rollback', sourceRevisionNumber: null };
          h.source = source;
          r.source = source;
        },
        match: /invalid-active-revision/,
      },
      {
        name: 'rollback with future source revision',
        mutate: (h, r) => {
          const source = { operation: 'rollback', sourceRevisionNumber: 2 };
          h.source = source;
          r.source = source;
        },
        match: /invalid-active-provenance/,
      },
      {
        name: 'rollback with divergent report draft versions',
        mutate: h => {
          h.validation.validatedDraftVersion = 3;
        },
        match: /invalid-active-history/,
      },
      {
        name: 'publish with rollback scope',
        mutate: (h, r) => {
          const source = { operation: 'publish', sourceRevisionNumber: 1 };
          r.source = source;
          h.operation = 'publish';
          h.source = source;
          h.expectedDraftVersion = 0;
          h.validation.scope = 'rollback';
        },
        match: /invalid-active-history/,
      },
    ];
    for (const { mutate, match } of cases) {
      mutate(history, revision);
      writes.length = 0;
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.match(message, match);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      Object.assign(history, {
        operation: 'rollback',
        source: { operation: 'rollback', sourceRevisionNumber: 1 },
        expectedDraftVersion: null,
        validation: structuredClone(validValidation),
        impact: structuredClone(validImpact),
      });
      Object.assign(revision, { source: { operation: 'rollback', sourceRevisionNumber: 1 } });
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('accepts a retired identity with legitimate draft advances after retirement', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const revision = tables.RecordDefinitionRevision[0];
    const retireOperationId = '33333333-3333-4333-8333-333333333333';
    const retireId = `rdh_${retireOperationId.replace(/-/g, '')}`;
    const retiredAt = '2026-09-05T00:00:00.000Z';
    const actor = { id: 'b11-admin' };
    const reason = 'Retired';
    tables.RecordDefinitionHistory.push({
      id: retireId,
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation: 'retire',
      operationId: retireOperationId,
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: retiredAt,
      actor,
      note: reason,
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'added' }],
      redactions: [],
      truncated: false,
    });
    const draftId = deriveRecordDefinitionDraftId({ brandId: row.branding, recordTypeKey: row.name });
    const draft: any = {
      id: draftId,
      schemaVersion: 1,
      version: 1,
      baseRevisionId: row.activeRevisionId,
      baseRevisionNumber: 1,
      createdAt: retiredAt,
      updatedAt: retiredAt,
      createdBy: { id: 'admin' },
      updatedBy: { id: 'admin' },
      validation: null,
      recordType: row.id,
      branding: row.branding,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      definition: {
        schemaVersion: 1,
        definitionState: 'draft-incomplete',
        recordType: {},
        stages: [],
        transitions: [],
        actionBindings: [],
      },
    };
    Object.assign(row, {
      draftId,
      version: 3,
      retiredAt,
      retiredBy: actor,
      retirementReason: reason,
    });
    const retiredService = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async () => {
          throw Error('must not read legacy steps for managed identities');
        },
        draft: async () => structuredClone(draft),
        latestRetirement: async (recordTypeId: string) => {
          const candidates = tables.RecordDefinitionHistory.filter(
            (entry: any) => entry.recordType === recordTypeId && ['retire', 'unretire'].includes(entry.operation)
          ).sort((a: any, b: any) => b.resultingIdentityVersion - a.resultingIdentityVersion);
          return structuredClone(candidates[0] ?? null);
        },
      },
      seedAuthority
    );
    writes.length = 0;
    const report = await retiredService.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await retiredService.migrate(), report);
    assert.deepEqual(writes, []);
    // A second legitimate draft save advances the version again without new history.
    row.version = 4;
    draft.version = 2;
    writes.length = 0;
    assert.equal((await retiredService.preflight()).skipped, 2);
    assert.deepEqual(await retiredService.migrate(), await retiredService.preflight());
    assert.deepEqual(writes, []);
    // Malformed retirement in the gap still fails closed with zero writes.
    const originalRetiredBy = row.retiredBy;
    row.retiredBy = { id: 'B11-RETIRED-SECRET' } as any;
    writes.length = 0;
    await assert.rejects(retiredService.preflight(), error => !String(error).includes('B11-RETIRED-SECRET'));
    await assert.rejects(retiredService.migrate(), error => !String(error).includes('B11-RETIRED-SECRET'));
    assert.deepEqual(writes, []);
    row.retiredBy = originalRetiredBy;
    row.retiredAt = true as any;
    writes.length = 0;
    await assert.rejects(retiredService.preflight());
    await assert.rejects(retiredService.migrate());
    assert.deepEqual(writes, []);
  });

  it('rejects contradictory or malformed retirement history across draft-only gaps for unretired identities', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const retiredAt = '2026-09-05T00:00:00.000Z';
    const actor = { id: 'b11-admin' };
    const reason = 'Retired';
    // A legitimate draft-only advance with no retirement history is permitted.
    Object.assign(row, { version: 2 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // Publish -> retire -> draft-only advance, then clear the retirement
    // without an unretire event. The latest durable event remains retire, so
    // the contradictory unretired identity must fail closed.
    const retireOperationId = '33333333-3333-4333-8333-333333333333';
    tables.RecordDefinitionHistory.push({
      id: `rdh_${retireOperationId.replace(/-/g, '')}`,
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation: 'retire',
      operationId: retireOperationId,
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: retiredAt,
      actor,
      note: reason,
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'added' }],
      redactions: [],
      truncated: false,
    });
    Object.assign(row, { version: 3 });
    const secret = 'B11-GAP-RETIREMENT-SECRET';
    writes.length = 0;
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), error => {
        const message = String(error);
        assert.ok(message.length < 256);
        assert.ok(!message.includes(secret));
        assert.match(message, /invalid-identity-history/);
        return true;
      });
      assert.deepEqual(writes, []);
    }
    // The matching retired state across the same gap remains accepted.
    Object.assign(row, { retiredAt, retiredBy: actor, retirementReason: reason });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // A valid unretire event followed by a draft-only advance is accepted.
    const unretireOperationId = '77777777-7777-4777-8777-777777777777';
    const unretiredAt = '2026-09-06T00:00:00.000Z';
    const unretire: any = {
      id: `rdh_${unretireOperationId.replace(/-/g, '')}`,
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation: 'unretire',
      operationId: unretireOperationId,
      expectedIdentityVersion: 2,
      resultingIdentityVersion: 3,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: unretiredAt,
      actor,
      note: 'Restored',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'removed' }],
      redactions: [],
      truncated: false,
    };
    tables.RecordDefinitionHistory.push(unretire);
    Object.assign(row, { version: 4, retiredAt: null, retiredBy: null, retirementReason: null });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // Contradictory or malformed retirement events fail closed with bounded,
    // secret-free diagnostics and zero writes.
    const validUnretire = structuredClone(unretire);
    const cases: { match: RegExp; mutate: (event: any) => void }[] = [
      { match: /invalid-identity-history/, mutate: event => void (event.operation = 'retire') },
      { match: /invalid-identity-history/, mutate: event => void (event.id = `rdh_${'f'.repeat(32)}`) },
      { match: /invalid-identity-history/, mutate: event => void (event.operationId = 'not-a-uuid') },
      { match: /invalid-identity-history/, mutate: event => void (event.changes = []) },
      {
        match: /invalid-identity-history/,
        mutate: event => void (event.redactions = [{ path: '$.definition', kind: 'removed' }]),
      },
      { match: /invalid-identity-history/, mutate: event => void (event.truncated = true) },
      { match: /invalid-identity-history/, mutate: event => void (event.expectedActiveRevisionNumber = 999) },
      {
        match: /invalid-artifact-timestamp/,
        mutate: event => void (event.occurredAt = { password: secret }),
      },
    ];
    for (const { match, mutate } of cases) {
      Object.assign(unretire, structuredClone(validUnretire));
      mutate(unretire);
      writes.length = 0;
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, match);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
    }
    Object.assign(unretire, validUnretire);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  for (const operation of ['publish', 'rollback'] as const) {
    it(`accepts unretire before later ${operation} with draft save across preflight and migrate`, async () => {
      await service.migrate();
      makePublished();
      const row = tables.RecordType[0];
      const revision = tables.RecordDefinitionRevision[0];
      const history = tables.RecordDefinitionHistory[0];
      const retiredAt = '2026-09-05T00:00:00.000Z';
      const unretiredAt = '2026-09-06T00:00:00.000Z';
      const actor = { id: 'b11-admin' };
      const retireOperationId = '33333333-3333-4333-8333-333333333333';
      const unretireOperationId = '77777777-7777-4777-8777-777777777777';
      // Clone -> publish rev1 (resulting 1) -> save draft (version 2) -> retire (3) -> unretire (4).
      tables.RecordDefinitionHistory.push(
        {
          id: `rdh_${retireOperationId.replace(/-/g, '')}`,
          schemaVersion: 1,
          branding: row.branding,
          recordType: row.id,
          recordTypeId: row.definitionId,
          recordTypeKey: row.name,
          operation: 'retire',
          operationId: retireOperationId,
          expectedIdentityVersion: 2,
          resultingIdentityVersion: 3,
          expectedDraftVersion: null,
          expectedActiveRevisionNumber: 1,
          revision: null,
          revisionNumber: null,
          canonicalHash: null,
          source: null,
          occurredAt: retiredAt,
          actor,
          note: 'Retired',
          validation: null,
          impact: null,
          changes: [{ path: '/retirement', kind: 'added' }],
          redactions: [],
          truncated: false,
        },
        {
          id: `rdh_${unretireOperationId.replace(/-/g, '')}`,
          schemaVersion: 1,
          branding: row.branding,
          recordType: row.id,
          recordTypeId: row.definitionId,
          recordTypeKey: row.name,
          operation: 'unretire',
          operationId: unretireOperationId,
          expectedIdentityVersion: 3,
          resultingIdentityVersion: 4,
          expectedDraftVersion: null,
          expectedActiveRevisionNumber: 1,
          revision: null,
          revisionNumber: null,
          canonicalHash: null,
          source: null,
          occurredAt: unretiredAt,
          actor,
          note: 'Restored',
          validation: null,
          impact: null,
          changes: [{ path: '/retirement', kind: 'removed' }],
          redactions: [],
          truncated: false,
        }
      );
      // Later publication/rollback rev2 (resulting 5) -> save draft (version 6).
      // Preserve the complete rev1 publication evidence; the later revision
      // is appended as new rows so historical lookups prove active-at-unretire.
      const revisionId = deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, 2);
      const publicationOperationId =
        operation === 'publish' ? '55555555-5555-4555-8555-555555555555' : '44444444-4444-4444-8444-444444444444';
      const source =
        operation === 'publish' ? { operation, sourceRevisionNumber: 1 } : { operation, sourceRevisionNumber: 1 };
      const rev1Revision = structuredClone(revision);
      const rev1History = structuredClone(history);
      Object.assign(row, { activeRevisionId: revisionId, activeRevisionNumber: 2, version: 6 });
      tables.RecordDefinitionRevision.push({ ...rev1Revision, id: revisionId, revisionNumber: 2, source });
      tables.RecordDefinitionHistory.push({
        ...rev1History,
        id: `rdh_${publicationOperationId.replace(/-/g, '')}`,
        operationId: publicationOperationId,
        operation,
        source,
        expectedIdentityVersion: 4,
        resultingIdentityVersion: 5,
        expectedDraftVersion: operation === 'publish' ? 0 : null,
        expectedActiveRevisionNumber: 1,
        revision: revisionId,
        revisionNumber: 2,
        validation: {
          ...rev1History.validation,
          scope: operation === 'publish' ? 'publication' : 'rollback',
          validatedDraftVersion: 0,
          validatedActiveRevisionNumber: 1,
        },
        impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: 1 },
      });
      const before = structuredClone(tables);
      writes.length = 0;
      const report = await service.preflight();
      assert.equal(report.skipped, 2);
      assert.deepEqual(await service.migrate(), report);
      assert.deepEqual(writes, []);
      assert.deepEqual(tables, before);
      // A forged unretire active revision still fails closed with bounded diagnostics.
      const unretire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire');
      const validExpectedActive = unretire.expectedActiveRevisionNumber;
      for (const forged of [999, 2]) {
        unretire.expectedActiveRevisionNumber = forged;
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(run(), error => {
            const message = String(error);
            assert.ok(message.length < 256);
            assert.match(message, /invalid-identity-history/);
            messages.push(message);
            return true;
          });
          assert.deepEqual(writes, []);
        }
        assert.equal(messages[0], messages[1]);
        assert.deepEqual(
          tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire')
            .expectedActiveRevisionNumber,
          forged
        );
      }
      unretire.expectedActiveRevisionNumber = validExpectedActive;
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2);
      assert.deepEqual(await service.migrate(), await service.preflight());
      assert.deepEqual(writes, []);
      // Clearing the unretire into a retire while unretired still fails closed.
      unretire.operation = 'retire';
      writes.length = 0;
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), /invalid-identity-history/);
        assert.deepEqual(writes, []);
      }
      unretire.operation = 'unretire';
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2);
      assert.deepEqual(writes, []);
    });
  }

  it('rejects a forged older unretire active revision after successive publications (3 to 1)', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    // Publish rev2 (1->2) and rev3 (2->3) before retirement.
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 2, 3)
    );
    // Retire (3->4) then unretire (4->5) referencing the live revision 3.
    const retiredAt = '2026-09-05T00:00:00.000Z';
    const unretiredAt = '2026-09-06T00:00:00.000Z';
    tables.RecordDefinitionHistory.push(
      {
        id: hId('33333333-3333-4333-8333-333333333333'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 3,
        resultingIdentityVersion: 4,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 3,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: retiredAt,
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: hId('77777777-7777-4777-8777-777777777777'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 4,
        resultingIdentityVersion: 5,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 3,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: unretiredAt,
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    // Later publish rev4 (5->6) then save (version 7).
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: revId(4),
      revisionNumber: 4,
      source: { operation: 'publish', sourceRevisionNumber: 3 },
    });
    tables.RecordDefinitionHistory.push(publishHist('88888888-8888-4888-8888-888888888888', 5, 6, 3, 4));
    Object.assign(row, { activeRevisionId: revId(4), activeRevisionNumber: 4, version: 7 });
    const before = structuredClone(tables);
    writes.length = 0;
    const report = await service.preflight();
    assert.equal(report.skipped, 2);
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(writes, []);
    assert.deepEqual(tables, before);
    // Forging the unretire reference from 3 to an older revision must fail:
    // revision 1 was superseded by revision 2 long before the unretire.
    const unretire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire');
    for (const forged of [1, 2, 999]) {
      unretire.expectedActiveRevisionNumber = forged;
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
    }
    unretire.expectedActiveRevisionNumber = 3;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('fails closed on missing or malformed historical publication evidence', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const rev2Id = deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, 2);
    tables.RecordDefinitionHistory.push(
      {
        id: 'rdh_33333333333343338333333333333333',
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 2,
        resultingIdentityVersion: 3,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-05T00:00:00.000Z',
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: 'rdh_77777777777747778777777777777777',
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 3,
        resultingIdentityVersion: 4,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-06T00:00:00.000Z',
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: rev2Id,
      revisionNumber: 2,
      source: { operation: 'publish', sourceRevisionNumber: 1 },
    });
    tables.RecordDefinitionHistory.push({
      ...rev1History,
      id: 'rdh_55555555555545558555555555555555',
      operationId: '55555555-5555-4555-8555-555555555555',
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: 1 },
      expectedIdentityVersion: 4,
      resultingIdentityVersion: 5,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: 1,
      revision: rev2Id,
      revisionNumber: 2,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: 1,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: 1 },
    });
    Object.assign(row, { activeRevisionId: rev2Id, activeRevisionNumber: 2, version: 6 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const secret = 'B11-HISTORY-SECRET';
    const priorHistory = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 1 && entry.operation === 'publish');
    // Missing prior publication evidence fails closed.
    const removedHistory = tables.RecordDefinitionHistory.splice(
      tables.RecordDefinitionHistory.findIndex((entry: any) => entry === priorHistory()),
      1
    );
    writes.length = 0;
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), error => {
        const message = String(error);
        assert.ok(message.length < 256);
        assert.match(message, /invalid-identity-history/);
        return true;
      });
      assert.deepEqual(writes, []);
    }
    tables.RecordDefinitionHistory.unshift(removedHistory[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Missing prior revision fails closed.
    const removedRevision = tables.RecordDefinitionRevision.splice(0, 1);
    writes.length = 0;
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), /invalid-identity-history/);
      assert.deepEqual(writes, []);
    }
    tables.RecordDefinitionRevision.unshift(removedRevision[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Malformed prior evidence fails closed with bounded secret-free diagnostics.
    const cases: { name: string; mutate: (history: any) => void }[] = [
      { name: 'schema', mutate: history => void (history.schemaVersion = 99) },
      { name: 'resulting', mutate: history => void (history.resultingIdentityVersion = -1) },
      { name: 'expected', mutate: history => void (history.expectedIdentityVersion = 999) },
      { name: 'hash', mutate: history => void (history.canonicalHash = `sha256:${secret}`) },
      { name: 'report', mutate: history => void (history.validation = { password: secret }) },
    ];
    for (const { mutate } of cases) {
      const valid = structuredClone(priorHistory());
      mutate(priorHistory());
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
      Object.assign(priorHistory(), valid);
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('rejects forged 3->1 combined with missing or future intermediate successor evidence', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: revisionNumber === 1 ? null : expectedActive,
      },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 2, 3)
    );
    const retiredAt = '2026-09-05T00:00:00.000Z';
    const unretiredAt = '2026-09-06T00:00:00.000Z';
    tables.RecordDefinitionHistory.push(
      {
        id: hId('33333333-3333-4333-8333-333333333333'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 3,
        resultingIdentityVersion: 4,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 3,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: retiredAt,
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: hId('77777777-7777-4777-8777-777777777777'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 4,
        resultingIdentityVersion: 5,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 3,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: unretiredAt,
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: revId(4),
      revisionNumber: 4,
      source: { operation: 'publish', sourceRevisionNumber: 3 },
    });
    tables.RecordDefinitionHistory.push(publishHist('88888888-8888-4888-8888-888888888888', 5, 6, 3, 4));
    Object.assign(row, { activeRevisionId: revId(4), activeRevisionNumber: 4, version: 7 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const secret = 'B11-SUCCESSOR-SECRET';
    const unretire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire');
    unretire.expectedActiveRevisionNumber = 1;
    const successorHist = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    // Forged 3->1 with the intermediate successor row deleted fails closed.
    const removedIndex = tables.RecordDefinitionHistory.findIndex((entry: any) => entry === successorHist());
    const removed = tables.RecordDefinitionHistory.splice(removedIndex, 1);
    writes.length = 0;
    {
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
    }
    tables.RecordDefinitionHistory.splice(removedIndex, 0, removed[0]);
    writes.length = 0;
    // Still forged: the complete intermediate chain is present but revision 2
    // predates the unretire, so the forged reference fails closed.
    {
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), /invalid-identity-history/);
        assert.deepEqual(writes, []);
      }
    }
    // Forged 3->1 with a future intermediate successor version fails closed.
    const validSuccessor = structuredClone(successorHist());
    successorHist().resultingIdentityVersion = 999;
    writes.length = 0;
    {
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
    }
    Object.assign(successorHist(), validSuccessor);
    // Restoring the live reference re-accepts the lifecycle with zero writes.
    unretire.expectedActiveRevisionNumber = 3;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('fails closed on malformed intermediate successor after valid unretire then later publishes', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    // Valid unretire at revision 1, then publish revisions 2 and 3.
    tables.RecordDefinitionHistory.push(
      {
        id: hId('33333333-3333-4333-8333-333333333333'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 1,
        resultingIdentityVersion: 2,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-05T00:00:00.000Z',
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: hId('77777777-7777-4777-8777-777777777777'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 2,
        resultingIdentityVersion: 3,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-06T00:00:00.000Z',
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: expectedActive,
      },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 3, 4, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 4, 5, 2, 3)
    );
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 6 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const secret = 'B11-INTERMEDIATE-SECRET';
    const intermediateHist = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    // Missing intermediate successor evidence fails closed.
    const removedIndex = tables.RecordDefinitionHistory.findIndex((entry: any) => entry === intermediateHist());
    const removed = tables.RecordDefinitionHistory.splice(removedIndex, 1);
    writes.length = 0;
    {
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
    }
    tables.RecordDefinitionHistory.splice(removedIndex, 0, removed[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    const cases: { name: string; mutate: (history: any) => void }[] = [
      { name: 'schema', mutate: history => void (history.schemaVersion = 99) },
      { name: 'expected', mutate: history => void (history.expectedIdentityVersion = 999) },
      { name: 'future', mutate: history => void (history.resultingIdentityVersion = 999) },
      { name: 'hash', mutate: history => void (history.canonicalHash = `sha256:${secret}`) },
      { name: 'report', mutate: history => void (history.validation = { password: secret }) },
    ];
    for (const { mutate } of cases) {
      const valid = structuredClone(intermediateHist());
      mutate(intermediateHist());
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
      Object.assign(intermediateHist(), valid);
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('fails closed on corrupt intermediate successor immediately after publication without a draft save', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    // Valid unretire at revision 1, publish revision 2, save (version 5),
    // then publish revision 3 without the final save: version equals the
    // current publication resulting version (5).
    tables.RecordDefinitionHistory.push(
      {
        id: hId('33333333-3333-4333-8333-333333333333'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 1,
        resultingIdentityVersion: 2,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-05T00:00:00.000Z',
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: hId('77777777-7777-4777-8777-777777777777'),
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 2,
        resultingIdentityVersion: 3,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-06T00:00:00.000Z',
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: expectedActive,
      },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 3, 4, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 4, 5, 2, 3)
    );
    // No final draft save after revision 3: version equals publication resulting.
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 5 });
    writes.length = 0;
    const before = structuredClone(tables);
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    assert.deepEqual(tables, before);
    const secret = 'B11-BOUNDARY-SECRET';
    const intermediateHist = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    // Missing rev2 history fails closed with unchanged persisted state.
    const removedIndex = tables.RecordDefinitionHistory.findIndex((entry: any) => entry === intermediateHist());
    const removed = tables.RecordDefinitionHistory.splice(removedIndex, 1);
    writes.length = 0;
    {
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
    }
    tables.RecordDefinitionHistory.splice(removedIndex, 0, removed[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    const cases: { name: string; mutate: (history: any) => void }[] = [
      { name: 'schema', mutate: history => void (history.schemaVersion = 99) },
      { name: 'expected', mutate: history => void (history.expectedIdentityVersion = 999) },
      { name: 'resulting', mutate: history => void (history.resultingIdentityVersion = 999) },
      { name: 'hash', mutate: history => void (history.canonicalHash = `sha256:${secret}`) },
      { name: 'report', mutate: history => void (history.validation = { password: secret }) },
    ];
    for (const { mutate } of cases) {
      const valid = structuredClone(intermediateHist());
      mutate(intermediateHist());
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
      Object.assign(intermediateHist(), valid);
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // A subsequent draft save (version 6) keeps the valid boundary accepted.
    Object.assign(row, { version: 6 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // Clearing the unretire into a retire while unretired still fails closed.
    Object.assign(row, { version: 5 });
    const unretire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire');
    unretire.operation = 'retire';
    writes.length = 0;
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), /invalid-identity-history/);
      assert.deepEqual(writes, []);
    }
    unretire.operation = 'unretire';
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('fails closed on corrupt earlier publication after a later retire/unretire cycle at the current revision', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: expectedActive,
      },
    });
    const retireEvent = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      occurredAt: string,
      note: string,
      operation: 'retire' | 'unretire'
    ): any => ({
      id: hId(operationId),
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation,
      operationId,
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: expectedActive,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt,
      actor,
      note,
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: operation === 'retire' ? 'added' : 'removed' }],
      redactions: [],
      truncated: false,
    });
    // Publish revision 1, retire/unretire, publish revision 2, publish
    // revision 3, then a second valid retire/unretire cycle at revision 3.
    tables.RecordDefinitionHistory.push(
      retireEvent('33333333-3333-4333-8333-333333333333', 1, 2, 1, '2026-09-05T00:00:00.000Z', 'Retired', 'retire'),
      retireEvent('77777777-7777-4777-8777-777777777777', 2, 3, 1, '2026-09-06T00:00:00.000Z', 'Restored', 'unretire')
    );
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 3, 4, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 4, 5, 2, 3)
    );
    tables.RecordDefinitionHistory.push(
      retireEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 6, 3, '2026-09-07T00:00:00.000Z', 'Retired2', 'retire'),
      retireEvent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 6, 7, 3, '2026-09-08T00:00:00.000Z', 'Restored2', 'unretire')
    );
    const secret = 'B11-LATER-CYCLE-SECRET';
    const intermediateHist = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    const checkState = async (name: string, apply: () => void) => {
      apply();
      writes.length = 0;
      const before = structuredClone(tables);
      assert.equal((await service.preflight()).skipped, 2, name);
      assert.deepEqual(await service.migrate(), await service.preflight(), name);
      assert.deepEqual(writes, [], name);
      assert.deepEqual(tables, before, name);
      // Six intermediate-history variants for revision 2.
      const removedIndex = tables.RecordDefinitionHistory.findIndex((entry: any) => entry === intermediateHist());
      const removed = tables.RecordDefinitionHistory.splice(removedIndex, 1);
      writes.length = 0;
      {
        const snapshot = structuredClone(tables);
        const messages: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 256, name);
              assert.ok(!message.includes(secret), name);
              assert.match(message, /invalid-identity-history/, name);
              messages.push(message);
              return true;
            },
            name
          );
          assert.deepEqual(writes, [], name);
        }
        assert.equal(messages[0], messages[1], name);
        assert.deepEqual(tables, snapshot, name);
      }
      tables.RecordDefinitionHistory.splice(removedIndex, 0, removed[0]);
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2, name);
      const cases: { label: string; mutate: (history: any) => void }[] = [
        { label: `${name}-schema`, mutate: history => void (history.schemaVersion = 99) },
        { label: `${name}-expected`, mutate: history => void (history.expectedIdentityVersion = 999) },
        { label: `${name}-resulting`, mutate: history => void (history.resultingIdentityVersion = 999) },
        { label: `${name}-hash`, mutate: history => void (history.canonicalHash = `sha256:${secret}`) },
        { label: `${name}-report`, mutate: history => void (history.validation = { password: secret }) },
      ];
      for (const { label, mutate } of cases) {
        const valid = structuredClone(intermediateHist());
        mutate(intermediateHist());
        writes.length = 0;
        const snapshot = structuredClone(tables);
        const messages: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 256, label);
              assert.ok(!message.includes(secret), label);
              assert.match(message, /invalid-identity-history/, label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, snapshot, label);
        Object.assign(intermediateHist(), valid);
      }
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2, name);
      assert.deepEqual(await service.migrate(), await service.preflight(), name);
      assert.deepEqual(writes, [], name);
    };
    await checkState('while-retired', () =>
      Object.assign(row, {
        activeRevisionId: revId(3),
        activeRevisionNumber: 3,
        version: 6,
        retiredAt: '2026-09-07T00:00:00.000Z',
        retiredBy: actor,
        retirementReason: 'Retired2',
      })
    );
    await checkState('after-unretire', () =>
      Object.assign(row, {
        activeRevisionId: revId(3),
        activeRevisionNumber: 3,
        version: 7,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
      })
    );
    await checkState('after-save', () =>
      Object.assign(row, {
        activeRevisionId: revId(3),
        activeRevisionNumber: 3,
        version: 8,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
      })
    );
    // Later publications without a final save: each new revision is created
    // only when its state is exercised, so earlier saved states never observe
    // a future resulting version.
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: revId(4),
      revisionNumber: 4,
      source: { operation: 'publish', sourceRevisionNumber: 3 },
    });
    tables.RecordDefinitionHistory.push(publishHist('88888888-8888-4888-8888-888888888888', 7, 8, 3, 4));
    await checkState('after-publish-rev4', () =>
      Object.assign(row, {
        activeRevisionId: revId(4),
        activeRevisionNumber: 4,
        version: 8,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
      })
    );
    tables.RecordDefinitionRevision.push({
      ...rev1Revision,
      id: revId(5),
      revisionNumber: 5,
      source: { operation: 'publish', sourceRevisionNumber: 4 },
    });
    tables.RecordDefinitionHistory.push(publishHist('99999999-9999-4999-8999-999999999999', 8, 9, 4, 5));
    await checkState('after-publish-rev5', () =>
      Object.assign(row, {
        activeRevisionId: revId(5),
        activeRevisionNumber: 5,
        version: 9,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
      })
    );
  });

  it('rejects a deleted intermediate history for never-retired rev1/rev2/rev3 immediately and after save', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number | null,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: expectedActive },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 2, 3)
    );
    const secret = 'B11-NEVER-RETIRED-SECRET';
    const checkState = async (label: string) => {
      const before = structuredClone(tables);
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2, label);
      assert.deepEqual(await service.migrate(), await service.preflight(), label);
      assert.deepEqual(writes, [], label);
      assert.deepEqual(tables, before, label);
      const removedIndex = tables.RecordDefinitionHistory.findIndex(
        (entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish'
      );
      assert.notEqual(removedIndex, -1, label);
      const removed = tables.RecordDefinitionHistory.splice(removedIndex, 1);
      try {
        writes.length = 0;
        const snapshot = structuredClone(tables);
        const messages: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 256, label);
              assert.ok(!message.includes(secret), label);
              assert.match(message, /invalid-identity-history/, label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, snapshot, label);
      } finally {
        tables.RecordDefinitionHistory.splice(removedIndex, 0, removed[0]);
      }
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2, `${label}-restored`);
      assert.deepEqual(await service.migrate(), await service.preflight(), `${label}-restored`);
      assert.deepEqual(writes, [], `${label}-restored`);
    };
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 3 });
    await checkState('never-retired-immediate');
    Object.assign(row, { version: 4 });
    await checkState('never-retired-after-save');
  });

  it('rejects semantically invalid prior revisions with recomputed hashes while the current remains valid', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number | null,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: expectedActive },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 2, 3)
    );
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 3 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const secret = 'B11-PRIOR-SEMANTIC-SECRET';
    const rev2Revision = () => tables.RecordDefinitionRevision.find((entry: any) => entry.revisionNumber === 2);
    const rev2History = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    // Prior actionContracts mutated to a schema-valid but unavailable action.
    {
      const validRevision = structuredClone(rev2Revision());
      const validHistory = structuredClone(rev2History());
      rev2Revision().actionContracts = [{ actionId: 'core.email.send', contractVersion: 1 }];
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
      Object.assign(rev2Revision(), validRevision);
      Object.assign(rev2History(), validHistory);
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Prior stage editRoles mutated to a nonexistent role with recomputed hashes.
    {
      const validRevision = structuredClone(rev2Revision());
      const validHistory = structuredClone(rev2History());
      const mutated = structuredClone(rev2Revision().definition);
      mutated.stages = mutated.stages.map((stage: any) => ({
        ...stage,
        editRoles: ['B11-GHOST-ROLE'],
        viewRoles: ['B11-GHOST-ROLE', ...(stage.viewRoles ?? [])],
      }));
      const canonicalHash = hashRecordDefinition(mutated);
      Object.assign(rev2Revision(), { definition: mutated, canonicalHash });
      Object.assign(rev2History(), { canonicalHash });
      writes.length = 0;
      const snapshot = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, snapshot);
      const current = tables.RecordDefinitionRevision.find((entry: any) => entry.revisionNumber === 2);
      Object.assign(current, validRevision);
      Object.assign(rev2History(), validHistory);
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('rejects a forged earlier publication version occupying a retirement slot in a later cycle', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    const publishHist = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number | null,
      revisionNumber: number
    ): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: expectedActive,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: expectedActive,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: expectedActive },
    });
    const retireEvent = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      occurredAt: string,
      note: string,
      operation: 'retire' | 'unretire'
    ): any => ({
      id: hId(operationId),
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation,
      operationId,
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: expectedActive,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt,
      actor,
      note,
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: operation === 'retire' ? 'added' : 'removed' }],
      redactions: [],
      truncated: false,
    });
    tables.RecordDefinitionHistory.push(
      retireEvent('33333333-3333-4333-8333-333333333333', 1, 2, 1, '2026-09-05T00:00:00.000Z', 'Retired', 'retire'),
      retireEvent('77777777-7777-4777-8777-777777777777', 2, 3, 1, '2026-09-06T00:00:00.000Z', 'Restored', 'unretire')
    );
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 4, 5, 1, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 6, 7, 2, 3)
    );
    tables.RecordDefinitionHistory.push(
      retireEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7, 8, 3, '2026-09-07T00:00:00.000Z', 'Retired2', 'retire'),
      retireEvent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 8, 9, 3, '2026-09-08T00:00:00.000Z', 'Restored2', 'unretire')
    );
    Object.assign(row, {
      activeRevisionId: revId(3),
      activeRevisionNumber: 3,
      version: 9,
      retiredAt: null,
      retiredBy: null,
      retirementReason: null,
    });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const secret = 'B11-FORGED-VERSION-SECRET';
    const intermediate = () =>
      tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2 && entry.operation === 'publish');
    const valid = structuredClone(intermediate());
    intermediate().expectedIdentityVersion = 1;
    intermediate().resultingIdentityVersion = 2;
    writes.length = 0;
    const snapshot = structuredClone(tables);
    const messages: string[] = [];
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), error => {
        const message = String(error);
        assert.ok(message.length < 256);
        assert.ok(!message.includes(secret));
        assert.match(message, /invalid-identity-history/);
        messages.push(message);
        return true;
      });
      assert.deepEqual(writes, []);
    }
    assert.equal(messages[0], messages[1]);
    assert.deepEqual(tables, snapshot);
    Object.assign(intermediate(), valid);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
  });

  it('rejects secret-bearing malformed authority snapshots without exposing secrets and without writes', async () => {
    const secret = 'B11-AUTHORITY-SECRET';
    const cases: { roles?: any; forms?: any; keys?: any }[] = [
      { roles: ['Admin', `BAD ${secret} WITH SPACES`] },
      { roles: ['Admin', { password: secret }] },
      { forms: [{ reference: `BAD ${secret} WITH SPACES`, validationOperations: {}, validationGroups: {} }] },
      {
        forms: [{ reference: 'dataset-form', validationOperations: { password: secret } as any, validationGroups: {} }],
      },
      { keys: ['dataset', `bad ${secret}`] },
    ];
    for (const malformed of cases) {
      const hostileAuthority = {
        async load() {
          const base = await seedAuthority.load({} as any);
          return {
            ...base,
            roles: malformed.roles ?? base.roles,
            forms: malformed.forms ?? base.forms,
            availableRecordTypeKeys: malformed.keys ?? base.availableRecordTypeKeys,
          };
        },
      };
      const hostile = new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async id => [
            {
              name: 'draft',
              recordType: id,
              starting: true,
              config: {
                workflow: { stage: 'draft', stageLabel: id },
                form: 'dataset-form',
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
              },
            },
          ],
        },
        hostileAuthority as any
      );
      const before = structuredClone(tables);
      const messages: string[] = [];
      for (const run of [() => hostile.preflight(), () => hostile.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-authority|publication-validation-failed|migration-operation-failed/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(tables, before);
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
    }
  });

  it('rejects earlier-save-slot retirement-ordering forgeries with full lifecycle replay', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const actor = { id: 'b11-admin' };
    const secret = 'B11-REPLAY-SECRET';
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    const publishHist = (operationId: string, expected: number, resulting: number, revisionNumber: number): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: revisionNumber === 1 ? null : revisionNumber - 1,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: revisionNumber === 1 ? null : revisionNumber - 1,
      },
      impact: {
        ...rev1History.impact,
        draftVersion: 0,
        activeRevisionNumber: revisionNumber === 1 ? null : revisionNumber - 1,
      },
    });
    const retireEvent = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      operation: 'retire' | 'unretire'
    ): any => ({
      id: hId(operationId),
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation,
      operationId,
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: expectedActive,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: '2026-09-05T00:00:00.000Z',
      actor,
      note: operation === 'retire' ? 'Retired' : 'Restored',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: operation === 'retire' ? 'added' : 'removed' }],
      redactions: [],
      truncated: false,
    });
    // Real lifecycle: publish rev1 0->1, save 1->2, retire 2->3, unretire
    // 3->4, publish rev2 4->5, save 5->6, publish rev3 6->7, retire 7->8,
    // unretire 8->9 active rev3.
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    tables.RecordDefinitionHistory.push(
      retireEvent('33333333-3333-4333-8333-333333333333', 2, 3, 1, 'retire'),
      retireEvent('77777777-7777-4777-8777-777777777777', 3, 4, 1, 'unretire'),
      publishHist('55555555-5555-4555-8555-555555555555', 4, 5, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 6, 7, 3),
      retireEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7, 8, 3, 'retire'),
      retireEvent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 8, 9, 3, 'unretire')
    );
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 9 });
    const withHistoriesReader = () => ({
      recordTypes: async () => structuredClone(tables.RecordType),
      workflowSteps: async () => {
        throw Error('must not read legacy steps for managed identities');
      },
      histories: async (recordTypeId: string) =>
        structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
    });
    const checkReject = async (label: string) => {
      for (const reader of [undefined, withHistoriesReader()]) {
        const target =
          reader === undefined ? service : new RecordDefinitionMigrationService(reader as any, seedAuthority);
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 256, label);
              assert.ok(!message.includes(secret), label);
              assert.match(message, /invalid-identity-history/, label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
    };
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    // Mutate only rev2 publication history (4,5) to the earlier save slot (1,2).
    const rev2Hist = tables.RecordDefinitionHistory.find((entry: any) => entry.revisionNumber === 2);
    const validExpected = rev2Hist.expectedIdentityVersion;
    const validResulting = rev2Hist.resultingIdentityVersion;
    rev2Hist.expectedIdentityVersion = 1;
    rev2Hist.resultingIdentityVersion = 2;
    await checkReject('earlier-save-slot-forgery');
    // A valid later save (v10) must not rescue the forgery.
    row.version = 10;
    await checkReject('earlier-save-slot-forgery-saved');
    row.version = 9;
    rev2Hist.expectedIdentityVersion = validExpected;
    rev2Hist.resultingIdentityVersion = validResulting;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Deleting the first retire event breaks the active->retired->active chain.
    const retireIndex = tables.RecordDefinitionHistory.findIndex((entry: any) => entry.operation === 'retire');
    const removed = tables.RecordDefinitionHistory.splice(retireIndex, 1);
    await checkReject('deleted-first-retire');
    tables.RecordDefinitionHistory.splice(retireIndex, 0, removed[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Changing the first unretire into a retire creates a retire-retire pair.
    const unretire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'unretire');
    unretire.operation = 'retire';
    unretire.changes = [{ path: '/retirement', kind: 'added' }];
    await checkReject('unretire-into-retire');
    unretire.operation = 'unretire';
    unretire.changes = [{ path: '/retirement', kind: 'removed' }];
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('rejects deleted predecessor chains while preserving genuine rev1', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (operationId: string, expected: number, resulting: number, revisionNumber: number): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: revisionNumber - 1,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: revisionNumber - 1,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: revisionNumber - 1 },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 3)
    );
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 3 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
    // Deleting only the rev2 history already rejects.
    const rev2Index = tables.RecordDefinitionHistory.findIndex((entry: any) => entry.revisionNumber === 2);
    const rev2Removed = tables.RecordDefinitionHistory.splice(rev2Index, 1);
    writes.length = 0;
    for (const run of [() => service.preflight(), () => service.migrate()]) {
      await assert.rejects(run(), /invalid-identity-history/);
      assert.deepEqual(writes, []);
    }
    tables.RecordDefinitionHistory.splice(rev2Index, 0, rev2Removed[0]);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Deleting all predecessors (rev1+rev2 rows and histories) must fail
    // closed immediately and after a valid later save; surviving-row counts
    // never infer a legitimate truncated chain. Mutate in place so the
    // table-backed mocks observe the deletion.
    const snapshot = structuredClone(tables);
    const removedRevisions = tables.RecordDefinitionRevision.filter(
      (entry: any) => entry.recordType === row.id && entry.revisionNumber !== 3
    );
    for (const entry of removedRevisions) {
      tables.RecordDefinitionRevision.splice(tables.RecordDefinitionRevision.indexOf(entry), 1);
    }
    const removedHistories = tables.RecordDefinitionHistory.filter(
      (entry: any) => entry.recordType === row.id && entry.revisionNumber !== 3
    );
    for (const entry of removedHistories) {
      tables.RecordDefinitionHistory.splice(tables.RecordDefinitionHistory.indexOf(entry), 1);
    }
    assert.equal(tables.RecordDefinitionRevision.filter((entry: any) => entry.recordType === row.id).length, 1);
    for (const version of [3, 4]) {
      row.version = version;
      const before = structuredClone(tables);
      writes.length = 0;
      const messages: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, before);
    }
    tables.RecordDefinitionRevision.push(...removedRevisions);
    tables.RecordDefinitionHistory.push(...removedHistories);
    Object.assign(row, snapshot.RecordType[0]);
    row.version = 3;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('fails closed on out-of-range retirement evidence through the shared enumeration', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const retiredAt = '2026-09-05T00:00:00.000Z';
    const actor = { id: 'b11-admin' };
    const secret = 'B11-NEGATIVE-SECRET';
    tables.RecordDefinitionHistory.push(
      {
        id: 'rdh_33333333333343338333333333333333',
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'retire',
        operationId: '33333333-3333-4333-8333-333333333333',
        expectedIdentityVersion: 1,
        resultingIdentityVersion: 2,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: retiredAt,
        actor,
        note: 'Retired',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'added' }],
        redactions: [],
        truncated: false,
      },
      {
        id: 'rdh_77777777777747778777777777777777',
        schemaVersion: 1,
        branding: row.branding,
        recordType: row.id,
        recordTypeId: row.definitionId,
        recordTypeKey: row.name,
        operation: 'unretire',
        operationId: '77777777-7777-4777-8777-777777777777',
        expectedIdentityVersion: 2,
        resultingIdentityVersion: 3,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: 1,
        revision: null,
        revisionNumber: null,
        canonicalHash: null,
        source: null,
        occurredAt: '2026-09-06T00:00:00.000Z',
        actor,
        note: 'Restored',
        validation: null,
        impact: null,
        changes: [{ path: '/retirement', kind: 'removed' }],
        redactions: [],
        truncated: false,
      }
    );
    Object.assign(row, { version: 3 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    // Forge the first retirement outside the 0..version scan window. The
    // shared complete enumeration validates every event before trusting
    // coordinates, so both the Waterline path and the CLI-parity histories
    // reader fail closed instead of skipping the malformed event.
    const retire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'retire');
    const validExpected = retire.expectedIdentityVersion;
    const validResulting = retire.resultingIdentityVersion;
    retire.expectedIdentityVersion = -3;
    retire.resultingIdentityVersion = -2;
    const cliParity = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async () => {
          throw Error('must not read legacy steps for managed identities');
        },
        histories: async (recordTypeId: string) =>
          structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
      },
      seedAuthority
    );
    for (const target of [service, cliParity]) {
      const before = structuredClone(tables);
      writes.length = 0;
      const messages: string[] = [];
      for (const run of [() => target.preflight(), () => target.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 256);
          assert.ok(!message.includes(secret));
          assert.match(message, /invalid-identity-history/);
          messages.push(message);
          return true;
        });
        assert.deepEqual(writes, []);
      }
      assert.equal(messages[0], messages[1]);
      assert.deepEqual(tables, before);
    }
    retire.expectedIdentityVersion = validExpected;
    retire.resultingIdentityVersion = validResulting;
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.equal((await cliParity.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('shares bootstrap and migration provenance between current and prior revisions', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const rev1Revision = structuredClone(tables.RecordDefinitionRevision[0]);
    const rev1History = structuredClone(tables.RecordDefinitionHistory[0]);
    const secret = 'FORGED-ACTOR';
    const revId = (n: number) =>
      deriveRecordDefinitionRevisionId({ brandId: row.branding, recordTypeKey: row.name }, n);
    const hId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    // Publish rev2 and rev3 so rev1 becomes a prior revision.
    tables.RecordDefinitionRevision.push(
      { ...rev1Revision, id: revId(2), revisionNumber: 2, source: { operation: 'publish', sourceRevisionNumber: 1 } },
      { ...rev1Revision, id: revId(3), revisionNumber: 3, source: { operation: 'publish', sourceRevisionNumber: 2 } }
    );
    const publishHist = (operationId: string, expected: number, resulting: number, revisionNumber: number): any => ({
      ...rev1History,
      id: hId(operationId),
      operationId,
      operation: 'publish',
      source: { operation: 'publish', sourceRevisionNumber: revisionNumber - 1 },
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: revisionNumber - 1,
      revision: revId(revisionNumber),
      revisionNumber,
      validation: {
        ...rev1History.validation,
        scope: 'publication',
        validatedDraftVersion: 0,
        validatedActiveRevisionNumber: revisionNumber - 1,
      },
      impact: { ...rev1History.impact, draftVersion: 0, activeRevisionNumber: revisionNumber - 1 },
    });
    tables.RecordDefinitionHistory.push(
      publishHist('55555555-5555-4555-8555-555555555555', 1, 2, 2),
      publishHist('66666666-6666-4666-8666-666666666666', 2, 3, 3)
    );
    Object.assign(row, { activeRevisionId: revId(3), activeRevisionNumber: 3, version: 3 });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    for (const operation of ['bootstrap', 'migration'] as const) {
      const priorRevision = tables.RecordDefinitionRevision.find(
        (entry: any) => entry.recordType === row.id && entry.revisionNumber === 1
      );
      const priorHistory = tables.RecordDefinitionHistory.find(
        (entry: any) => entry.recordType === row.id && entry.revisionNumber === 1
      );
      const validRevision = structuredClone(priorRevision);
      const validHistory = structuredClone(priorHistory);
      const forgedActor = { id: secret };
      Object.assign(priorRevision, {
        source: { operation, sourceRevisionNumber: null },
        publishedBy: forgedActor,
        createdBy: forgedActor,
      });
      delete (priorRevision as any).publicationNote;
      Object.assign(priorHistory, {
        operation,
        source: { operation, sourceRevisionNumber: null },
        actor: forgedActor,
        expectedDraftVersion: null,
        expectedIdentityVersion: 0,
        id: `rdh_${String(row.definitionId).slice(4)}`,
        operationId: `rdh_${String(row.definitionId).slice(4)}`,
        note: operation === 'migration' ? JSON.stringify({ migration: 'x', workflowSteps: 0, warnings: [] }) : '',
      });
      for (const version of [3, 4]) {
        row.version = version;
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(run(), error => {
            const message = String(error);
            assert.ok(message.length < 256);
            assert.ok(!message.includes(secret));
            assert.match(message, /invalid-identity-history/);
            messages.push(message);
            return true;
          });
          assert.deepEqual(writes, []);
        }
        assert.equal(messages[0], messages[1]);
        assert.deepEqual(tables, before);
      }
      Object.assign(priorRevision, validRevision);
      Object.assign(priorHistory, validHistory);
      row.version = 3;
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2);
      assert.deepEqual(writes, []);
    }
  });

  it('validates future retirement evidence while preserving save gaps and valid state', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const actor = { id: 'b11-admin' };
    const secret = 'B11-FUTURE-SECRET';
    const retireEvent = (
      operationId: string,
      expected: number,
      resulting: number,
      expectedActive: number,
      operation: 'retire' | 'unretire'
    ): any => ({
      id: `rdh_${operationId.replace(/-/g, '')}`,
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation,
      operationId,
      expectedIdentityVersion: expected,
      resultingIdentityVersion: resulting,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: expectedActive,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: '2026-09-05T00:00:00.000Z',
      actor,
      note: operation === 'retire' ? 'Retired' : 'Restored',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: operation === 'retire' ? 'added' : 'removed' }],
      redactions: [],
      truncated: false,
    });
    // Legitimate save gap: publication 0->1, draft saves advance to version 3
    // with no retirement history. Valid future retire 3->4 stays a continuation.
    Object.assign(row, { version: 3 });
    tables.RecordDefinitionHistory.push(retireEvent('33333333-3333-4333-8333-333333333333', 3, 4, 1, 'retire'));
    const withHistories = () => ({
      recordTypes: async () => structuredClone(tables.RecordType),
      workflowSteps: async () => {
        throw Error('must not read legacy steps for managed identities');
      },
      histories: async (recordTypeId: string) =>
        structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
    });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.equal(
      (await new RecordDefinitionMigrationService(withHistories() as any, seedAuthority).preflight()).skipped,
      2
    );
    assert.deepEqual(writes, []);
    const checkFutureReject = async (label: string, mutate: () => void, restore: () => void) => {
      mutate();
      for (const target of [service, new RecordDefinitionMigrationService(withHistories() as any, seedAuthority)]) {
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 256, label);
              assert.ok(!message.includes(secret), label);
              assert.match(message, /invalid-identity-history/, label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
      restore();
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2);
      assert.deepEqual(writes, []);
    };
    // Impossible revision in the future: references a nonexistent active revision.
    const futureRetire = tables.RecordDefinitionHistory.find((entry: any) => entry.operation === 'retire');
    const validExpectedActive = futureRetire.expectedActiveRevisionNumber;
    await checkFutureReject(
      'future-impossible-revision',
      () => {
        futureRetire.expectedActiveRevisionNumber = 99;
      },
      () => {
        futureRetire.expectedActiveRevisionNumber = validExpectedActive;
      }
    );
    // Lifecycle-state violation in the future: retire-retire pair without unretire.
    const extraRetire = retireEvent('44444444-4444-4444-8444-444444444444', 4, 5, 1, 'retire');
    await checkFutureReject(
      'future-retire-retire',
      () => {
        tables.RecordDefinitionHistory.push(extraRetire);
      },
      () => {
        tables.RecordDefinitionHistory.splice(tables.RecordDefinitionHistory.indexOf(extraRetire), 1);
      }
    );
    // Lifecycle-state violation in the future: unretire without a preceding retire.
    const validOp = futureRetire.operation;
    const validChanges = structuredClone(futureRetire.changes);
    await checkFutureReject(
      'future-unretire-without-retire',
      () => {
        futureRetire.operation = 'unretire';
        futureRetire.changes = [{ path: '/retirement', kind: 'removed' }];
      },
      () => {
        futureRetire.operation = validOp;
        futureRetire.changes = validChanges;
      }
    );
  });

  it('rejects extra publication/save/bootstrap/migration rows with full provenance checks', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const secret = 'B11-EXTRA-SECRET';
    Object.assign(row, { version: 2 });
    const base = structuredClone(tables.RecordDefinitionHistory[0]);
    const extraId = (op: string) => `rdh_${op.replace(/-/g, '')}`;
    const cases: { label: string; mutate: (entry: any) => void }[] = [
      {
        label: 'extra-negative-versions',
        mutate: entry => {
          entry.expectedIdentityVersion = -2;
          entry.resultingIdentityVersion = -1;
        },
      },
      {
        label: 'extra-out-of-range-revision',
        mutate: entry => {
          entry.revisionNumber = 9999;
          entry.expectedActiveRevisionNumber = 9998;
        },
      },
      {
        label: 'extra-missing-provenance-source',
        mutate: entry => {
          entry.source = null;
        },
      },
      {
        label: 'extra-missing-provenance-actor',
        mutate: entry => {
          entry.actor = null;
        },
      },
      {
        label: 'extra-missing-provenance-validation',
        mutate: entry => {
          entry.validation = null;
        },
      },
      {
        label: 'extra-object-timestamp',
        mutate: entry => {
          entry.occurredAt = { password: secret };
        },
      },
      {
        label: 'extra-invalid-operation',
        mutate: entry => {
          entry.operation = 'save';
        },
      },
    ];
    for (const { label, mutate } of cases) {
      const extra = structuredClone(base);
      extra.id = extraId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      extra.operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      extra.expectedIdentityVersion = 1;
      extra.resultingIdentityVersion = 2;
      extra.revisionNumber = 1;
      mutate(extra);
      tables.RecordDefinitionHistory.push(extra);
      const cliParity = new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async () => {
            throw Error('must not read legacy steps for managed identities');
          },
          histories: async (recordTypeId: string) =>
            structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
        } as any,
        seedAuthority
      );
      for (const target of [service, cliParity]) {
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, label);
              assert.ok(!message.includes(secret), label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
      tables.RecordDefinitionHistory.pop();
    }
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });

  it('binds prior migration step count to definition stages with exact envelope', async () => {
    await service.migrate();
    const row = tables.RecordType[0];
    const revision = tables.RecordDefinitionRevision[0];
    const history = tables.RecordDefinitionHistory[0];
    const secret = 'B11-MIGRATION-STEP-SECRET';
    const stages = (revision.definition as any).stages.length;
    assert.ok(stages >= 1);
    const validNote = history.note as string;
    const parsed = JSON.parse(validNote);
    assert.equal(parsed.workflowSteps, stages);
    const withHistories = () =>
      new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async () => {
            throw Error('must not read legacy steps for managed identities');
          },
          histories: async (recordTypeId: string) =>
            structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
        } as any,
        seedAuthority
      );
    // Current path already covered; forge the stored prior note with a
    // mismatched step count, an extra field and a forged envelope.
    const forgeries: { label: string; note: string }[] = [
      {
        label: 'migration-step-count-mismatch',
        note: JSON.stringify({ migration: parsed.migration, workflowSteps: stages + 1, warnings: parsed.warnings }),
      },
      {
        label: 'migration-extra-field',
        note: JSON.stringify({
          migration: parsed.migration,
          workflowSteps: stages,
          warnings: parsed.warnings,
          extra: secret,
        }),
      },
      {
        label: 'migration-forged-envelope',
        note: JSON.stringify({ migration: 'forged', workflowSteps: stages, warnings: parsed.warnings }),
      },
    ];
    for (const { label, note } of forgeries) {
      history.note = note;
      for (const target of [service, withHistories()]) {
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, label);
              assert.ok(!message.includes(secret), label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
      history.note = validNote;
    }
    writes.length = 0;
    const restored = await service.preflight();
    assert.equal(restored.skipped, 0);
    assert.equal(restored.identities, 2);
    assert.deepEqual(writes, []);
  });

  it('accepts valid BSON Date occurredAt while rejecting malformed dates', async () => {
    await service.migrate();
    makePublished();
    const secret = 'B11-DATE-SECRET';
    // Valid BSON/native Date round-trip is normalized safely.
    for (const history of tables.RecordDefinitionHistory) history.occurredAt = new Date(history.occurredAt);
    for (const revision of tables.RecordDefinitionRevision) revision.publishedAt = new Date(revision.publishedAt);
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(writes, []);
    const validOccurred = tables.RecordDefinitionHistory[0].occurredAt;
    const checkRejectDate = async (label: string, value: unknown) => {
      const before = structuredClone(tables);
      (tables.RecordDefinitionHistory[0] as any).occurredAt = value;
      const cliParity = new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async () => {
            throw Error('must not read legacy steps for managed identities');
          },
          histories: async (recordTypeId: string) =>
            structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
        } as any,
        seedAuthority
      );
      for (const target of [service, cliParity]) {
        writes.length = 0;
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(run(), error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            return true;
          });
          assert.deepEqual(writes, [], label);
        }
      }
      tables.RecordDefinitionHistory[0].occurredAt = validOccurred;
      assert.deepEqual(tables.RecordDefinitionHistory[0].occurredAt, validOccurred, label);
      void before;
    };
    await checkRejectDate('malformed-invalid-date', new Date(NaN));
    const forged = new Date('2026-09-05T00:00:00.000Z');
    (forged as any).password = secret;
    await checkRejectDate('malformed-date-extra-prop', forged);
    await checkRejectDate('malformed-object-timestamp', { password: secret });
    await checkRejectDate('malformed-non-json-timestamp', 0);
    await checkRejectDate('malformed-unbounded-timestamp', `x`.repeat(100));
  });

  it('rejects forged initial-migration history before any writes with service/CLI parity', async () => {
    const secret = 'B11-INITIAL-SECRET';
    const baseForged: any = {
      id: `rdh_${'f'.repeat(32)}`,
      schemaVersion: 1,
      branding: 'brand-a',
      recordType: 'legacy-a',
      recordTypeId: 'rti_different',
      recordTypeKey: 'dataset',
      operation: 'publish',
      operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      expectedIdentityVersion: -2,
      resultingIdentityVersion: -1,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: null,
      revision: 'rdr_forged',
      revisionNumber: 1,
      canonicalHash: `sha256:${'0'.repeat(64)}`,
      source: null,
      occurredAt: { password: secret },
      actor: null,
      validation: null,
      impact: null,
      note: '',
      changes: [],
      redactions: [],
      truncated: false,
    };
    const forgedByOperation: { label: string; operation: string; extra: (entry: any) => void }[] = [
      { label: 'forged-publish', operation: 'publish', extra: () => {} },
      { label: 'forged-save', operation: 'save', extra: () => {} },
      { label: 'forged-bootstrap', operation: 'bootstrap', extra: () => {} },
      { label: 'forged-migration', operation: 'migration', extra: () => {} },
      {
        label: 'forged-retire',
        operation: 'retire',
        extra: entry => {
          entry.revision = null;
          entry.revisionNumber = null;
          entry.canonicalHash = null;
          entry.expectedActiveRevisionNumber = 1;
          entry.actor = { id: 'admin', displayName: { password: secret }, extra: true };
          entry.changes = [{ path: '/retirement', kind: 'added' }];
        },
      },
      {
        label: 'forged-unretire',
        operation: 'unretire',
        extra: entry => {
          entry.revision = null;
          entry.revisionNumber = null;
          entry.canonicalHash = null;
          entry.expectedActiveRevisionNumber = 1;
          entry.actor = { id: 'admin', displayName: { password: secret }, extra: true };
          entry.changes = [{ path: '/retirement', kind: 'removed' }];
        },
      },
    ];
    let datastoreReads = 0;
    const countingDatastore = globals.RecordType.getDatastore;
    globals.RecordType.getDatastore = () => {
      datastoreReads++;
      return countingDatastore();
    };
    for (const { label, operation, extra } of forgedByOperation) {
      const forged = structuredClone(baseForged);
      forged.operation = operation;
      if (operation === 'publish' || operation === 'save') forged.source = { operation, sourceRevisionNumber: null };
      extra(forged);
      tables.RecordDefinitionHistory.push(forged);
      const cliParity = new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async (id: string) => [
            {
              name: 'draft',
              recordType: id,
              starting: true,
              config: {
                workflow: { stage: 'draft', stageLabel: id },
                form: 'dataset-form',
                authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
              },
            },
          ],
          histories: async (recordTypeId: string) =>
            structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
        } as any,
        seedAuthority
      );
      for (const target of [service, cliParity]) {
        const before = structuredClone(tables);
        writes.length = 0;
        datastoreReads = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, label);
              assert.ok(!message.includes(secret), label);
              assert.ok(!message.includes('PASSWORD'), label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
          assert.equal(datastoreReads, 0, label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
      tables.RecordDefinitionHistory.pop();
    }
    globals.RecordType.getDatastore = countingDatastore;
    writes.length = 0;
    const beforeClean = structuredClone(tables);
    const report = await service.preflight();
    assert.equal(report.identities, 2);
    assert.deepEqual(writes, []);
    assert.deepEqual(tables, beforeClean);
    // Legitimate migration recovery artifact stays accepted: migrate, then
    // deactivate one identity while retaining its revision/history.
    await service.migrate();
    writes.length = 0;
    const activeRow = tables.RecordType[0];
    const revisionId = activeRow.activeRevisionId as string;
    const storedRevision = tables.RecordDefinitionRevision.find((row: any) => row.id === revisionId);
    const storedHistory = tables.RecordDefinitionHistory.find((row: any) => row.recordType === activeRow.id);
    assert.ok(storedRevision);
    assert.ok(storedHistory);
    Object.assign(activeRow, { activeRevisionId: null, activeRevisionNumber: null, version: 0, definitionId: '' });
    delete activeRow.schemaVersion;
    const recoveryParity = new RecordDefinitionMigrationService(
      {
        recordTypes: async () => structuredClone(tables.RecordType),
        workflowSteps: async (id: string) => [
          {
            name: 'draft',
            recordType: id,
            starting: true,
            config: {
              workflow: { stage: 'draft', stageLabel: id },
              form: 'dataset-form',
              authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
            },
          },
        ],
        histories: async (recordTypeId: string) =>
          structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
      } as any,
      seedAuthority
    );
    for (const target of [service, recoveryParity]) {
      writes.length = 0;
      const recoveryReport = await target.preflight();
      assert.equal(recoveryReport.identities, 2);
      assert.deepEqual(writes, []);
    }
  });

  it('applies the strict actor contract to future retire/unretire with service/CLI parity', async () => {
    await service.migrate();
    makePublished();
    const row = tables.RecordType[0];
    const secret = 'B11-ACTOR-SECRET';
    const buildFuture = (actor: unknown): any => ({
      id: `rdh_${'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.replace(/-/g, '')}`,
      schemaVersion: 1,
      branding: row.branding,
      recordType: row.id,
      recordTypeId: row.definitionId,
      recordTypeKey: row.name,
      operation: 'retire',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: '2026-09-06T00:00:00.000Z',
      actor,
      note: 'Retired',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'added' }],
      redactions: [],
      truncated: false,
    });
    const withHistories = () =>
      new RecordDefinitionMigrationService(
        {
          recordTypes: async () => structuredClone(tables.RecordType),
          workflowSteps: async () => {
            throw Error('must not read legacy steps for managed identities');
          },
          histories: async (recordTypeId: string) =>
            structuredClone(tables.RecordDefinitionHistory.filter((entry: any) => entry.recordType === recordTypeId)),
        } as any,
        seedAuthority
      );
    // Valid actors stay accepted, including id-only and id+displayName.
    for (const actor of [{ id: 'admin' }, { id: 'b11-admin', displayName: 'Portal administrator' }]) {
      tables.RecordDefinitionHistory.push(buildFuture(structuredClone(actor)));
      writes.length = 0;
      assert.equal((await service.preflight()).skipped, 2);
      assert.equal((await withHistories().preflight()).skipped, 2);
      assert.deepEqual(await service.migrate(), await service.preflight());
      assert.deepEqual(writes, []);
      tables.RecordDefinitionHistory.pop();
    }
    const forgedActors: { label: string; actor: unknown }[] = [
      {
        label: 'actor-displayname-object-secret',
        actor: { id: 'admin', displayName: { password: secret }, extra: true },
      },
      { label: 'actor-extra-field', actor: { id: 'admin', extra: true } },
      { label: 'actor-displayname-number', actor: { id: 'admin', displayName: 0 } },
      { label: 'actor-displayname-empty', actor: { id: 'admin', displayName: '   ' } },
      { label: 'actor-displayname-control', actor: { id: 'admin', displayName: 'a\u0000b' } },
      { label: 'actor-id-empty', actor: { id: '' } },
      { label: 'actor-id-pattern', actor: { id: 'bad id!' } },
      { label: 'actor-id-too-long', actor: { id: 'a'.repeat(129) } },
      { label: 'actor-missing-id', actor: { displayName: 'Admin' } },
      { label: 'actor-null', actor: null },
    ];
    for (const { label, actor } of forgedActors) {
      const future = buildFuture(actor);
      tables.RecordDefinitionHistory.push(future);
      for (const target of [service, withHistories()]) {
        const before = structuredClone(tables);
        writes.length = 0;
        const messages: string[] = [];
        for (const run of [() => target.preflight(), () => target.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, label);
              assert.ok(!message.includes(secret), label);
              messages.push(message);
              return true;
            },
            label
          );
          assert.deepEqual(writes, [], label);
        }
        assert.equal(messages[0], messages[1], label);
        assert.deepEqual(tables, before, label);
      }
      tables.RecordDefinitionHistory.pop();
    }
    // Historical retire/unretire rows enforce the same strict contract. A valid
    // historical retire stays accepted; the forged actor fails closed.
    const validRetire = buildFuture({ id: 'b11-admin' });
    tables.RecordDefinitionHistory.push(validRetire);
    Object.assign(row, {
      version: 2,
      retiredAt: '2026-09-06T00:00:00.000Z',
      retiredBy: { id: 'b11-admin' },
      retirementReason: 'Retired',
    });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.equal((await withHistories().preflight()).skipped, 2);
    assert.deepEqual(writes, []);
    const storedValidRetire = structuredClone(validRetire);
    validRetire.actor = { id: 'admin', displayName: { password: secret }, extra: true };
    for (const target of [service, withHistories()]) {
      const before = structuredClone(tables);
      writes.length = 0;
      for (const run of [() => target.preflight(), () => target.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, 'historical-retire-actor');
            assert.ok(!message.includes(secret), 'historical-retire-actor');
            return true;
          },
          'historical-retire-actor'
        );
        assert.deepEqual(writes, [], 'historical-retire-actor');
      }
      assert.deepEqual(tables, before, 'historical-retire-actor');
    }
    Object.assign(validRetire, storedValidRetire);
    // Historical unretire with the forged contract fails closed; valid passes.
    const unretireId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const buildUnretire = (actor: unknown): any => ({
      ...storedValidRetire,
      id: `rdh_${unretireId.replace(/-/g, '')}`,
      operationId: unretireId,
      operation: 'unretire',
      expectedIdentityVersion: 2,
      resultingIdentityVersion: 3,
      occurredAt: '2026-09-07T00:00:00.000Z',
      actor,
      note: 'Restored',
      changes: [{ path: '/retirement', kind: 'removed' }],
    });
    tables.RecordDefinitionHistory.push(buildUnretire({ id: 'b11-admin' }));
    Object.assign(row, { version: 3, retiredAt: null, retiredBy: null, retirementReason: null });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
    tables.RecordDefinitionHistory.pop();
    tables.RecordDefinitionHistory.push(buildUnretire({ id: 'admin', displayName: { password: secret }, extra: true }));
    for (const target of [service, withHistories()]) {
      const before = structuredClone(tables);
      writes.length = 0;
      for (const run of [() => target.preflight(), () => target.migrate()]) {
        await assert.rejects(run(), error => !String(error).includes(secret), 'historical-unretire-actor');
        assert.deepEqual(writes, [], 'historical-unretire-actor');
      }
      assert.deepEqual(tables, before, 'historical-unretire-actor');
    }
    tables.RecordDefinitionHistory.pop();
    tables.RecordDefinitionHistory.pop();
    Object.assign(row, { version: 1, retiredAt: null, retiredBy: null, retirementReason: null });
    writes.length = 0;
    assert.equal((await service.preflight()).skipped, 2);
    assert.deepEqual(writes, []);
  });
});
