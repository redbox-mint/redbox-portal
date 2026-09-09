import { validSecretValue, ACTION_SECRET_LIMITS } from '../../action-registry/secrets';
import { isProtectedActionSecretEnvelope } from './envelope';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { firstValueFrom } from 'rxjs';
import { Services as Core } from '../../CoreService';
import {
  ActionSecretProviderError,
  createActionSecretProvider,
  type ActionSecretHandlerResolutionRequest,
  type ActionSecretProvider,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
  type RedboxActionRegistry,
} from '../../action-registry';
import { deriveRecordDefinitionId } from '../../record-workflow-administration';
import { parseRecordDefinitionBrandId, parseRecordDefinitionKey } from '@researchdatabox/sails-ng-common';
import type { RecordDefinitionDraftAttributes } from '../../waterline-models/RecordDefinitionDraft';
import type { RuntimeValue } from '../../runtimeValues';
import { Services as Runtime } from '../RecordDefinitionRuntimeService';

interface SecretRow {
  readonly protectedValue: string | null;
  readonly adminVersion?: number;
}
interface SecretCollection {
  findOne(
    filter: Readonly<Record<string, RuntimeValue>>,
    options?: { projection: { protectedValue: 0 } }
  ): Promise<SecretRow | null>;
  updateOne(
    filter: Readonly<Record<string, RuntimeValue>>,
    update: Readonly<Record<string, RuntimeValue>>,
    options: { upsert: boolean }
  ): Promise<{ acknowledged: boolean; matchedCount?: number; upsertedCount?: number }>;
}
interface SecretManager {
  collection(name: 'actionsecret' | 'recordtype'): SecretCollection;
}

function denied(): never {
  throw new ActionSecretProviderError('handler-secret-access-denied');
}
function key(): Buffer {
  const encoded = process.env.REDBOX_ACTION_SECRET_KEY;
  if (typeof encoded !== 'string' || !/^[a-fA-F0-9]{64}$/.test(encoded)) {
    throw new ActionSecretProviderError('secret-provider-failure');
  }
  return Buffer.from(encoded, 'hex');
}
function seal(slot: ActionSecretSlotIdentity, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(slot.id));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
function unseal(slot: ActionSecretSlotIdentity, envelope: string): string {
  if (!isProtectedActionSecretEnvelope(envelope)) {
    throw new ActionSecretProviderError('secret-provider-failure');
  }
  const [, iv, tag, ciphertext] = envelope.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv!, 'hex'));
  decipher.setAAD(Buffer.from(slot.id));
  decipher.setAuthTag(Buffer.from(tag!, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext!, 'hex')), decipher.final()]);
  if (!isUtf8(plaintext)) throw new ActionSecretProviderError('secret-provider-failure');
  return plaintext.toString('utf8');
}

