import { from, bindNodeCallback, bindCallback, Observable } from 'rxjs';


declare var sails: Sails.Application;
// changed to a manual lodash load instead of relying on Sails global object
// this enables testing of installable hooks that rely on services at load-time (i.e. index.js)
import * as  _ from 'lodash';
import { ILogger } from './Logger';

export module Services.Core {
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

    protected logHeader: string;

    // Namespaced logger for services
    private _logger: ILogger;

    /**
     * Get a namespaced logger for this service class.
     * Uses the class constructor name as the namespace.
     * Falls back to sails.log if pino namespaced logging is not available.
     */
    protected get logger(): ILogger {
      if (typeof sails !== 'undefined' && !this._logger && sails.config?.log?.createNamespaceLogger && sails.config?.log?.customLogger) {
        const serviceName = this.constructor.name + 'Service';
        this._logger = sails.config.log.createNamespaceLogger(serviceName, sails.config.log.customLogger);
      }
      // Prefer _logger, then sails.log; cast sails.log to ILogger since it implements all required methods
      if (this._logger) {
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
    protected registerSailsHook(action: 'on', eventName: string, handler: (...args: any[]) => void | Promise<void>): boolean;
    protected registerSailsHook(action: 'after', eventName: string | string[], handler: (...args: any[]) => void | Promise<void>): boolean;
    protected registerSailsHook(action: 'on' | 'after', eventName: string | string[], handler: (...args: any[]) => void | Promise<void>): boolean {
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
    */
    protected getObservable(q, method = 'exec', type = 'node'): Observable<any> {
      if (type == 'node')
        return bindNodeCallback(q[method].bind(q))();
      else
        return bindCallback(q[method].bind(q))();
    }

    /**
    * Wrapper for straightforward query, no chaining..
    */
    protected exec(q, successFn, errorFn) {
      this.getObservable(q).subscribe(successFn, errorFn);
    }

    constructor() {
      this.processDynamicImports().then(result => {
        this.logger.verbose("Dynamic imports imported");
        this.onDynamicImportsCompleted();
      })
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
    public exports(): any {
      let exportedMethods: any = {};
      if (process.env["sails_redbox__mochaTesting"] === "true") {
        const allProperties = [
          ...Object.getOwnPropertyNames(Object.getPrototypeOf(this)), // Prototype methods
          ...Object.getOwnPropertyNames(this), // Instance properties
        ];


        const uniqueProperties = Array.from(new Set(allProperties));
        uniqueProperties.forEach((property) => {
          const value = (this as any)[property];

          // Check if the property is a function
          if (typeof value === "function" && property !== "constructor") {
            exportedMethods[property] = value.bind(this); // Bind the method to maintain `this` context
          }

        });
        this.logger.error("Exported Methods for Mocha Testing: ", exportedMethods);
      } else {
        // Merge default array and custom array from child.
        let methods: any = this._defaultExportedMethods.concat(this._exportedMethods);


        for (let i = 0; i < methods.length; i++) {
          // Check if the method exists.
          if (typeof this[methods[i]] !== 'undefined') {
            // Check that the method shouldn't be private. (Exception for _config, which is a sails config)
            if (methods[i][0] !== '_' || methods[i] === '_config') {

              if (_.isFunction(this[methods[i]])) {
                exportedMethods[methods[i]] = this[methods[i]].bind(this);
              } else {
                exportedMethods[methods[i]] = this[methods[i]];
              }
            } else {
              this.logger.error(`The service method "${methods[i]}" is not public and cannot be exported from ${this.constructor?.name}`);
            }
          } else {
            this.logger.error(`The service method "${methods[i]}" does not exist on ${this.constructor?.name}`);
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
    protected metTriggerCondition(oid, record, options, user?) {
      const triggerCondition = _.get(options, "triggerCondition", "");
      const forceRun = _.get(options, "forceRun", false);
      const variables = {
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

    protected sleep(ms) {
      return new Promise(resolve => {
        setTimeout(resolve, ms)
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
    public convertToType<Type>(source: any, dest: any, mapping: { [key: string]: string } | undefined, appendMappingToSource: boolean = false): Type {
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
