/** Executable example for the fictional accession service in the PUB-17 contract fixture. */
import { randomUUID } from 'node:crypto';
import {
  PublicationService,
  PublicationBindingConflict,
  publicationDigest,
  publicationOperationEvidence,
  type PublicationObject,
  type PublicationProvider,
  type PublicationProviderExecution,
  type PublicationProviderOutcome,
  type PublicationValidationResult,
  type PublicationOperation,
  type PublicationRepairContext,
  type PublicationRepairResult,
} from '@researchdatabox/redbox-core';

type Config = PublicationObject & {
  connection: PublicationObject & { endpoint: string; repository: string; token: string };
  writeBack: PublicationObject & { url: string };
};
type State = PublicationObject & { phase: 'empty' | 'submitted' | 'accepted'; accession?: string };
type Dossier = PublicationObject & { title: string };
type Context = PublicationProviderExecution<Config, State, Dossier>;
type Receipt = {
  accession: string;
  decision: 'pending' | 'accepted' | 'conflict';
  dossierDigest: string;
  idempotencyKey: string;
};
class InvalidAccessionReceipt extends Error {
  constructor() {
    super('Invalid accession receipt');
  }
}

function object(value: unknown): value is PublicationObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function invalid<T>(code: string): PublicationValidationResult<T> {
  return { valid: false, issues: [{ path: '', code, message: `Invalid accession ${code}` }] };
}
export function accessionTarget(configuration: Config): string {
  return publicationDigest({
    provider: 'accession-review',
    endpoint: new URL(configuration.connection.endpoint).origin,
    repository: configuration.connection.repository,
  });
}
function namespace(configuration: Config): string {
  return `accession:${new URL(configuration.connection.endpoint).origin}/${encodeURIComponent(configuration.connection.repository)}`;
}
function accessionPath(configuration: Config, accession?: string): string {
  const root = `/repositories/${encodeURIComponent(configuration.connection.repository)}/accessions`;
  return accession ? `${root}/${accession}` : root;
}
async function receipt(context: Context, path: string, body?: Dossier, key?: string): Promise<Receipt | undefined> {
  const response = await fetch(new URL(path, context.configuration.connection.endpoint), {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${context.credentials.token}`,
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: context.signal,
  });
  if (response.status === 404 && !body) return undefined;
  if (!response.ok) throw new Error(`Accession transport status ${response.status}`);
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidAccessionReceipt();
    throw error;
  }
  if (
    !object(value) ||
    typeof value.accession !== 'string' ||
    !/^ACC-[0-9]+$/.test(value.accession) ||
    (value.decision !== 'pending' && value.decision !== 'accepted' && value.decision !== 'conflict') ||
    typeof value.dossierDigest !== 'string' ||
    typeof value.idempotencyKey !== 'string' ||
    !/^rbpub-v1-[a-f0-9]{64}$/.test(value.idempotencyKey)
  )
    throw new InvalidAccessionReceipt();
  return {
    accession: value.accession,
    decision: value.decision,
    dossierDigest: value.dossierDigest,
    idempotencyKey: value.idempotencyKey,
  };
}
async function applyReceipt(
  context: Context,
  remote: Receipt,
  operations: PublicationOperation[] = [...context.operations]
): Promise<PublicationProviderOutcome<State>> {
  const proofs = operations
    .filter(op => op.outcome === 'confirmed')
    .map(operation => ({
      ...publicationOperationEvidence(
        { ...context, providerId: 'accession-review', targetFingerprint: accessionTarget(context.configuration) },
        operation,
        { namespace: namespace(context.configuration), objectId: remote.accession }
      ),
      idempotencyKey: remote.idempotencyKey,
      intendedDigest: remote.dossierDigest,
    }));
  for (const operation of operations.filter(op => op.outcome === 'confirmed'))
    await context.journal({ ...operation, confirmation: proofs.find(proof => proof.operationId === operation.id) });
  const state: State = { phase: 'submitted', accession: remote.accession };
  if (remote.dossierDigest !== publicationDigest(context.prepared) || remote.decision === 'conflict')
    return {
      kind: 'repair_required',
      state,
      reason: 'accession_dossier_conflict',
      evidence: { accession: remote.accession, actualDigest: remote.dossierDigest },
    };
  await context.checkpoint(
    state,
    proofs.map(proof => proof.operationId)
  );
  if (context.recovery) {
    // Recovery records the verified receipt; the next authorized run binds/projects it.
    return { kind: 'waiting', state, reason: 'accession_reconciled_resume', nextCheckAt: Date.now() + 1 };
  }
  try {
    await context.bind({
      namespace: namespace(context.configuration),
      objectId: remote.accession,
      targetFingerprint: accessionTarget(context.configuration),
      evidence: { dossierDigest: remote.dossierDigest },
    });
  } catch (error) {
    if (!(error instanceof PublicationBindingConflict)) throw error;
    return {
      kind: 'repair_required',
      state,
      reason: 'accession_binding_conflict',
      evidence: { accession: remote.accession },
    };
  }
  if (remote.decision === 'pending') return { kind: 'waiting', state, reason: 'accession_review_pending' };
  const url = new URL(accessionPath(context.configuration, remote.accession), context.configuration.connection.endpoint)
    .href;
  await context.project({ [context.configuration.writeBack.url]: url });
  return {
    kind: 'completed',
    state: { ...state, phase: 'accepted' },
    links: { accession: url },
    evidence: {
      approvalId: context.approval.id,
      approvalEpoch: context.approval.epoch,
      sourceGeneration: context.sourceGeneration,
      sourceDigest: publicationDigest({
        ...context.source,
        attachments: context.source.attachments.map(({ staged: _staged, ...attachment }) => attachment),
      }),
      operations: proofs,
      confirmedAt: new Date().toISOString(),
      remote: { namespace: namespace(context.configuration), objectId: remote.accession },
      deposit: { acceptedDossierDigest: remote.dossierDigest },
      ingestion: { state: 'not_required', evidence: {} },
      visibility: 'unverified',
    },
  };
}
async function observe(context: Context): Promise<PublicationProviderOutcome<State>> {
  const confirmed = context.operations.filter(
    operation => operation.kind === 'accession_submission' && operation.outcome === 'confirmed'
  );
  const accessions = new Set(
    [
      context.state.accession,
      context.binding?.objectId,
      ...confirmed.map(operation => operation.evidence.accession),
    ].filter(value => value !== undefined)
  );
  const [accession] = [...accessions];
  const keys = new Set(confirmed.map(operation => context.idempotencyKey(operation)));
  const [key] = [...keys];
  if (
    accessions.size !== 1 ||
    keys.size !== 1 ||
    typeof accession !== 'string' ||
    !/^ACC-[0-9]+$/.test(accession) ||
    (context.binding && context.binding.namespace !== namespace(context.configuration))
  )
    return { kind: 'repair_required', state: context.state, reason: 'accession_receipt_missing', evidence: {} };
  let remote: Receipt | undefined;
  try {
    remote = await receipt(context, accessionPath(context.configuration, accession), undefined, key);
  } catch (error) {
    if (!(error instanceof InvalidAccessionReceipt)) throw error;
    return { kind: 'repair_required', state: context.state, reason: 'accession_receipt_mismatch', evidence: {} };
  }
  if (!remote)
    return { kind: 'repair_required', state: context.state, reason: 'accession_receipt_mismatch', evidence: {} };
  return applyReceipt(context, remote);
}

export async function attestAccessionSubmission(
  context: PublicationRepairContext<Config, State>
): Promise<PublicationRepairResult<State>> {
  const operation = context.operations.find(op => op.id === context.parameters.operationId);
  if (!operation || operation.kind !== 'accession_submission') throw new Error('Exact accession submission required');
  if (context.parameters.outcome === 'not_applied')
    return {
      state: context.state,
      operations: [
        {
          ...operation,
          outcome: 'not_applied',
          confirmation: publicationOperationEvidence(
            { ...context, providerId: 'accession-review' },
            operation,
            context.binding
          ),
        },
      ],
    };
  const remote = context.parameters.externalReceipt;
  if (
    !object(remote) ||
    typeof remote.accession !== 'string' ||
    !/^ACC-[0-9]+$/.test(remote.accession) ||
    typeof remote.dossierDigest !== 'string' ||
    typeof remote.idempotencyKey !== 'string' ||
    typeof remote.namespace !== 'string' ||
    remote.dossierDigest !== operation.intendedDigest ||
    remote.idempotencyKey !== context.parameters.idempotencyKey ||
    remote.namespace !== namespace(context.configuration) ||
    (context.state.accession && context.state.accession !== remote.accession) ||
    (context.binding &&
      (context.binding.objectId !== remote.accession || context.binding.namespace !== remote.namespace))
  )
    throw new Error('External receipt must identify the exact target, key, accession and dossier');
  const confirmed: PublicationOperation = {
    ...operation,
    outcome: 'confirmed',
    confirmation: {
      ...publicationOperationEvidence({ ...context, providerId: 'accession-review' }, operation, {
        namespace: remote.namespace,
        objectId: remote.accession,
      }),
      idempotencyKey: remote.idempotencyKey,
      intendedDigest: remote.dossierDigest,
    },
    evidence: {
      ...operation.evidence,
      accession: remote.accession,
      dossierDigest: operation.intendedDigest,
      idempotencyKey: context.parameters.idempotencyKey,
    },
  };
  return {
    state: { phase: 'submitted', accession: remote.accession },
    operations: [confirmed],
    checkpointedOperationIds: [operation.id],
  };
}

export const accessionProvider: PublicationProvider<Config, State, Dossier> = {
  id: 'accession-review',
  contractVersion: 2,
  stateVersion: 1,
  configurationSchema: {
    type: 'object',
    required: ['connection', 'writeBack'],
    properties: {
      connection: {
        type: 'object',
        required: ['endpoint', 'repository', 'token'],
        properties: {
          endpoint: { type: 'string', format: 'uri' },
          repository: { type: 'string' },
          token: { type: 'string' },
        },
      },
      writeBack: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
    },
  },
  secretPaths: ['connection.token'],
  mutationRecovery: { mode: 'idempotency-key' },
  capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: false },
  validateConfiguration(value) {
    if (!object(value) || !object(value.connection) || !object(value.writeBack)) return invalid('configuration');
    const { endpoint, repository, token } = value.connection;
    if (
      typeof endpoint !== 'string' ||
      typeof repository !== 'string' ||
      !repository ||
      typeof token !== 'string' ||
      !token ||
      typeof value.writeBack.url !== 'string'
    )
      return invalid('configuration');
    try {
      const url = new URL(endpoint);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/'
      )
        return invalid('endpoint');
    } catch {
      return invalid('endpoint');
    }
    return {
      valid: true,
      value: {
        ...value,
        connection: { ...value.connection, endpoint, repository, token },
        writeBack: { ...value.writeBack, url: value.writeBack.url },
      },
    };
  },
  targetFingerprint: accessionTarget,
  sourceMaintenancePaths: configuration => [configuration.writeBack.url],
  decodeState(value, version) {
    if (version !== 1 || !object(value)) return invalid('state');
    if (Object.keys(value).length === 0) return { valid: true, value: { phase: 'empty' } };
    if (
      (value.phase !== 'empty' && value.phase !== 'submitted' && value.phase !== 'accepted') ||
      (value.phase !== 'empty' && (typeof value.accession !== 'string' || !/^ACC-[0-9]+$/.test(value.accession)))
    )
      return invalid('state');
    return {
      valid: true,
      value: {
        phase: value.phase,
        ...(typeof value.accession === 'string' ? { accession: value.accession } : {}),
      },
    };
  },
  upgradeState: () => invalid('state_version'),
  decodePreparedSource(value) {
    return object(value) && typeof value.title === 'string' && value.title.trim()
      ? { valid: true, value: { title: value.title } }
      : invalid('dossier');
  },
  async prepareSource(input) {
    return this.decodePreparedSource(object(input.record.metadata) ? input.record.metadata : input.record);
  },
  summariseStatus: state => ({
    deposit: state.phase === 'accepted' ? 'confirmed' : 'unverified',
    publication: 'unverified',
    ingestion: 'not_required',
    visibility: 'unverified',
  }),
  async synchronise(context) {
    // The confirmed journal can outlive a lost state checkpoint or a newer approval.
    // Read that exact accession; a different dossier requires repair, never another create.
    if (
      context.state.accession ||
      context.binding ||
      context.operations.some(
        operation => operation.kind === 'accession_submission' && operation.outcome === 'confirmed'
      )
    )
      return observe(context);
    const operation = {
      // Each certified non-application may have a new attempt under the same approval.
      // Confirmed/unknown earlier attempts are independently fenced before this point.
      id: randomUUID(),
      kind: 'accession_submission',
      approvalId: context.approval.id,
      approvalEpoch: context.approval.epoch,
      sourceGeneration: context.sourceGeneration,
      intendedDigest: publicationDigest(context.prepared),
      submittedAt: new Date().toISOString(),
      outcome: 'submitted' as const,
      evidence: {},
    };
    const remote = await context.mutate(operation, key =>
      receipt(context, accessionPath(context.configuration), context.prepared, key)
    );
    if (!remote) throw new Error('Missing submission receipt');
    const confirmed: PublicationOperation = {
      ...operation,
      outcome: 'confirmed',
      confirmation: {
        ...publicationOperationEvidence(
          { ...context, providerId: 'accession-review', targetFingerprint: accessionTarget(context.configuration) },
          operation,
          { namespace: namespace(context.configuration), objectId: remote.accession }
        ),
        idempotencyKey: remote.idempotencyKey,
        intendedDigest: remote.dossierDigest,
      },
      evidence: {
        accession: remote.accession,
        dossierDigest: remote.dossierDigest,
        idempotencyKey: remote.idempotencyKey,
      },
    };
    await context.journal(confirmed);
    await context.checkpoint({ phase: 'submitted', accession: remote.accession }, [operation.id]);
    return applyReceipt(context, remote, [confirmed]);
  },
  async reconcile(context) {
    const unresolved = context.operations.filter(operation => ['submitted', 'uncertain'].includes(operation.outcome));
    for (const operation of unresolved) {
      if (operation.kind !== 'accession_submission')
        return { kind: 'repair_required', state: context.state, reason: 'accession_operation_unknown', evidence: {} };
      const key = context.idempotencyKey(operation);
      let remote: Receipt | undefined;
      try {
        remote = await receipt(
          context,
          `/repositories/${encodeURIComponent(context.configuration.connection.repository)}/operations/${key}`,
          undefined,
          key
        );
      } catch (error) {
        if (!(error instanceof InvalidAccessionReceipt)) throw error;
        return { kind: 'repair_required', state: context.state, reason: 'accession_receipt_mismatch', evidence: {} };
      }
      // Absence cannot prove that a delayed prior request will not arrive. Require operator settlement.
      if (!remote)
        return {
          kind: 'repair_required',
          state: context.state,
          reason: 'accession_submission_not_found',
          evidence: { operationId: operation.id },
        };
      const confirmed: PublicationOperation = {
        ...operation,
        outcome: 'confirmed',
        confirmation: {
          ...publicationOperationEvidence(
            { ...context, providerId: 'accession-review', targetFingerprint: accessionTarget(context.configuration) },
            operation,
            { namespace: namespace(context.configuration), objectId: remote.accession }
          ),
          idempotencyKey: remote.idempotencyKey,
          intendedDigest: remote.dossierDigest,
        },
        evidence: {
          ...operation.evidence,
          accession: remote.accession,
          dossierDigest: remote.dossierDigest,
          idempotencyKey: key,
        },
      };
      await context.journal(confirmed);
      await context.checkpoint({ phase: 'submitted', accession: remote.accession }, [operation.id]);
      return applyReceipt(context, remote, [confirmed]);
    }
    return observe(context);
  },
  attestOperation: attestAccessionSubmission,
  observe,
  repairs: [],
};

export class AccessionPublication extends PublicationService.Services.Publication {
  protected override configureProviders(): void {
    super.configureProviders();
    this.registerProvider(accessionProvider);
  }
}
export function registerRedboxServices() {
  return { PublicationService: new AccessionPublication().exports() };
}
export const ServiceExports = registerRedboxServices();
