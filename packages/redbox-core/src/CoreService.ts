import { convertToType } from './utilities/convertToType';
import { metTriggerCondition } from './utilities/metTriggerCondition';
import { bindNodeCallback, bindCallback, Observable, defer } from 'rxjs';

import * as _ from 'lodash';
import { CoreBase } from './CoreBase';
import { recordServiceChronicle } from './utilities/serviceChronicle';

// Type alias for query objects used with RxJS bindings
type QueryObject = object;

export namespace Services.Core {
  /**
   * Shared Observable and logging utilities for explicitly constructed services.
   *
   * @extensionPoint Services may extend this utility class with an injected logger; application factories own their dependencies and lifecycle.
   * @remarks Constructors are synchronous. Application modules await initialization before activation.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture
   */
  export class Service extends CoreBase {
    /**
     * Default exported methods.
     * These methods will be accessible.
     */
    private _defaultExportedMethods: string[] = ['convertToType'];

    protected logHeader: string = '';

    protected _loggerNamespaceSuffix: string = 'Service';

    /**
     * Add safe service summaries to the current HTTP request without passing req.
     * Outside HTTP requests, emit the same bounded summaries through the namespace logger.
     * Errors and late work remain visible, and recording never changes service behavior.
     */
    protected updateChronicle(
      info: Record<string, unknown>,
      errors: unknown[] = [],
      level: 'debug' | 'info' | 'warn' = 'debug'
    ): void {
      recordServiceChronicle(this.logger, info, errors, level);
    }

    /**
     * Wrap a loaded query or a lazy repository operation in an Observable.
     * @param q A query with exec, or a function returning a repository Promise
     * @param method The method to call on q (default: 'exec')
     * @param type The binding type: 'node' for node-style callbacks, otherwise regular callbacks
     */
    protected getObservable<T = unknown>(
      q: QueryObject,
      method: string = 'exec',
      type: string = 'node'
    ): Observable<T> {
      if (typeof q === 'function') {
        // Match deferred queries: start once on first subscription, and retain
        // the same result/error for later subscriptions to this service call.
        let pending: Promise<T> | undefined;
        return defer(() => (pending ??= Promise.resolve().then(q as () => PromiseLike<T>)));
      }
      const fn = (q as Record<string, (...args: unknown[]) => unknown>)[method];
      if (type == 'node') {
        return bindNodeCallback(fn.bind(q))() as Observable<T>;
      }
      return bindCallback(fn.bind(q))() as Observable<T>;
    }

    /**
     * Wrapper for straightforward query, no chaining..
     */
    protected exec(q: QueryObject, successFn: (value: unknown) => void, errorFn: (error: unknown) => void): void {
      this.getObservable(q).subscribe(successFn, errorFn);
    }

    /** Optional synchronous setup hook; async lifecycle belongs to the owning application module. */
    public init(): void {
      // Override in sub class as needed
    }
    /**
     * Returns an object that contains all exported methods of the controller.
     * These methods must be defined in either the "_defaultExportedMethods" or "_exportedMethods" arrays.
     *
     * @returns {*}
     */
    public exports(): Record<string, unknown> {
      const exportedMethods: Record<string, unknown> = {};
      const methods = this._defaultExportedMethods.concat(this._exportedMethods);
      const service = this as Record<string, unknown>;
      for (const methodName of methods) {
        const member = service[methodName];
        if (methodName.startsWith('_')) {
          this.logger.error(
            `The service method "${methodName}" is not public and cannot be exported from ${this.constructor?.name}`
          );
        } else if (member === undefined) {
          this.logger.error(`The service method "${methodName}" does not exist on ${this.constructor?.name}`);
        } else {
          exportedMethods[methodName] = _.isFunction(member) ? member.bind(this) : member;
        }
      }

      return exportedMethods;
    }

    /**
     * returns a string that is 'true' or 'false' (literal) depending on whether the 'options.triggerCondition' is met!
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid {string} The record oid.
     * @param  record The record data.
     * @param  options The options for the trigger.
     * @param  user The user that triggered the hook, optional.
     * @return {"true"|"false"} "true" if the condition passed, otherwise "false".
     */
    protected metTriggerCondition(
      oid: string | null,
      record: Record<string, unknown>,
      options: Record<string, unknown>,
      user?: unknown
    ): string {
      if (!user) this.logger.trace('No user in metTriggerCondition');
      return metTriggerCondition(oid, record, options, user);
    }

    protected sleep(ms: number): Promise<void> {
      return new Promise(resolve => {
        setTimeout(resolve, ms);
      });
    }
    /**
     * Convenience method to quickly assign properties of one type to another. Note type-safety isn't fully guaranteed.
     *
     * Usually used to convert to/from DTOs. Destination object constructing is left to the callee.
     *
     * TODO: source and dest can be made more type safe
     *
     * @param source
     * @param dest
     * @param mapping
     * @param appendMappingToSource
     * @returns
     */
    public convertToType<Type>(
      source: Record<string, unknown>,
      dest: Record<string, unknown>,
      mapping: { [key: string]: string } | undefined,
      appendMappingToSource: boolean = false
    ): Type {
      return convertToType<Type>(source, dest, mapping, appendMappingToSource);
    }
  }
}
