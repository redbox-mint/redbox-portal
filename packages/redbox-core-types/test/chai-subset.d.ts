declare module 'chai-subset' {
  const chaiSubset: (chai: unknown, utils: unknown) => void;
  export default chaiSubset;
}

declare namespace Chai {
  interface Assertion {
    containSubset(expected: unknown): Assertion;
  }
}
