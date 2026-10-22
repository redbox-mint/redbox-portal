/** Share fixtures with legacy model spies until the remaining consumers move. */
export const repositoryFixtures: Record<string, any> = new Proxy({}, {
  get: (_target, property) => Reflect.get(globalThis, property),
  set: (_target, property, value) => Reflect.set(globalThis, property, value),
  deleteProperty: (_target, property) => Reflect.deleteProperty(globalThis, property),
});
