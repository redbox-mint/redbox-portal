import Ajv from 'ajv';
import { isDeepStrictEqual } from 'node:util';
import type { Collection, Document } from 'mongodb';
import {
  publicationRecordDigest,
  nextRecordRevision,
  type PublicationSourceState,
  type PublicationWriteIntent,
  type PublicationApproval,
  type PublicationSourceSave,
  type PublicationSaveCompletion,
  type PublicationAcknowledgement,
  assertPublicationWorkflowDecision,
  assertPublicationContentReplacement,
  publicationWorkflowProjectionMatches,
} from '@researchdatabox/redbox-core';

export const PUBLICATION_SOURCE_MAX_SAVES = 64;
export const PUBLICATION_SOURCE_MAX_BYTES = 256 * 1024;
const text = { type: 'string', minLength: 1, maxLength: 2048 };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const reference = {
  type: 'object',
  required: ['encodingVersion', 'disk', 'key', 'digest'],
  additionalProperties: false,
  properties: {
    encodingVersion: { const: 1 },
    disk: text,
    key: text,
    digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
};
const attribution = {
  type: 'object',
  required: ['username', 'userType'],
  additionalProperties: false,
  properties: { username: text, userType: text, displayName: text },
};
const ids = {
  type: 'array',
  minItems: 1,
  maxItems: 64,
  uniqueItems: true,
  items: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
};
const approvalSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'epoch',
    'sourceRevision',
    'policy',
    'destinationIds',
    'targetFingerprints',
    'configurationDigests',
    'source',
    'requester',
    'approver',
    'grantedAt',
  ],
  properties: {
    id: text,
    epoch: integer,
    sourceRevision: integer,
    destinationIds: ids,
    targetFingerprints: { type: 'object', additionalProperties: text },
    configurationDigests: { type: 'object', additionalProperties: text },
    source: reference,
    requester: attribution,
    approver: attribution,
    creator: attribution,
    grantedAt: text,
    revokedAt: text,
    workflowRules: {
      type: 'array',
      maxItems: 64,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'version', 'recordType', 'destinations', 'completion', 'targetStage'],
        properties: {
          id: text,
          version: integer,
          recordType: text,
          destinations: ids,
          completion: { enum: ['all', 'any'] },
          targetStage: text,
        },
      },
    },
    policy: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version', 'mode', 'recordType', 'event', 'destinations'],
      properties: {
        id: text,
        version: integer,
        mode: { enum: ['approval', 'auto-sync'] },
        recordType: text,
        event: text,
        destinations: ids,
        grantCondition: text,
        continuationCondition: text,
      },
    },
  },
};
const intentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['destinationId', 'generation', 'approvalId', 'approvalEpoch', 'sourceRevision', 'pending', 'requestedAt'],
  properties: {
    destinationId: text,
    generation: integer,
    approvalId: text,
    approvalEpoch: integer,
    sourceRevision: integer,
    pending: { type: 'boolean' },
    requestedAt: text,
  },
};
const validator = new Ajv({ strict: false });
const validApproval = validator.compile<PublicationApproval>(approvalSchema);
const validSource = validator.compile<PublicationSourceState>({
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'revision', 'pending', 'initialising', 'approvals', 'intents', 'saves'],
  properties: {
    schemaVersion: { const: 1 },
    revision: integer,
    pending: { type: 'boolean' },
    initialising: { type: 'boolean' },
    contentReplacements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'capability',
          'receiptField',
          'providerId',
          'destinationId',
          'sourceRevision',
          'generation',
          'approvalId',
          'approvalEpoch',
          'source',
          'path',
          'before',
          'after',
          'appliedAt',
        ],
        properties: {
          id: text,
          capability: { const: 'attachment-to-url' },
          receiptField: text,
          providerId: text,
          destinationId: text,
          sourceRevision: integer,
          generation: integer,
          approvalId: text,
          approvalEpoch: integer,
          source: reference,
          path: text,
          before: { type: 'array' },
          after: { type: 'array' },
          appliedAt: text,
        },
      },
    },
    workflowDecisionId: text,
    workflowDecision: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'sourceRevision', 'rule', 'approvals', 'status', 'startedAt', 'before', 'after'],
      properties: {
        id: text,
        sourceRevision: integer,
        rule: { type: 'object' },
        approvals: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['destinationId', 'approvalId', 'epoch', 'generation'],
            properties: { destinationId: text, approvalId: text, epoch: integer, generation: integer },
          },
        },
        status: { enum: ['started', 'stage_applied', 'completed', 'failed'] },
        startedAt: text,
        finishedAt: text,
        reason: text,
        before: { type: 'object' },
        after: { type: 'object' },
      },
    },
    approvals: { type: 'array', items: approvalSchema },
    preparationFailures: {
      type: 'array',
      maxItems: 64,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['destinationId', 'policyId', 'sourceRevision', 'code', 'recordedAt'],
        properties: { destinationId: text, policyId: text, sourceRevision: integer, code: text, recordedAt: text },
      },
    },
    intents: { type: 'object', additionalProperties: intentSchema },
    saves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'outcome', 'intents', 'requestedAt', 'sourceRevision', 'recordDigest'],
        properties: {
          token: text,
          outcome: { enum: ['initialising', 'ready', 'abandoned', 'quarantined'] },
          intents: { type: 'array', items: intentSchema },
          requestedAt: text,
          sourceRevision: integer,
          recordDigest: text,
          successfulSaveEvidence: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'recordedAt', 'sourceRevision', 'recordDigest'],
            properties: { id: text, recordedAt: text, sourceRevision: integer, recordDigest: text },
          },
        },
      },
    },
  },
});