/** The native path keeps plaintext out of Waterline validation, hooks and driver errors. */
class MongoActionSecretStorage extends Core.Core.Service implements ActionSecretStorage {
  readonly #runtime: Runtime.RecordDefinitionRuntime;
  constructor(private readonly registry: RedboxActionRegistry) {
    super();
    this.#runtime = new Runtime.RecordDefinitionRuntime(registry);
  }
  private collection(): SecretCollection {
    const manager = ActionSecret.getDatastore().manager as object as SecretManager;
    if (!manager || typeof manager.collection !== 'function')
      throw new ActionSecretProviderError('secret-provider-failure');
    return manager.collection('actionsecret');
  }
  private filter(slot: ActionSecretSlotIdentity): Readonly<Record<string, RuntimeValue>> {
    return {
      _id: slot.id,
      branding: slot.brandId,
      recordTypeKey: slot.recordTypeKey,
      bindingId: slot.bindingId,
      parameterName: slot.parameterName,
    };
  }
  private async draft(slot: ActionSecretSlotIdentity): Promise<RecordDefinitionDraftAttributes> {
    const draft = await firstValueFrom(
      this.getObservable<RecordDefinitionDraftAttributes | undefined>(
        RecordDefinitionDraft.findOne({ branding: slot.brandId, recordTypeKey: slot.recordTypeKey })
      )
    );
    const binding = draft?.definition.actionBindings.find(candidate => candidate.id === slot.bindingId);
    if (!binding || String(draft?.branding) !== slot.brandId || draft?.recordTypeKey !== slot.recordTypeKey)
      return denied();
    const lookup = this.registry.lookup(binding.actionId, binding.contractVersion);
    if (
      lookup.status !== 'available' ||
      !lookup.descriptor.parameterSchema.parameters.some(
        parameter =>
          parameter.name === slot.parameterName && parameter.kind === 'secret' && parameter.writeOnly === true
      )
    )
      return denied();
    return draft!;
  }
  async authorizeWrite(slot: ActionSecretSlotIdentity): Promise<void> {
    await this.draft(slot);
  }
  async authorizeHandler(request: ActionSecretHandlerResolutionRequest): Promise<void> {
    const active = await this.#runtime.resolve(request.slot.brandId, request.slot.recordTypeKey);
    const binding = active?.revision.definition.actionBindings.find(
      candidate => candidate.id === request.slot.bindingId
    );
    if (!active || !binding || !isDeepStrictEqual(binding, request.resolvedBinding.binding)) return denied();
  }
  async replace(slot: ActionSecretSlotIdentity, value: string): Promise<void> {
    const state = await this.adminState(slot);
    await this.adminWrite(slot, state.version, value);
  }
  async clear(slot: ActionSecretSlotIdentity): Promise<void> {
    const state = await this.adminState(slot);
    await this.adminWrite(slot, state.version, null);
  }
  async adminState(slot: ActionSecretSlotIdentity): Promise<ActionSecretAdminState> {
    await this.draft(slot);
    const row = await this.collection().findOne(this.filter(slot));
    const version = row?.adminVersion ?? 0;
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > 2_147_483_647 ||
      (row !== null && row.protectedValue !== null && !isProtectedActionSecretEnvelope(row.protectedValue))
    ) {
      throw new ActionSecretProviderError('secret-provider-failure');
    }
    return Object.freeze({ configured: row !== null && row.protectedValue !== null, version });
  }
  async adminWrite(
    slot: ActionSecretSlotIdentity,
    expectedVersion: number,
    value: string | null | undefined,
    expectedDraftVersion?: number
  ): Promise<ActionSecretAdminState> {
    const manager = ActionSecret.getDatastore().manager as object as SecretManager;
    const identities = manager.collection('recordtype');
    const token = randomUUID();
    const identityFilter = {
      definitionId: deriveRecordDefinitionId({
        brandId: parseRecordDefinitionBrandId(slot.brandId),
        recordTypeKey: parseRecordDefinitionKey(slot.recordTypeKey),
      }),
      name: slot.recordTypeKey,
    };
    // No expiring lease: a paused writer must never outlive its authority.
    // A process loss leaves a fail-closed fence for operator reconciliation.
    const acquired = await identities.updateOne(
      { ...identityFilter, secretMutationToken: null, draftLifecycleToken: null, definitionLifecycleToken: null },
      { $set: { secretMutationToken: token } },
      { upsert: false }
    );
    if (acquired.acknowledged !== true) throw new ActionSecretProviderError('secret-provider-failure');
    if (acquired.matchedCount !== 1) throw new ActionSecretVersionConflict();
    const persistence = { settled: true };
    try {
      const draft = await this.draft(slot);
      if (expectedDraftVersion !== undefined && draft.version !== expectedDraftVersion)
        throw new ActionSecretVersionConflict();
      return await this.writeUnderFence(slot, expectedVersion, value, persistence);
    } finally {
      // An unacknowledged slot write may still be in flight: never release its authority.
      if (persistence.settled) {
        const released = await identities.updateOne(
          { ...identityFilter, secretMutationToken: token },
          { $set: { secretMutationToken: null } },
          { upsert: false }
        );
        if (released.acknowledged !== true || released.matchedCount !== 1)
          throw new ActionSecretProviderError('secret-provider-failure');
      }
    }
  }
  private async writeUnderFence(
    slot: ActionSecretSlotIdentity,
    expectedVersion: number,
    value: string | null | undefined,
    persistence: { settled: boolean }
  ): Promise<ActionSecretAdminState> {
    if (
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0 ||
      expectedVersion >= 2_147_483_647 ||
      (value !== null &&
        value !== undefined &&
        (typeof value !== 'string' ||
          Buffer.byteLength(value, 'utf8') > ACTION_SECRET_LIMITS.maxSecretBytes ||
          (value.trim() !== '' && !validSecretValue(value))))
    )
      throw new ActionSecretProviderError('invalid-secret-value');
    const draft = await this.draft(slot);
    const state = await this.adminState(slot);
    if (state.version !== expectedVersion) throw new ActionSecretVersionConflict();
    // Retain never re-submits ciphertext or creates a slot.
    if (value !== null && (value === undefined || value.trim() === '')) return state;
    const protectedValue = value === null ? null : seal(slot, value);
    persistence.settled = false;
    try {
      const result = await this.collection().updateOne(
        {
          ...this.filter(slot),
          ...(expectedVersion === 0
            ? { $or: [{ adminVersion: 0 }, { adminVersion: { $exists: false } }] }
            : { adminVersion: expectedVersion }),
        },
        {
          $set: {
            protectedValue,
            adminVersion: expectedVersion + 1,
            updatedAt: Date.now(),
            updatedBy: { id: 'action-secret-provider' },
          },
          $setOnInsert: {
            schemaVersion: 1,
            recordType: String(draft.recordType),
            recordTypeId: deriveRecordDefinitionId({
              brandId: parseRecordDefinitionBrandId(slot.brandId),
              recordTypeKey: parseRecordDefinitionKey(slot.recordTypeKey),
            }),
            createdAt: Date.now(),
            createdBy: { id: 'action-secret-provider' },
          },
        },
        { upsert: expectedVersion === 0 }
      );
      if (result.acknowledged !== true) throw new ActionSecretProviderError('secret-provider-failure');
      persistence.settled = true;
      if (result.matchedCount !== 1 && result.upsertedCount !== 1) throw new ActionSecretVersionConflict();
    } catch (error) {
      if (error instanceof ActionSecretVersionConflict) throw error;
      // Duplicate-key races are conflicts only when the authoritative slot version changed.
      if ((await this.adminState(slot)).version !== expectedVersion) throw new ActionSecretVersionConflict();
      throw new ActionSecretProviderError('secret-provider-failure');
    }
    return Object.freeze({ configured: value !== null, version: expectedVersion + 1 });
  }
  async resolve(slot: ActionSecretSlotIdentity): Promise<string | undefined> {
    const row = await this.collection().findOne(this.filter(slot));
    return row === null || row.protectedValue === null ? undefined : unseal(slot, row.protectedValue);
  }
  async isConfigured(slot: ActionSecretSlotIdentity): Promise<boolean> {
    await this.draft(slot);
    return (
      (await this.collection().findOne(
        { ...this.filter(slot), protectedValue: { $ne: null } },
        { projection: { protectedValue: 0 } }
      )) !== null
    );
  }
}

const providers = new WeakMap<RedboxActionRegistry, ActionSecretProvider>();
/** Server-owned provider; never exported as a service method or public package contract. @internal */
export function persistedRecordActionSecretProvider(registry: RedboxActionRegistry): ActionSecretProvider {
  let provider = providers.get(registry);
  if (!provider) {
    provider = createActionSecretProvider(new MongoActionSecretStorage(registry));
    providers.set(registry, provider);
  }
  return provider;
}

export interface ActionSecretAdminState {
  readonly configured: boolean;
  readonly version: number;
}
export class ActionSecretVersionConflict extends Error {
  constructor() {
    super('Secret version conflict.');
  }
}
/** Administration uses the same encryption and binding authority with atomic slot CAS. */
export function actionSecretAdminStorage(
  registry: RedboxActionRegistry
): Pick<MongoActionSecretStorage, 'adminState' | 'adminWrite'> {
  return new MongoActionSecretStorage(registry);
}
