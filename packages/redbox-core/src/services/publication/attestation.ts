import { publicationDigest } from './canonical';
import { isPublicationObject } from './builtins';
import { publicationOperationIdempotencyKey } from './operations';
import type {
  PublicationObject,
  PublicationOperation,
  PublicationRepair,
  PublicationRepairContext,
  PublicationRepairResult,
} from './contracts';

/** External receipt correction; the host still installs it under administrative ownership and CAS. @internal */
export async function attestPublicationOperation<State extends PublicationObject>(
  context: PublicationRepairContext<PublicationObject, State>,
  providerId: string,
  verify: (context: PublicationRepairContext<PublicationObject, State>) => Promise<PublicationRepairResult<State>>
): Promise<PublicationRepairResult<State>> {
  const parameters = context.parameters;
  const operation = context.operations.find(op => op.id === parameters.operationId);
  const outcome = parameters.outcome;
  if (
    !operation ||
    parameters.intendedDigest !== operation.intendedDigest ||
    parameters.idempotencyKey !== publicationOperationIdempotencyKey({ ...context, providerId }, operation) ||
    (outcome !== 'confirmed' && outcome !== 'not_applied') ||
    parameters.priorOperationSettled !== true ||
    typeof parameters.evidenceReference !== 'string' ||
    !parameters.evidenceReference.trim() ||
    (outcome === 'confirmed'
      ? !isPublicationObject(parameters.externalReceipt) || Object.keys(parameters.externalReceipt).length === 0
      : parameters.nonApplicationVerified !== true)
  )
    throw new Error(
      'Attestation requires the exact operation/key/digest, settled call, external receipt or certified non-application, and evidenceReference'
    );
  const attestation: PublicationObject = {
    outcome,
    idempotencyKey: parameters.idempotencyKey,
    evidenceReference: parameters.evidenceReference.trim(),
    priorOperationSettled: true,
    ...(outcome === 'confirmed'
      ? { externalReceiptDigest: publicationDigest(parameters.externalReceipt) }
      : { nonApplicationVerified: true }),
  };
  if (operation.evidence.operatorAttestation !== undefined) {
    if (
      operation.outcome !== outcome ||
      publicationDigest(operation.evidence.operatorAttestation) !== publicationDigest(attestation)
    )
      throw new Error('An operation attestation cannot be replaced');
    return { state: context.state, operations: [...context.operations] };
  }
  if (!['submitted', 'uncertain'].includes(operation.outcome))
    throw new Error('Only an unresolved submission can receive an operator attestation');
  const attach = (op: PublicationOperation): PublicationOperation =>
    op.id === operation.id && op.outcome === outcome
      ? { ...op, evidence: { ...op.evidence, operatorAttestation: attestation } }
      : op;
  const result = await verify({
    ...context,
    withResourceLease: (namespace, key, run) =>
      context.withResourceLease(namespace, key, resource =>
        run({
          ...resource,
          journal: op => resource.journal(attach(op)),
        })
      ),
  });
  const settled = result.operations?.find(op => op.id === operation.id);
  if (!settled || settled.outcome !== outcome)
    throw new Error('Provider verification did not establish the attested operation outcome');
  return { ...result, operations: result.operations!.map(attach) };
}

/** Built-ins retain their exact read-back/settlement rules; an attestation never bypasses them. @internal */
export async function attestWithProviderRepair(
  context: PublicationRepairContext,
  repairs: readonly PublicationRepair[]
): Promise<PublicationRepairResult> {
  const repair = repairs.find(item => item.id === context.parameters.providerRepair);
  if (!repair?.run || ['link', 'relink'].includes(repair.id))
    throw new Error('An exact operation-specific provider verification repair is required');
  if (context.parameters.outcome === 'confirmed') {
    const receipt = context.parameters.externalReceipt;
    if (
      !isPublicationObject(receipt) ||
      receipt.operationId !== context.parameters.operationId ||
      receipt.intendedDigest !== context.parameters.intendedDigest ||
      (repair.id === 'reconcile-ingestion' && receipt.acceptedAt !== context.parameters.acceptedAt)
    )
      throw new Error('External receipt must identify the exact operation, intended digest and acceptance evidence');
  }
  return repair.run(context);
}
