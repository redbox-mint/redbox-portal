import type { ReferenceRequest } from './reference';

/** Shared input preparation, after beforeAction hooks and before validation. */
export interface RequestPreparation<Input> {
  run(input: Input, request: ReferenceRequest): ReferenceRequest | Promise<ReferenceRequest>;
}
// Completion identities only: never retain request-derived values or promises.
// A transport may validate prepared inputs before delegating to the shared action.
const completed = new WeakMap<object, ReadonlySet<object>>();
export function inheritRequestPreparation(source: object, target: object): void {
  const identities = completed.get(source);
  if (identities) completed.set(target, identities);
}
export async function prepareReferenceRequest<Input>(
  input: Input,
  request: ReferenceRequest,
  preparation: RequestPreparation<Input>
): Promise<ReferenceRequest> {
  const identities = completed.get(request);
  if (identities?.has(preparation)) return request;
  const result = await preparation.run(input, request);
  completed.set(result, new Set([...(identities ?? []), preparation]));
  return result;
}
