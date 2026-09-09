import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type PublishableRecordDefinitionAggregateDto,
} from '@researchdatabox/sails-ng-common';
import { deriveStableActionSecretSlotId, parseActionBindingId } from '../../src/action-registry';
import { generateModelShims } from '../../src/loader';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
} from '../../src/record-workflow-administration';
import { ActionSecretWLDef } from '../../src/waterline-models/ActionSecret';
import { RecordDefinitionDraftWLDef } from '../../src/waterline-models/RecordDefinitionDraft';
import { RecordDefinitionDraftOperationAckWLDef } from '../../src/waterline-models/RecordDefinitionDraftOperationAck';
import { RecordDefinitionHistoryWLDef } from '../../src/waterline-models/RecordDefinitionHistory';
import { RecordDefinitionLifecycleOperationAckWLDef } from '../../src/waterline-models/RecordDefinitionLifecycleOperationAck';
import { RecordDefinitionRevisionWLDef } from '../../src/waterline-models/RecordDefinitionRevision';
import { RecordTypeWLDef } from '../../src/waterline-models/RecordType';
import { WaterlineModels } from '../../src/waterline-models';
import type { WaterlineModelDefinition } from '../../src/decorators';
import type { RuntimeRecord } from '../../src/runtimeValues';

let expect: Chai.ExpectStatic;

type HookName = 'beforeCreate' | 'beforeUpdate' | 'beforeDestroy';

function runHook(
  definition: WaterlineModelDefinition,
  hookName: HookName,
  record: RuntimeRecord
): { readonly record: RuntimeRecord; readonly error?: Error } {
  let called = false;
  let error: Error | undefined;
  const hook = definition[hookName];
  if (hook === undefined) {
    throw new Error(`${definition.identity}.${hookName} is missing`);
  }
  hook(record, caught => {
    called = true;
    error = caught;
  });
  if (!called) {
    throw new Error(`${definition.identity}.${hookName} did not complete synchronously`);
  }
  return { record, error };
}

function hasIndex(definition: WaterlineModelDefinition, attributes: Record<string, number>, unique?: boolean): boolean {
  return (definition.indexes ?? []).some(index => {
    const candidate = index as {
      attributes?: Record<string, number>;
      unique?: boolean;
      options?: { unique?: boolean };
    };
    return (
      JSON.stringify(candidate.attributes) === JSON.stringify(attributes) &&
      (unique === undefined || candidate.unique === unique || candidate.options?.unique === unique)
    );
  });
}

const brandId = parseRecordDefinitionBrandId('brand-a');
const recordTypeKey = parseRecordDefinitionKey('dataRecord');
const identity = { brandId, recordTypeKey };
const recordTypeId = deriveRecordDefinitionId(identity);
const draftId = deriveRecordDefinitionDraftId(identity);
const revisionId = deriveRecordDefinitionRevisionId(identity, 1);
const actor = { id: 'admin-1', displayName: 'Portal administrator' };
const timestamp = '2026-09-01T10:00:00.000Z';
const canonicalHash = parseRecordDefinitionCanonicalHash(`sha256:${'a'.repeat(64)}`);
const bindingId = parseActionBindingId(`actb_${'b'.repeat(32)}`);
const secretId = deriveStableActionSecretSlotId({ brandId, recordTypeKey, bindingId, parameterName: 'token' });

function draftDefinition(): DraftRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'draft-incomplete',
    recordType: { labels: { name: 'Data record' } },
    stages: [],
    transitions: [],
    actionBindings: [],
  };
}

function publishedDefinition(): PublishableRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'publishable',
    recordType: {
      labels: { name: 'Data record', namePlural: 'Data records' },
      searchable: true,
      searchFilters: [],
      relationships: [],
      transferResponsibility: { fields: [], roleRules: [] },
      validation: { mode: 'shadow', operations: [] },
      concurrency: { mode: 'strict' },
    },
    stages: [
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: parseWorkflowStageKey('draft'),
        label: 'Draft',
        formReference: 'dataRecord',
        viewRoles: ['Admin'],
        editRoles: ['Admin'],
        displayOrder: 0,
        starting: true,
        terminal: true,
        validationOverrides: [],
      },
    ],
    transitions: [],
    actionBindings: [],
  };
}