export function publicationSource(value: unknown): PublicationSourceState {
  if (!validSource(value))
    throw new Error('Unsupported or invalid protected publication source state; repair required');
  if (value.workflowDecision) assertPublicationWorkflowDecision(value.workflowDecision);
  for (const change of value.contentReplacements ?? []) assertPublicationContentReplacement(change);
  return structuredClone(value);
}
export function emptyPublicationSource(): PublicationSourceState {
  return { schemaVersion: 1, revision: 0, pending: false, initialising: false, approvals: [], intents: {}, saves: [] };
}
export function summarizePublicationSource(state: PublicationSourceState): PublicationSourceState {
  state.pending = state.saves.some(save => save.outcome === 'ready' && save.intents.some(intent => intent.pending));
  state.initialising = state.saves.some(save => save.outcome === 'initialising');
  if (!validSource(state)) throw new Error('Invalid publication source evidence');
  if (
    state.saves.length > PUBLICATION_SOURCE_MAX_SAVES ||
    Buffer.byteLength(JSON.stringify(state)) > PUBLICATION_SOURCE_MAX_BYTES
  )
    throw new Error(
      'Publication source backlog is full; import or repair outstanding saves before accepting more work'
    );
  return state;
}
export function preparePublicationSource(
  record: Document,
  prior: PublicationSourceState,
  intent: PublicationWriteIntent,
  now: string
): PublicationSourceState {
  if (
    intent.expectedSourceRevision !== prior.revision ||
    !['content', 'approval', 'preserve', 'revoke'].includes(intent.kind) ||
    typeof intent.saveToken !== 'string' ||
    !intent.saveToken.trim() ||
    intent.saveToken.length > 2048 ||
    !Array.isArray(intent.approvals)
  )
    throw new Error('Publication preparation is stale or malformed');
  const state = structuredClone(prior);
  if (intent.workflowDecisionId) {
    const decision = state.workflowDecision;
    if (
      !decision ||
      decision.id !== intent.workflowDecisionId ||
      !['started', 'stage_applied'].includes(decision.status) ||
      intent.approvals.length
    )
      throw new Error('Publication workflow attempt is stale');
    decision.status = publicationWorkflowProjectionMatches(record, decision) ? 'stage_applied' : 'failed';
    if (decision.status === 'failed') decision.reason = 'workflow_projection_changed';
  }
  if (intent.expectedRecordDigest !== undefined && intent.expectedRecordDigest !== publicationRecordDigest(record))
    throw new Error('Publication candidate changed after preparation');
  if (['preserve', 'revoke'].includes(intent.kind) && intent.approvals.length)
    throw new Error('Publication preservation/revocation cannot grant approval');
  if (intent.revocations?.length && intent.kind !== 'revoke')
    throw new Error('Publication revocations require an explicit revocation write');
  if (state.saves.some(save => save.token === intent.saveToken))
    throw new Error('Publication save token has already been used');
  if (intent.kind === 'content') {
    state.revision = nextRecordRevision(state.revision);
    for (const approval of state.approvals) {
      if (!approval.revokedAt) {
        approval.revokedAt = now;
      }
    }
    for (const entry of Object.values(state.intents)) {
      entry.generation = nextRecordRevision(entry.generation);
      entry.pending = false;
    }
  }
  for (const revocation of intent.revocations ?? []) {
    const approval = state.approvals.find(entry => entry.id === revocation.approvalId);
    if (!approval || approval.epoch !== revocation.epoch || approval.revokedAt)
      throw new Error('Publication revocation is stale');
    approval.epoch = nextRecordRevision(approval.epoch);
    approval.revokedAt = now;
    for (const entry of Object.values(state.intents)) if (entry.approvalId === approval.id) entry.pending = false;
  }
  if (intent.preparationFailures !== undefined) {
    state.preparationFailures = structuredClone(intent.preparationFailures);
    if (state.preparationFailures.some(failure => failure.sourceRevision !== state.revision))
      throw new Error('Publication preparation failure has a stale source revision');
  } else if (intent.kind === 'content') state.preparationFailures = [];
  const destinations = new Set<string>();
  for (const approval of intent.approvals) {
    if (
      !validApproval(approval) ||
      approval.revokedAt ||
      approval.sourceRevision !== state.revision ||
      state.approvals.some(entry => entry.id === approval.id) ||
      !isDeepStrictEqual([...approval.destinationIds].sort(), [...approval.policy.destinations].sort())
    )
      throw new Error('Invalid publication approval or source identity');
    for (const id of approval.destinationIds) {
      if (destinations.has(id) || !approval.targetFingerprints[id] || !approval.configurationDigests[id])
        throw new Error('Publication approval destination identity is missing or duplicated');
      destinations.add(id);
      // Approval-only replacement revokes the prior scope rather than silently leaving old authority live.
      for (const previous of state.approvals) if (previous.destinationIds.includes(id)) previous.revokedAt ??= now;
      state.intents[id] = {
        destinationId: id,
        generation: nextRecordRevision(prior.intents[id]?.generation ?? 0),
        approvalId: approval.id,
        approvalEpoch: approval.epoch,
        sourceRevision: state.revision,
        pending: true,
        requestedAt: now,
      };
    }
    state.approvals.push(structuredClone(approval));
  }
  if (destinations.size === 0) return summarizePublicationSource(state);
  state.saves.push({
    token: intent.saveToken,
    outcome: 'initialising',
    sourceRevision: state.revision,
    recordDigest: publicationRecordDigest(record),
    requestedAt: now,
    intents: [...destinations].map(id => structuredClone(state.intents[id])),
  });
  return summarizePublicationSource(state);
}
/** Ordinary writes conservatively invalidate authority, even with no replacement request. No save evidence is evicted. */
export const invalidatePublicationSourceStage: Document = {
  $set: {
    publicationSource: {
      $cond: [
        { $eq: [{ $type: '$publicationSource' }, 'object'] },
        {
          $mergeObjects: [
            '$publicationSource',
            {
              revision: { $add: ['$publicationSource.revision', 1] },
              approvals: {
                $map: {
                  input: '$publicationSource.approvals',
                  as: 'approval',
                  in: {
                    $mergeObjects: [
                      '$$approval',
                      { revokedAt: { $ifNull: ['$$approval.revokedAt', { $dateToString: { date: '$$NOW' } }] } },
                    ],
                  },
                },
              },
              intents: {
                $arrayToObject: {
                  $map: {
                    input: { $objectToArray: '$publicationSource.intents' },
                    as: 'entry',
                    in: {
                      k: '$$entry.k',
                      v: {
                        $mergeObjects: [
                          '$$entry.v',
                          { generation: { $add: ['$$entry.v.generation', 1] }, pending: false },
                        ],
                      },
                    },
                  },
                },
              },
            },
          ],
        },
        '$$REMOVE',
      ],
    },
  },
};

