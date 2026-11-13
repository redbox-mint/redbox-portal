/** Public artifact cookie policy shares identity with the qualified request view. */
const requests = new WeakMap<object, { immutable: boolean }>();
export function bindAssetRequestView(source: object, view: object): void {
  let state = requests.get(source);
  if (!state) requests.set(source, (state = { immutable: false }));
  requests.set(view, state);
}
export function markImmutableAsset(request: object): void {
  let state = requests.get(request);
  if (!state) requests.set(request, (state = { immutable: false }));
  state.immutable = true;
}
export function isImmutableAsset(request: object): boolean {
  return requests.get(request)?.immutable === true;
}