function draftRow(): RuntimeRecord {
  return {
    id: draftId,
    branding: brandId,
    recordType: 'waterline-record-type-id',
    recordTypeId,
    recordTypeKey,
    version: 0,
    baseRevisionId: revisionId,
    baseRevisionNumber: 1,
    definition: draftDefinition(),
    validation: null,
    createdBy: actor,
    updatedBy: actor,
  };
}

function revisionRow(): RuntimeRecord {
  return {
    id: revisionId,
    branding: brandId,
    recordType: 'waterline-record-type-id',
    recordTypeId,
    recordTypeKey,
    revisionNumber: 1,
    canonicalHash,
    definition: publishedDefinition(),
    actionContracts: [],
    source: { operation: 'publish', sourceRevisionNumber: null },
    publishedAt: timestamp,
    publishedBy: actor,
    createdBy: actor,
  };
}

function validationReport(reportBrandId: string = brandId): Record<string, unknown> {
  return {
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    brandId: reportBrandId,
    recordTypeKey,
    scope: 'publication',
    status: 'valid',
    definitionState: 'publishable',
    validatedDraftVersion: 1,
    validatedActiveRevisionNumber: null,
    issues: [],
    redactions: [],
    truncated: false,
  };
}

describe('record-definition Waterline models', function () {
  it('uses Sails 1-compatible defaults throughout the feature models', function () {
    for (const definition of [
      ActionSecretWLDef,
      RecordDefinitionDraftWLDef,
      RecordDefinitionDraftOperationAckWLDef,
      RecordDefinitionHistoryWLDef,
      RecordDefinitionLifecycleOperationAckWLDef,
      RecordDefinitionRevisionWLDef,
      RecordTypeWLDef,
    ]) {
      expect(definition).not.to.have.property('autoCreatedAt');
      expect(definition).not.to.have.property('autoUpdatedAt');
      for (const attribute of Object.values(definition.attributes)) {
        expect(attribute.required === true && Object.hasOwn(attribute, 'defaultsTo')).to.equal(false);
      }
    }
  });

  this.timeout(30_000);

  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('extends the stable RecordType identity with canonical pointers, lifecycle state, and indexes', function () {
    const result = runHook(RecordTypeWLDef, 'beforeCreate', {
      branding: brandId,
      name: recordTypeKey,
    });

    expect(result.error).to.be.undefined;
    expect(result.record).to.include({
      key: `${brandId}_${recordTypeKey}`,
      definitionId: recordTypeId,
    });
    const waterlineDefault = runHook(RecordTypeWLDef, 'beforeCreate', {
      branding: brandId,
      name: recordTypeKey,
      definitionId: '',
    });
    expect(waterlineDefault.error).to.be.undefined;
    expect(waterlineDefault.record.definitionId).to.equal(recordTypeId);
    expect(RecordTypeWLDef.attributes.activeRevisionId).to.include({ model: 'recorddefinitionrevision' });
    expect(RecordTypeWLDef.attributes.draftId).to.include({ model: 'recorddefinitiondraft' });
    expect(RecordTypeWLDef.attributes.version).to.include({ defaultsTo: 0 });
    expect(RecordTypeWLDef.attributes.definitionLifecycleToken).to.include({ type: 'string', allowNull: true });
    expect(RecordTypeWLDef.attributes.definitionLifecycleOperation).to.include({ type: 'json' });
    expect(hasIndex(RecordTypeWLDef, { branding: 1, name: 1 }, true)).to.equal(true);
    expect(hasIndex(RecordTypeWLDef, { definitionId: 1 }, true)).to.equal(true);
    expect(hasIndex(RecordTypeWLDef, { activeRevisionId: 1 })).to.equal(true);
    expect(runHook(RecordTypeWLDef, 'beforeUpdate', { name: 'renamed' }).error?.message).to.match(/immutable/);
    expect(runHook(RecordTypeWLDef, 'beforeUpdate', { version: 2 }).error).to.be.undefined;
  });

  it('enforces one brand-owned shared draft and exact B01 draft/base-revision identities', function () {
    expect(RecordDefinitionDraftWLDef.dontUseObjectIds).to.equal(true);
    expect(runHook(RecordDefinitionDraftWLDef, 'beforeCreate', draftRow()).error).to.be.undefined;
    expect(hasIndex(RecordDefinitionDraftWLDef, { recordType: 1 }, true)).to.equal(true);
    expect(hasIndex(RecordDefinitionDraftWLDef, { branding: 1, recordTypeKey: 1 }, true)).to.equal(true);
    expect(RecordDefinitionDraftWLDef.attributes.recordType).to.include({ model: 'recordtype', required: true });
    expect(RecordDefinitionDraftWLDef.attributes.branding).to.include({ model: 'brandingconfig', required: true });

    expect(
      runHook(RecordDefinitionDraftWLDef, 'beforeCreate', {
        ...draftRow(),
        recordTypeId: deriveRecordDefinitionId({ brandId: 'brand-b', recordTypeKey }),
      }).error?.message
    ).to.match(/does not own/);
    expect(
      runHook(RecordDefinitionDraftWLDef, 'beforeCreate', {
        ...draftRow(),
        baseRevisionId: deriveRecordDefinitionRevisionId(identity, 2),
      }).error?.message
    ).to.match(/baseRevisionId is not canonical/);
    expect(
      runHook(RecordDefinitionDraftWLDef, 'beforeCreate', {
        ...draftRow(),
        validation: validationReport('brand-b'),
      }).error?.message
    ).to.match(/validation does not belong/);
    expect(runHook(RecordDefinitionDraftWLDef, 'beforeUpdate', { recordTypeKey: 'other' }).error?.message).to.match(
      /immutable/
    );
    expect(runHook(RecordDefinitionDraftWLDef, 'beforeUpdate', { version: 2 }).error).to.be.undefined;
  });

  it('stores token-scoped lifecycle acknowledgements with unique operation coordinates and TTL cleanup', function () {
    expect(RecordDefinitionDraftOperationAckWLDef.dontUseObjectIds).to.equal(true);
    expect(RecordDefinitionDraftOperationAckWLDef.attributes.expiresAt).to.include({
      type: 'ref',
      columnType: 'datetime',
      required: true,
    });
    expect(RecordDefinitionDraftOperationAckWLDef.attributes.recordType).to.include({
      model: 'recordtype',
      required: true,
    });
    expect(RecordDefinitionDraftOperationAckWLDef.attributes.branding).to.include({
      model: 'brandingconfig',
      required: true,
    });
    expect(hasIndex(RecordDefinitionDraftOperationAckWLDef, { recordType: 1, identityVersion: 1 }, true)).to.equal(
      true
    );
    expect(
      (RecordDefinitionDraftOperationAckWLDef.indexes ?? []).some(
        index =>
          JSON.stringify(index) === JSON.stringify({ attributes: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } })
      )
    ).to.equal(true);

    const lifecycleAck = {
      id: '01234567-89ab-4cde-8fab-0123456789ab',
      branding: brandId,
      recordType: 'waterline-record-type-id',
      recordTypeId,
      recordTypeKey,
      kind: 'publish',
      identityVersion: 1,
      historyId: 'rdh_0123456789abcdef0123456789abcdef',
      revisionNumber: 1,
      operation: {
        token: '01234567-89ab-4cde-8fab-0123456789ab',
        kind: 'publish',
        phase: 'activated',
        expectedIdentityVersion: 0,
        identityVersion: 1,
        expectedDraftVersion: 1,
        expectedActiveRevisionNumber: null,
        historyId: 'rdh_0123456789abcdef0123456789abcdef',
        occurredAt: timestamp,
        actor,
        targetRevisionId: revisionId,
        targetRevisionNumber: 1,
        canonicalHash,
        source: { operation: 'publish', sourceRevisionNumber: null },
      },
      identity: {
        schemaVersion: 1,
        id: recordTypeId,
        brandId,
        key: recordTypeKey,
        deployment: { packageType: 'dataset', searchCore: 'records' },
        version: 1,
        activeRevision: { id: revisionId, revisionNumber: 1, canonicalHash },
        draft: null,
        retirement: null,
      },
      expiresAt: new Date('2026-09-11T08:00:00.000Z'),
    };
    expect(runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeCreate', lifecycleAck).error).to.be.undefined;
    expect(
      runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeCreate', {
        ...lifecycleAck,
        identity: { ...lifecycleAck.identity, brandId: 'brand-b' },
      }).error?.message
    ).to.match(/does not match/);
    expect(
      runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeCreate', {
        ...lifecycleAck,
        operation: { ...lifecycleAck.operation, historyId: 'rdh_deadbeefdeadbeefdeadbeefdeadbeef' },
      }).error?.message
    ).to.match(/does not prove/);
    expect(
      runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeCreate', {
        ...lifecycleAck,
        operation: { ...lifecycleAck.operation, phase: 'reserved' },
      }).error?.message
    ).to.match(/does not prove/);
    expect(runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeUpdate', {}).error?.message).to.match(
      /cannot be updated/
    );
    expect(runHook(RecordDefinitionLifecycleOperationAckWLDef, 'beforeDestroy', {}).error?.message).to.match(
      /cannot be deleted/
    );
    expect(hasIndex(RecordDefinitionLifecycleOperationAckWLDef, { recordType: 1, identityVersion: 1 }, true)).to.equal(
      true
    );
    expect(
      (RecordDefinitionLifecycleOperationAckWLDef.indexes ?? []).some(
        index =>
          JSON.stringify(index) === JSON.stringify({ attributes: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } })
      )
    ).to.equal(true);
  });

  it('stores a coherent aggregate revision and makes every revision row immutable', function () {
    expect(RecordDefinitionRevisionWLDef.dontUseObjectIds).to.equal(true);
    expect(RecordDefinitionRevisionWLDef).not.to.have.property('autoUpdatedAt');
    expect(runHook(RecordDefinitionRevisionWLDef, 'beforeCreate', revisionRow()).error).to.be.undefined;
    expect(hasIndex(RecordDefinitionRevisionWLDef, { recordType: 1, revisionNumber: 1 }, true)).to.equal(true);
    expect(hasIndex(RecordDefinitionRevisionWLDef, { recordType: 1, canonicalHash: 1 })).to.equal(true);
    expect(RecordDefinitionRevisionWLDef.attributes.definition).to.include({ type: 'json', required: true });
    expect(
      (RecordDefinitionRevisionWLDef.attributes.definition.custom as (value: unknown) => boolean)(publishedDefinition())
    ).to.equal(true);
    expect(
      (RecordDefinitionRevisionWLDef.attributes.definition.custom as (value: unknown) => boolean)(draftDefinition())
    ).to.equal(false);

    expect(
      runHook(RecordDefinitionRevisionWLDef, 'beforeCreate', {
        ...revisionRow(),
        id: deriveRecordDefinitionRevisionId(identity, 2),
      }).error?.message
    ).to.match(/not canonical/);
    expect(
      runHook(RecordDefinitionRevisionWLDef, 'beforeUpdate', { publicationNote: 'changed' }).error?.message
    ).to.match(/cannot be updated/);
    expect(runHook(RecordDefinitionRevisionWLDef, 'beforeDestroy', {}).error?.message).to.match(/cannot be deleted/);
  });

  it('keeps ordered brand-scoped audit rows immutable while supporting non-revision lifecycle events', function () {
    expect(RecordDefinitionHistoryWLDef).not.to.have.property('autoUpdatedAt');
    const revisionEvent = {
      id: 'rdh_0123456789abcdef0123456789abcdef',
      branding: brandId,
      recordType: 'waterline-record-type-id',
      recordTypeId,
      recordTypeKey,
      operation: 'publish',
      operationId: '01234567-89ab-4cde-8fab-0123456789ab',
      expectedIdentityVersion: 0,
      resultingIdentityVersion: 1,
      expectedDraftVersion: 1,
      expectedActiveRevisionNumber: null,
      revision: revisionId,
      revisionNumber: 1,
      canonicalHash,
      source: { operation: 'publish', sourceRevisionNumber: null },
      occurredAt: timestamp,
      actor,
      validation: validationReport(),
    };
    expect(runHook(RecordDefinitionHistoryWLDef, 'beforeCreate', revisionEvent).error).to.be.undefined;
    expect(
      runHook(RecordDefinitionHistoryWLDef, 'beforeCreate', {
        ...revisionEvent,
        resultingIdentityVersion: 3,
      }).error?.message
    ).to.match(/atomic lifecycle advance/);
    expect(
      runHook(RecordDefinitionHistoryWLDef, 'beforeCreate', {
        ...revisionEvent,
        operation: 'retire',
        expectedDraftVersion: null,
        revision: null,
        revisionNumber: null,
      }).error
    ).to.be.undefined;
    expect(hasIndex(RecordDefinitionHistoryWLDef, { recordType: 1, occurredAt: -1 })).to.equal(true);
    expect(hasIndex(RecordDefinitionHistoryWLDef, { branding: 1, recordTypeKey: 1, occurredAt: -1 })).to.equal(true);
    expect(runHook(RecordDefinitionHistoryWLDef, 'beforeUpdate', { note: 'changed' }).error?.message).to.match(
      /cannot be updated/
    );
    expect(runHook(RecordDefinitionHistoryWLDef, 'beforeDestroy', {}).error?.message).to.match(/cannot be deleted/);
  });

  it('enforces stable secret-slot ownership and excludes provider payloads from serialization', function () {
    expect(ActionSecretWLDef.dontUseObjectIds).to.equal(true);
    const row = {
      id: secretId,
      branding: brandId,
      recordType: 'waterline-record-type-id',
      recordTypeId,
      recordTypeKey,
      bindingId,
      parameterName: 'token',
      protectedValue: `v1:${'ab'.repeat(12)}:${'cd'.repeat(16)}:ef`,
      createdBy: actor,
      updatedBy: actor,
    };
    expect(runHook(ActionSecretWLDef, 'beforeCreate', row).error).to.be.undefined;
    expect(hasIndex(ActionSecretWLDef, { branding: 1, recordType: 1, bindingId: 1, parameterName: 1 }, true)).to.equal(
      true
    );
    expect(runHook(ActionSecretWLDef, 'beforeCreate', { ...row, branding: 'brand-b' }).error?.message).to.match(
      /does not own/
    );
    expect(runHook(ActionSecretWLDef, 'beforeUpdate', { bindingId }).error?.message).to.match(/immutable/);
    expect(
      runHook(ActionSecretWLDef, 'beforeUpdate', { protectedValue: `v1:${'ab'.repeat(12)}:${'cd'.repeat(16)}:ff` })
        .error
    ).to.be.undefined;

    expect(runHook(ActionSecretWLDef, 'beforeCreate', { ...row, protectedValue: 'plaintext' }).error?.message).equal(
      'Invalid protected action secret.'
    );
    expect(runHook(ActionSecretWLDef, 'beforeUpdate', { protectedValue: 'plaintext' }).error?.message).equal(
      'Invalid protected action secret.'
    );

    const serialize = ActionSecretWLDef.customToJSON as (this: Record<string, unknown>) => Record<string, unknown>;
    expect(serialize.call(row)).to.not.have.property('protectedValue');
    expect(runHook(ActionSecretWLDef, 'beforeCreate', { ...row, protectedValue: null, adminVersion: 2 }).error).to.be.undefined;
    expect(runHook(ActionSecretWLDef, 'beforeUpdate', { protectedValue: null, adminVersion: 2 }).error).to.be.undefined;
    expect(serialize.call({ ...row, protectedValue: null, adminVersion: 2 })).to.not.have.property('protectedValue');
  });

  it('registers every record-definition model and generates its runtime shim', async function () {
    const modelNames = [
      'ActionSecret',
      'RecordDefinitionDraft',
      'RecordDefinitionDraftOperationAck',
      'RecordDefinitionHistory',
      'RecordDefinitionLifecycleOperationAck',
      'RecordDefinitionRevision',
    ] as const;
    expect(WaterlineModels).to.include.all.keys(...modelNames);

    const modelDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'record-definition-model-shims-'));
    try {
      await generateModelShims(modelDirectory, {});
      for (const modelName of modelNames) {
        const shim = await fs.readFile(path.join(modelDirectory, `${modelName}.js`), 'utf8');
        expect(shim).to.include(`WaterlineModels['${modelName}']`);
        expect(shim).to.include(`globalId: '${modelName}'`);
      }
    } finally {
      await fs.rm(modelDirectory, { recursive: true, force: true });
    }
  });
});
