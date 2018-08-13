import { Observable } from 'rxjs/Rx';
declare var sails: Sails;

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
    ];
    /**
    * Returns an RxJS Observable wrapped nice and tidy for your subscribing pleasure
    */
    protected getObservable(q, method='exec', type='node'): Observable<any> {
      if (type == 'node')
        return Observable.bindNodeCallback(q[method].bind(q))();
      else
        return Observable.bindCallback(q[method].bind(q))();
    }

    /**
    * Wrapper for straightforward query, no chaining..
    */
    protected exec(q, successFn, errorFn) {
      this.getObservable(q).subscribe(successFn, errorFn);
    }
    /**
     * Returns an object that contains all exported methods of the controller.
     * These methods must be defined in either the "_defaultExportedMethods" or "_exportedMethods" arrays.
     *
     * @returns {*}
     */
    public exports(): any {
      // Merge default array and custom array from child.
      var methods: any = this._defaultExportedMethods.concat(this._exportedMethods);
      var exportedMethods: any = {};

      for (var i = 0; i < methods.length; i++) {
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
            console.error('The method "' + methods[i] + '" is not public and cannot be exported. ' + this);
          }
        } else {
          console.error('The method "' + methods[i] + '" does not exist on the controller ' + this);
        }
      }

      return exportedMethods;
    }

    /**
     * returns a string that is 'true' or 'false' (literal) depending on whether the 'options.triggerCondition' is met!
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid
     * @param  record
     * @param  options
     * @return
     */
    protected metTriggerCondition(oid, record, options) {
      const triggerCondition = _.get(options, "triggerCondition", "");
      const forceRun = _.get(options, "forceRun", false);
      const variables = {
        imports: {
          record: record,
          oid: oid
        }
      };
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
  }
}
