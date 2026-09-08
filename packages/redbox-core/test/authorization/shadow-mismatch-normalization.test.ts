import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'mocha';
import { cloneDeep } from 'lodash';
import { AuthorizationShadowMismatchWLDef } from '../../src/waterline-models/AuthorizationShadowMismatch';
import { ALL_SHADOW_CLASSIFICATION_FIXTURES } from '../fixtures/authorization-shadow-classification.fixtures';

interface MismatchModel {
  create(row: Record<string, unknown>): { fetch(): Promise<Record<string, unknown>> };
  updateOne(criteria: object): { set(values: object): Promise<Record<string, unknown>> };
  findOne(criteria: object): Promise<Record<string, unknown>>;
  count(criteria: object): Promise<number>;
}

interface MismatchOrm {
  registerModel(model: unknown): void;
  initialize(
    options: object,
    done: (error: Error | undefined, ontology: { collections: Record<string, MismatchModel> }) => void
  ): void;
  teardown(done: (error?: Error) => void): void;
}

describe('production shadow mismatch Waterline normalization and lifecycle', () => {
  let orm: MismatchOrm;
  let model: MismatchModel;
  const normalizedClassifications: unknown[] = [];
  let sequence = 0;
  const observation = () => ({
    fingerprint: (++sequence).toString(16).padStart(64, '0'),
    routeId: '  GET /records  ',
    legacyOutcome: 'allow',
    scopeOutcome: 'deny',
    reasonCode: 'scope-missing',
    principalCategory: 'authenticated',
    count: 1,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  });

  before(async () => {
    const Waterline = require('waterline') as {
      new (): MismatchOrm;
      Collection: { extend(definition: object): unknown };
    };
    const normalizeModel = require('sails-hook-orm/lib/validate-model-def') as (
      definition: object,
      identity: string,
      hook: object,
      app: object
    ) => object;
    orm = new Waterline();
    const definition = cloneDeep(AuthorizationShadowMismatchWLDef);
    orm.registerModel(
      Waterline.Collection.extend(
        normalizeModel(
          {
            ...definition,
            datastore: 'default',
            // Only the adapter's primary key differs; all production attributes
            // and lifecycle hooks pass through Waterline's real query pipeline.
            attributes: { ...definition.attributes, id: { type: 'number', autoMigrations: { autoIncrement: true } } },
            beforeCreate(record: Record<string, unknown>, proceed: (error?: Error) => void) {
              normalizedClassifications.push(record.resolutionClassification);
              assert.ok(definition.beforeCreate);
              definition.beforeCreate(record, proceed);
            },
          },
          definition.identity,
          { normalizedDSConfigs: { default: { adapter: 'sails-disk' } } },
          {
            config: { models: {} },
            log: sails.log,
          }
        )
      )
    );
    model = await new Promise<MismatchModel>((resolve, reject) => {
      orm.initialize(
        {
          adapters: { 'sails-disk': require('sails-disk') },
          datastores: { default: { adapter: 'sails-disk', inMemoryOnly: true } },
        },
        (error, ontology) => (error ? reject(error) : resolve(ontology.collections[definition.identity]))
      );
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => orm.teardown(error => (error ? reject(error) : resolve())));
  });

  it('creates an unclassified observation after Waterline supplies its empty-string default', async () => {
    const created = await model.create(observation()).fetch();
    assert.equal(normalizedClassifications.at(-1), '', 'the lifecycle receives the actual Waterline default');
    const stored = await model.findOne({ id: created.id });
    assert.equal(stored.routeId, 'GET /records', 'the production create lifecycle ran');
    assert.equal(stored.resolutionClassification, undefined);
    assert.equal(stored.resolvedAt, undefined);
    assert.equal(await model.count({ fingerprint: created.fingerprint }), 1);
    const updated = await model.updateOne({ id: created.id }).set({ sampleRequestId: '  request-2  ' });
    assert.equal(updated.sampleRequestId, 'request-2', 'the production update lifecycle ran');
    assert.equal(updated.resolutionClassification, undefined);
    await assert.rejects(model.updateOne({ id: created.id }).set({ fingerprint: 'b'.repeat(64) }), /immutable/);
  });

  it('accepts the taxonomy and legacy aliases on normalized creates and updates', async () => {
    for (const { classification } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
      const created = await model.create({ ...observation(), resolutionClassification: classification }).fetch();
      assert.equal(created.resolutionClassification, classification);
      const unclassified = await model.create(observation()).fetch();
      const updated = await model.updateOne({ id: unclassified.id }).set({ resolutionClassification: classification });
      assert.equal(updated.resolutionClassification, classification);
    }
  });

  it('rejects arbitrary classifications on normalized creates and updates without changing stored evidence', async () => {
    const created = await model.create(observation()).fetch();
    for (const resolutionClassification of ['free-text-triage', 'Needs-Investigation', '   ']) {
      await assert.rejects(
        model.create({ ...observation(), resolutionClassification }).fetch(),
        /resolutionClassification/
      );
      await assert.rejects(
        model.updateOne({ id: created.id }).set({ resolutionClassification }),
        /resolutionClassification/
      );
    }
    assert.equal((await model.findOne({ id: created.id })).resolutionClassification, undefined);
  });
});