export function publicationSaveMatches(
  record: Document,
  state: PublicationSourceState,
  save: PublicationSourceSave
): boolean {
  return (
    save.sourceRevision === state.revision &&
    save.recordDigest === publicationRecordDigest(record) &&
    save.intents.every(intent => {
      const current = state.intents[intent.destinationId];
      return (
        current?.generation === intent.generation &&
        current.approvalId === intent.approvalId &&
        current.approvalEpoch === intent.approvalEpoch &&
        state.approvals.some(
          approval =>
            approval.id === intent.approvalId && approval.epoch === intent.approvalEpoch && !approval.revokedAt
        )
      );
    })
  );
}
export function recordPublicationSuccess(
  record: Document,
  state: PublicationSourceState,
  token: string,
  completion: PublicationSaveCompletion
): boolean {
  const save = state.saves.find(entry => entry.token === token);
  if (
    !save ||
    save.outcome !== 'initialising' ||
    !publicationSaveMatches(record, state, save) ||
    completion.sourceRevision !== save.sourceRevision ||
    completion.recordDigest !== save.recordDigest ||
    typeof completion.evidenceId !== 'string' ||
    !completion.evidenceId.trim() ||
    completion.evidenceId.length > 2048
  )
    return false;
  if (save.successfulSaveEvidence) return save.successfulSaveEvidence.id === completion.evidenceId;
  save.successfulSaveEvidence = {
    id: completion.evidenceId,
    recordedAt: new Date().toISOString(),
    sourceRevision: save.sourceRevision,
    recordDigest: save.recordDigest,
  };
  return true;
}
export function readyPublicationSave(
  record: Document,
  state: PublicationSourceState,
  save: PublicationSourceSave
): boolean {
  if (
    save.outcome !== 'initialising' ||
    !save.successfulSaveEvidence ||
    save.successfulSaveEvidence.sourceRevision !== save.sourceRevision ||
    save.successfulSaveEvidence.recordDigest !== save.recordDigest ||
    !publicationSaveMatches(record, state, save)
  )
    return false;
  save.outcome = 'ready';
  return true;
}
export function acknowledgePublicationSource(state: PublicationSourceState, ack: PublicationAcknowledgement): boolean {
  const approval = state.approvals.find(entry => entry.id === ack.approvalId && entry.epoch === ack.approvalEpoch);
  if (!approval || !isDeepStrictEqual(approval.source, ack.source)) return false;
  const matches = (entry: import('@researchdatabox/redbox-core').PublicationIntent) =>
    entry.destinationId === ack.destinationId &&
    entry.generation === ack.generation &&
    entry.approvalId === ack.approvalId &&
    entry.approvalEpoch === ack.approvalEpoch &&
    entry.sourceRevision === ack.sourceRevision;
  let found = false;
  for (const save of state.saves) {
    if (save.outcome !== 'ready') continue;
    for (const entry of save.intents)
      if (matches(entry)) {
        entry.pending = false;
        found = true;
      }
  }
  if (!found) return false;
  const current = state.intents[ack.destinationId];
  if (current && matches(current)) current.pending = false;
  // Only acknowledged successful entries are retired. Quarantine/failure evidence is retained for repair.
  const retired = state.saves.filter(save => save.outcome === 'ready' && save.intents.every(entry => !entry.pending));
  state.saves = state.saves.filter(save => !retired.includes(save));
  const retained = new Set(
    [...Object.values(state.intents), ...state.saves.flatMap(save => save.intents)].map(entry => entry.approvalId)
  );
  state.approvals = state.approvals.filter(entry => retained.has(entry.id));
  return true;
}
/** Optimistic state CAS includes record revision/version so completion cannot race a content or lifecycle write. */
export async function mutatePublicationSource(
  collection: Collection<Document>,
  brandId: string,
  oid: string,
  change: (record: Document, state: PublicationSourceState) => boolean
): Promise<boolean> {
  if (!brandId || !oid) throw new Error('Publication storage requires brand and record identity');
  for (let attempt = 0; attempt < 16; attempt++) {
    const record = await collection.findOne({ redboxOid: oid, 'metaMetadata.brandId': brandId });
    if (!record?.publicationSource) return false;
    const state = publicationSource(record.publicationSource);
    if (!change(record, state)) return false;
    summarizePublicationSource(state);
    const result = await collection.updateOne(
      {
        _id: record._id,
        'metaMetadata.brandId': brandId,
        revision: record.revision ?? { $exists: false },
        recordVersion: record.recordVersion ?? { $exists: false },
        publicationSource: record.publicationSource,
      },
      { $set: { publicationSource: state } }
    );
    if (result.matchedCount === 1) return true;
  }
  throw new Error('Publication source changed repeatedly; retry the operation');
}
export function boundedPublicationScan(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error('Publication scan limit must be between 1 and 500');
  return limit;
}
