import { Services as Owned } from '../../progress/Asynchs';
import { getProgressRepositories } from '../../persistence/progress/runtime';
export namespace Services {
  export class Asynchs extends Owned.Asynchs {
    constructor() {
      super({
        startProgress: values => getProgressRepositories().progress.startProgress(values),
        reviseProgress: (criteria, values) => getProgressRepositories().progress.reviseProgress(criteria, values),
        listProgress: criteria => getProgressRepositories().progress.listProgress(criteria),
        removeProgress: criteria => getProgressRepositories().progress.removeProgress(criteria),
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing progress method');
          return [name, method.bind(this)];
        })
      );
    }
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/asynchs');
export function sailsAsynchsExports(): Record<string, unknown> {
  return Object.fromEntries(
    ['start', 'update', 'finish', 'get'].map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.Asynchs | undefined;
        if (!instance) {
          instance = new Services.Asynchs();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing progress method');
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
