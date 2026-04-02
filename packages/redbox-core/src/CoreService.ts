import { bindNodeCallback, bindCallback, Observable } from 'rxjs';


// changed to a manual lodash load instead of relying on Sails global object
// this enables testing of installable hooks that rely on services at load-time (i.e. index.js)
import * as _ from 'lodash';
import { ILogger } from './Logger';

// Type alias for query objects used with RxJS bindings
type QueryObject = object;

export namespace Services.Core {
  export class Service {
    /**
     * Exported methods. Must be overridden by the child to add custom methods.
     */
    protected _exportedMethods: string[] = [];
    /**
     * Default exported methods.
     * These methods will be accessible.
     */
    private _defaultExportedMethods: string[] = [
      // Sails controller custom config.
      '_config',
      'convertToType'
    ];

    protected logHeader: string = '';

    // Namespaced logger for services
    private _logger: ILogger | null = null;

    /**
     * Get a namespaced logger for this service class.
     * Uses the class constructor name as the namespace.
     * Falls back to sails.log if pino namespaced logging is not available.
     */
    protected get logger(): ILogger {
      if (typeof sails !== 'undefined' && this._logger === null && sails.config?.log?.createNamespaceLogger && sails.config?.log?.customLogger) {
        const serviceName = this.constructor.name + 'Service';
        this._logger = sails.config.log.createNamespaceLogger(serviceName, sails.config.log.customLogger);
      }
      // Prefer _logger, then sails.log; cast sails.log to ILogger since it implements all required methods
      if (this._logger !== null) {
        return this._logger;
      }
      
      if (typeof sails !== 'undefined' && sails.log) {
        return sails.log as unknown as ILogger;
      }

      // Fallback logger for when sails is not defined (e.g. during shim generation)
      return {
        crit: console.error,
        error: console.error,
        warn: console.warn,
        debug: console.debug,
        info: console.info,
        verbose: console.log,
        silly: console.log,
        blank: console.log,
        trace: console.trace,
        log: console.log,
        fatal: console.error,
        silent: () => {}
      };
    }

    /**
     * Registers a Sails hook handler if Sails is available.
     */
    protected registerSailsHook(action: 'on', eventName: string, handler: (...args: unknown[]) => void | Promise<void>): boolean;
    protected registerSailsHook(action: 'after', eventName: string | string[], handler: (...args: unknown[]) => void | Promise<void>): boolean;
    protected registerSailsHook(action: 'on' | 'after', eventName: string | string[], handler: (...args: unknown[]) => void | Promise<void>): boolean {
      if (typeof sails === 'undefined') {
        return false;
      }
      if (action === 'on') {
        if (typeof sails.on !== 'function') {
          return false;
        }
        sails.on(eventName as string, handler);
        return true;
      }
      if (typeof sails.after !== 'function') {
        return false;
      }
      sails.after(eventName, handler);
      return true;
    }
    /**
    * Returns an RxJS Observable wrapped nice and tidy for your subscribing pleasure
    * @param q The query object with an exec or similar method
    * @param method The method to call on q (default: 'exec')
    * @param type The binding type: 'node' for node-style callbacks, otherwise regular callbacks
    */
    protected getObservable<T = unknown>(q: QueryObject, method: string = 'exec', type: string = 'node'): Observable<T> {
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

    constructor() {
      this.processDynamicImports().then(() => {
        this.logger.verbose("Dynamic imports imported");
        this.onDynamicImportsCompleted();
      });
    }

    /**
     * Function that allows async dynamic imports of modules (such as ECMAScript modules).
     * Called in the constructor and intended to be overridden in sub class to allow imports.
     */
    protected async processDynamicImports() {
      // Override in sub class as needed
    }

    /**
     * Function that is called during the construction of the Controller after the dynamic imports are completed.
     * Intended to be overridden in the sub class
     */
    protected onDynamicImportsCompleted() {
      // Override in sub class as needed
    }

    /**
     * Initialization method called during bootstrap for services that need to register
     * hooks or perform other setup after Sails is available.
     * Override in subclass to implement custom initialization logic.
     * Called by coreBootstrap() for all services loaded via redbox-loader shims.
     */
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
      if (process.env["sails_redbox__mochaTesting"] === "true") {
        const allProperties = [
          ...Object.getOwnPropertyNames(Object.getPrototypeOf(this)), // Prototype methods
          ...Object.getOwnPropertyNames(this), // Instance properties
        ];


        const uniqueProperties = Array.from(new Set(allProperties));
        uniqueProperties.forEach((property) => {
          const value = (this as Record<string, unknown>)[property];

          // Check if the property is a function
          if (typeof value === "function" && property !== "constructor") {
            exportedMethods[property] = (value as (...args: unknown[]) => unknown).bind(this); // Bind the method to maintain `this` context
          }

        });
        this.logger.error("Exported Methods for Mocha Testing: ", exportedMethods);
      } else {
        // Merge default array and custom array from child.
        const methods = this._defaultExportedMethods.concat(this._exportedMethods);
        const service = this as Record<string, unknown>;


        for (let i = 0; i < methods.length; i++) {
          const methodName = methods[i];
          const member = service[methodName];
          // Check if the method exists.
          if (typeof member !== 'undefined') {
            // Check that the method shouldn't be private. (Exception for _config, which is a sails config)
            if (methodName[0] !== '_' || methodName === '_config') {

              if (_.isFunction(member)) {
                exportedMethods[methodName] = (member as (...args: unknown[]) => unknown).bind(this);
              } else {
                exportedMethods[methodName] = member;
              }
            } else {
              this.logger.error(`The service method "${methodName}" is not public and cannot be exported from ${this.constructor?.name}`);
            }
          } else {
            // _config is optional for Sails services, so we don't log an error if it's missing.
            if (methodName !== '_config') {
              this.logger.error(`The service method "${methodName}" does not exist on ${this.constructor?.name}`);
            }
          }
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
    protected metTriggerCondition(oid: string, record: Record<string, unknown>, options: Record<string, unknown>, user?: Record<string, unknown> | null): string {
      const triggerCondition = _.get(options, "triggerCondition", "") as string;
      const forceRun = _.get(options, "forceRun", false) as boolean;
      const variables = {
        record: record,
        oid: oid,
        user: user || null,
        imports: {
          record: record,
          oid: oid,
          user: user || null,
        }
      };

      if (!user) {
        this.logger.trace("No user in metTriggerCondition");
      }
      if (!_.isUndefined(triggerCondition) && !_.isEmpty(triggerCondition)) {
        const compiled = _.template(triggerCondition, variables);
        return compiled();
      } else if (forceRun) {
        return "true";
      } else {
        // if trigger condition is not set, fail fast!
        return "false";
      }
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
    public convertToType<Type>(source: Record<string, unknown>, dest: Record<string, unknown>, mapping: { [key: string]: string } | undefined, appendMappingToSource: boolean = false): Type {
      let fields = _.mapValues(dest, (val, key) => {
        return key;
      });
      if (appendMappingToSource) {
        fields = _.merge(fields, mapping);
      } else {
        // make the mapping optional
        fields = _.isUndefined(mapping) ? fields : mapping;
      }
      // force to enumerable string keyed only, transforming at the root level
      _.forOwn(fields, (destKey, srcKey) => {
        _.set(dest, destKey, source[srcKey]);
      });
      return dest as Type;
    }
  }
}
