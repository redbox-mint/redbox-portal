import _ from 'lodash';
import { Services as Owned, emailExportedMethods } from '../../integrations/Email';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';
export namespace Services {
  export class Email extends Owned.Email {
    constructor() {
      super({
        get config() {
          return sails.config.emailnotification;
        },
        get log() {
          return sails.log;
        },
        get disabled() {
          return String(_.get(sails.config.services, 'email.disabled')) === 'true';
        },
        get templateContext() {
          return sails.config;
        },
        resolveHook: name => eval(name),
        retainFollowup: work => {
          void retainHttpRequestFollowup(
            sails,
            work.then(() => {})
          );
        },
      });
    }
    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing email method');
          return [name, method.bind(this)];
        })
      );
    }
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/email');
export function sailsEmailExports(): Record<string, unknown> {
  return Object.fromEntries(
    emailExportedMethods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.Email | undefined;
        if (!instance) {
          instance = new Services.Email();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing email method');
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
