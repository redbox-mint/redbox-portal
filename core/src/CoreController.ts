import {existsSync} from 'fs';
import { ILogger } from './Logger';
import {
  BuildResponseType,
  APIErrorResponse,
  ApiVersion,
  ApiVersionStrings, RBValidationError,
} from "./model";


declare var _;
declare var sails;
declare var TranslationService;


export module Controllers.Core {

  /**
   * Core controller which defines common logic between controllers.
   *
   * Workflow details:
   * - First, the "_handleRequest" method must be called. It ensures common stuff happens, and bind some data into the option object.
   * - It calls a magic method such as "__beforeIndex" if the request was coming from an "index" method.
   * - If it doesn't find any specific magic method to call, it calls directly the "__beforeEach" method.
   * - If it does find a custom magic method, then the "__beforeIndex" will automatically call the "__beforeEach" once it is done.
   * - Once all the "__before" magic methods have been called, the caller's callback function is called.
   *
   * The options object contains specific stuff that belongs to the controllers logic, I could have use the req but I prefer not.
   *
   * The public methods such as index/show/etc. are defined but send by default a 404 response if they are not overridden in the child class.
   * They exists just to bind by default all these methods without take care if they exists or not in order to speed up development.
   */
  export class Controller {

    /**
     * Overrides for the settings in `config/controllers.js`
     * (specific to the controller where it's defined)
     * Specific to sails. Don't rename.
     */
    protected _config: any = {};

    /**
     * Exported methods. Must be overridden by the child to add custom methods.
     */
    protected _exportedMethods: string[] = [];

    /**
     * Theme used by the controller by default.
     * Could be overridden by the user theme. (One day, when the feature will be done...)
     */
    protected _theme: string = 'default';

    /**
     * Layout used by the controller by default.
     */
    protected _layout: string = 'default';

    /**
     * Relative path to a layout from a view.
     */
    protected _layoutRelativePath: string = '../_layouts/';

    /**
     * Default exported methods.
     * These methods will be accessible.
     */
    private _defaultExportedMethods: string[] = [
      // Sails controller custom config.
      '_config',
    ];

    // Namespaced logger for controllers
    private _logger: ILogger;

    /**
     * Get a namespaced logger for this controller class.
     * Uses the class constructor name as the namespace.
     * Falls back to this.logger if pino namespaced logging is not available.
     */
    protected get logger() {
      if (!this._logger && sails?.config?.log?.createNamespaceLogger && sails?.config?.log?.customLogger) {
        const controllerName = this.constructor.name + 'Controller';
        this._logger = sails.config.log.createNamespaceLogger(controllerName, sails.config.log.customLogger);
      }
      return this._logger || sails.log || console; // Fallback to this.logger or console if pino not available
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
     **************************************************************************************************
     **************************************** Public methods ******************************************
     **************************************************************************************************
     */

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
            this.logger.error('The method "' + methods[i] + '" is not public and cannot be exported. ' + this);
          }
        } else {
          this.logger.error('The method "' + methods[i] + '" does not exist on the controller ' + this);
        }
      }

      return exportedMethods;
    }

    /**
     **************************************************************************************************
     **************************************** Protected methods ******************************************
     **************************************************************************************************
     */

    /**
     * Acts as a requests workflow handler to automatically call magic methods such as "__before".
     * Used to call magic methods before the targeted methods is called.
     * Bind some data as well, like the current controller and action name.
     *
     * @param req       Request.
     * @param res       Response.
     * @param callback  Function to execute.
     * @param options   Object that contains options.
     *          controller  Controller      Child controller class. (static)
     *
     */
    protected _handleRequest(req, res, callback, options: any = {}): void {
      callback(req, res, options);
    }

    /**
     **************************************************************************************************
     **************************************** Controller basic methods ********************************
     **************************************************************************************************
     */

    /**
     * Displays the global content, displays several resources.
     * This method is just to return a 404 error and explain the role.
     *
     * @param req       Request.
     * @param res       Response.
     * @param callback  Function to execute.
     * @param options   Object that contains options.
     */
    public index(req, res, callback: any, options: any = {}) {
      res.notFound();
    }


    public _getResolvedView(branding: string, portal: string, view: string): string {
      var resolvedView: string = null;

      //Check if view exists for branding and portal
      var viewToTest: string = sails.config.appPath + "/views/" + branding + "/" + portal + "/" + view + ".ejs";
      if (existsSync(viewToTest)) {
        resolvedView = branding + "/" + portal + "/" + view;
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedView == null) {
        viewToTest = sails.config.appPath + "/views/default/" + portal + "/" + view + ".ejs";
        if (existsSync(viewToTest)) {
          resolvedView = "default/" + portal + "/" + view;
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedView == null) {
        viewToTest = sails.config.appPath + "/views/default/default/" + view + ".ejs";
        if (existsSync(viewToTest)) {
          resolvedView = "default/default/" + view;
        }
      }

      return resolvedView;
    }

    public _getResolvedLayout(branding: string, portal: string): string {
      var resolvedLayout: string = null;

      //Check if view exists for branding and portal
      var layoutToTest: string = sails.config.appPath + "/views/" + branding + "/" + portal + "/layout/layout.ejs";
      if (existsSync(layoutToTest)) {
        resolvedLayout = branding + "/" + portal + "/layout";
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedLayout == null) {
        layoutToTest = sails.config.appPath + "/views/default/" + portal + "/layout.ejs";
        if (existsSync(layoutToTest)) {
          resolvedLayout = "/default/" + portal + "/layout";
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedLayout == null) {
        layoutToTest = sails.config.appPath + "/views/default/default/" + "layout.ejs";
        if (existsSync(layoutToTest)) {
          resolvedLayout = "default/default/layout";
        }
      }

      return resolvedLayout;
    }

    public sendView(req, res, view: string, locals: any = {}) {

      if (req.options.locals == null) {
        req.options.locals = {};
      }
      var mergedLocal = (<any>Object).assign({}, req.options.locals, locals);

      var branding = mergedLocal['branding'];
      var portal = mergedLocal['portal'];

      var resolvedView: string = this._getResolvedView(branding, portal, view);
      var resolvedLayout: string = this._getResolvedLayout(branding, portal);

      // If we can resolve a layout set it.
      if (resolvedLayout != null && mergedLocal["layout"] != false) {
        res.locals.layout = resolvedLayout;
      }

      // View still doesn't exist so return a 404
      if (resolvedView == null) {
        res.notFound(mergedLocal, "404");
      }

      // Add some properties blueprints usually adds
      // TODO: Doesn't seem to be binding properly. Investigate
      mergedLocal.view = {};
      mergedLocal.view.pathFromApp = resolvedView;
      mergedLocal.view.ext = 'ejs';
      // merge with ng2 app...
      _.merge(mergedLocal, this.getNg2Apps(view));
      let fullViewPath = sails.config.appPath + "/views/"+resolvedView;
      mergedLocal['templateDirectoryLocation'] = fullViewPath.substring(0,fullViewPath.lastIndexOf('/') + 1);

      this.logger.debug("resolvedView");
      this.logger.debug(resolvedView);
      // this.logger.debug("mergedLocal");
      // this.logger.debug(mergedLocal);



      res.view(resolvedView, mergedLocal);
    }

    public respond(req, res, ajaxCb, normalCb, forceAjax=false) {
      if (this.isAjax(req) || forceAjax == true) {
        return ajaxCb(req, res);
      } else {
        return normalCb(req, res);
      }
    }

    protected isAjax(req) {
      return req.headers['x-source'] == 'jsclient';
    }

    protected ajaxOk(req, res, msg='', data=null, forceAjax=false) {
      if (!data) {
        data = {status:true, message:msg};
      }
      this.ajaxRespond(req, res, data, forceAjax);
    }

    protected ajaxFail(req, res, msg='', data=null, forceAjax=false) {
      if (!data) {
        data = {status:false, message:msg};
      }
      this.ajaxRespond(req, res, data, forceAjax);
    }

    protected apiFail(req, res, statusCode = 500, errorResponse:APIErrorResponse = new APIErrorResponse()) {
      // this.apiRespond(req, res, errorResponse, statusCode);
      res.set('Cache-control', 'no-cache');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 0);
        res.status(statusCode)
        return res.json(errorResponse);
    }

    protected apiRespond(req, res, jsonObj=null, statusCode=200) {
      var ajaxMsg = "Got ajax request, don't know what do...";
      this.respond(req, res,
        (req, res)=> {
        this.logger.verbose(ajaxMsg);
        // TODO: make this 400, not 404
        res.notFound(ajaxMsg);
        },
        (req, res) => {
        res.set('Cache-control', 'no-cache');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 0);
        res.status(statusCode)
        return res.json(jsonObj);
      });
    }

    protected ajaxRespond(req, res, jsonObj=null, forceAjax) {
      var notAjaxMsg = "Got non-ajax request, don't know what do...";
      this.respond(req, res, (req, res) => {
        res.set('Cache-control', 'no-cache');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 0);
        return res.json(jsonObj);
      }, (req, res)=> {
        this.logger.verbose(notAjaxMsg);
        // TODO: make this 400, not 404
        res.notFound(notAjaxMsg);
      }, forceAjax);
    }

    protected getNg2Apps(viewPath) {
      if (sails.config.ng2.use_bundled && sails.config.ng2.apps[viewPath]) {
        return {ng2_apps:sails.config.ng2.apps[viewPath]};
      } else {
        return {ng2_apps: []};
      }
    }

    /**
     * Get the API version from the request.
     * Defaults to v1.
     * @param req The sails request.
     * @return The API version string.
     * @private
     */
    private getApiVersion(req): ApiVersionStrings {
      const defaultVersion = ApiVersion.VERSION_1_0;

      const qs = req.query;
      const qsKey = "apiVersion";
      const qsKeyLower = qsKey.toLowerCase();

      const headers = req.headers;
      const headerKey = "X-ReDBox-Api-Version";
      const headerKeyLower = headerKey.toLowerCase();

      const qsValue = (_.get(qs, qsKey) ?? _.get(qs, qsKeyLower))?.toString()?.trim()?.toLowerCase();
      const headerValue = (_.get(headers, headerKey) ?? _.get(headers, headerKeyLower))?.toString()?.trim()?.toLowerCase();

      if (qsValue && headerValue && qsValue !== headerValue) {
        sails.log.error(`If API version is provided in querystring (${qsValue}) and HTTP header (${headerValue}), they must match. ` +
          `Using default API version (${defaultVersion}).`);
        return defaultVersion;
      }

      // Use the HTTP header value first, then the query string value, then the default.
      const version = headerValue ?? qsValue ?? defaultVersion;

      const available = Array.from(Object.values(ApiVersion));
      if (!available.includes(version)) {
        sails.log.error(`The provided API version (${version}) must be one of the known API versions: ${available.join(', ')}. ` +
          `Using default API version (${defaultVersion}).`);
        return defaultVersion;
      }

      sails.log.verbose(`Using API version '${version}' for url '${req.url}'.`);
      return version;
    }

    private isRBValidationError(item: unknown): item is RBValidationError {
      return item instanceof RBValidationError || (item instanceof Error && item?.name === 'RBValidationError');
    }

    /**
     * Send a response built from the properties.
     *
     * Defaults / Conventions:
     * - The default response format is 'json'.
     * - If only 'data' is provided, the 'status' will be 200.
     * - If there are any 'errors', the 'status' will default to 500. If there are no displayErrors, a generic one will be added.
     * - Any 'detailErrors' missing a 'status' will use the top-level 'status'.
     * - If the top-level status is not set, and there are detailErrors with a status,
     *   the top-level status will use 500 if any status start with 5,
     *   or 400 if any status start with 4,
     *   or 500 if there are any detailErrors.
     * - The response will be in the format matching the request kind (e.g. API, ajax).
     * - If there is no detailError.title or detailError.detail, and detailError.code is set, the 'code' will be used as a translation message identifier.
     *   The translated message will be set to title if it is falsy, otherwise detail if it is falsy.
     * - Both detailError.title and detailError.detail will be treated as translation message identifiers if they have no spaces.
     * - The detailError.code will be updated to add the prefix 'redbox-error-' if the prefix is not present.
     * - API v1 will return 'data' as the body on 'status' 200, if no 'v1' is supplied.
     *
     * @param req The sails request.
     * @param res The sails response.
     * @param buildResponse Build the response from these properties.
     * @protected
     */
    protected sendResp(req: any, res: any, buildResponse?: BuildResponseType): Response {
      // The response will be in the format matching the request kind (e.g. API, ajax).
      const apiVersion = this.getApiVersion(req);
      const isJsonAjax = this.isAjax(req);

      // Destructure build response properties and set defaults.
      let {
        // The default response format is 'json'.
        format = "json",
        data = {},
        status = 200,
        headers = {},
        errors = [],
        displayErrors = [],
        meta = {},
        v1,
      } = buildResponse ?? {};

      // Process the errors recursively
      const errorsToProcess: unknown[] = [...errors];
      while (errorsToProcess.length > 0) {
        // remove the first error in the array and process it
        const error = errorsToProcess.shift();

        // Log the error name, message, stack, or just the error if it is not an instance of Error.
        if (error instanceof Error) {
          sails.log.error(`Error '${error?.name}': ${error?.message} - ${error?.stack}`);
        } else {
          sails.log.error(`Error ${error}`);
        }

        // Extract and store displayErrors from any RBValidationErrors
        if (this.isRBValidationError(error)) {
          displayErrors.push(...error.displayErrors);
        }

        // Add any cause error to the array of errors to process.
        if (error instanceof Error && error?.cause !== undefined) {
          errorsToProcess.push(error.cause);
        }
      }

      // If there are any 'errors', the 'status' will default to 500.
      if (!status?.toString().startsWith('5') && errors.length > 0) {
        status = 500;
      }

      // If there are errors, but no display errors, add a generic display error.
      if (errors.length > 0 && displayErrors.length === 0) {
        displayErrors.push({code: 'server-error'});
      }

      // If the top-level status is not set, and there are detailErrors with a status,
      // the top-level status will use 500 if any status starts with 5,
      // or 400 if any status starts with 4,or 500 if there are any detailErrors.
      if ((status === null || status === undefined) && displayErrors.length > 0) {
        const statusString = displayErrors
          .map(i => i?.status?.toString() ?? "")
          .reduce((prev, curr) => {
            if (prev === null && curr?.toString().startsWith('4')) {
              return "400";
            }
            if (!prev?.toString()?.startsWith('5') && curr?.toString().startsWith('5')) {
              return "500";
            }
            return curr !== null && curr != undefined ? curr : null;
          }, null);
        try {
          status = parseInt(statusString ?? "500");
        } catch {
          // ignore
        }
      }

      // Set the response headers
      if (headers) {
        res.set(headers);
      }

      // Set the response status
      if (status !== null && status !== undefined) {
        res.status(status);
      }

      // if the response is a json format response with no errors, return the data in the expected API version.
      // If only 'data' is provided, the 'status' will be 200.
      if (
        format === 'json'
        && data !== null
        && data !== undefined
        && errors.length === 0
        && displayErrors.length === 0
        && !status?.toString().startsWith('5')
        && !status?.toString().startsWith('4')
        && (v1 === null || v1 === undefined)
      ) {
        switch (apiVersion) {
          case ApiVersion.VERSION_2_0:
            sails.log.verbose(`Send response status 200 api version 2 format json.`);
            return res.json({data: data, meta: meta});

          case ApiVersion.VERSION_1_0:
          default:
            sails.log.verbose(`Send response status 200 api version 1 format json.`);
            return res.json(data);
        }
      }

      // TODO:
      //   - If there is no detailError.title or detailError.detail, and detailError.code is set, the 'code' will be used as a translation message identifier.
      //     The translated message will be set to title if it is falsy, otherwise detail if it is falsy.
      //   - Both detailError.title and detailError.detail will be treated as translation message identifiers if they have no spaces.
      //   - The detailError.code will be updated to add the prefix 'redbox-error-' if the prefix is not present.
      //   - API v1 will return 'data' as the body on 'status' 200, if no 'v1' is supplied.

      // TODO: deal with responses in API v1 format

      // return this.sendResp(req, res, {
      //           errors: [err],
      //           structuredErrors: [{status: "500", title: 'Failed to get record permission, check server logs.'}]
      //         });
// return this.apiFailWrapper(req, res, 500, null, err,
//             'Failed to get record permission, check server logs.');


      // if (hasViewAccess) {
      //           if (apiVersion === ApiVersion.VERSION_2_0) {
      //             return res.json(this.buildResponseSuccess(record.metadata, {oid: record.redboxOid}));
      //           } else {
      //             return res.json(record.metadata);
      //           }
      //         } else {
      //           if (apiVersion === ApiVersion.VERSION_2_0) {
      //             return res.status(403).json(this.buildResponseError([{title: TranslationService.t("error-403-heading")}], {oid: record.redboxOid}));
      //           } else {
      //             return res.json({status: "Access Denied"});
      //           }
      //         }
    }
    /*

    private apiFailWrapper(
        req, res,
        statusCode = 500,
        errorResponse: APIErrorResponse = new APIErrorResponse(),
        error: Error = null,
        defaultMessage: string = null) {
      // TODO: incorporate some of this into the controller core apiFail function
      if (!errorResponse) {
        errorResponse = new APIErrorResponse();
        // start with an empty message
        errorResponse.message = "";
      }

      // if there is an error and/or defaultMessage, log it
      if (defaultMessage && error) {
        sails.log.error(errorResponse, defaultMessage, error);
      } else if (defaultMessage && !error) {
        sails.log.error(errorResponse, defaultMessage);
      } else if (!defaultMessage && error) {
        sails.log.error(errorResponse, error);
      }

      // TODO: use RBValidationError.clName;
      const rBValidationErrorName = 'RBValidationError';

      // if available, get the 'friendly' validation error message
      const validationMessage = (error?.name === rBValidationErrorName ? error?.message : "") || "";

      // update the api response message
      let message = (errorResponse.message || "").trim();
      if (validationMessage && message) {
        message = message.endsWith('.') ? (message + " " + validationMessage) : (message + ". " + validationMessage);
      } else if (validationMessage && !message) {
        message = validationMessage;
      } else if (!validationMessage && message) {
        // nothing to do
      } else {
        message = defaultMessage;
      }
      errorResponse.message = message;

      // TODO: could use: this.apiRespond(req, res, errorResponse, statusCode);
      return this.apiFail(req, res, statusCode, errorResponse);
    }

    protected customErrorMessageHandlingOnUpstreamResult(error, res) {
      sails.log.error(error);

      let errorMessage = "";

      // get the message from the error property
      if (error.error) {
        errorMessage = _.isBuffer(error.error) ? error.error.toString('UTF-8') : error.error;
      }

      // get the 'friendly' Error message
      // TODO: use RBValidationError.clName;
      const rBValidationErrorName = 'RBValidationError';
      if (!errorMessage && error?.name == rBValidationErrorName && error?.message) {
        errorMessage = error.message
      }

      // the message might be JSON - try to parse it
      try {
        errorMessage = JSON.parse(errorMessage)
      } catch (error) {
        sails.log.verbose("Error message is not a json object. Keeping it as is.");
      }

      // use a prefix message to give some context
      errorMessage = 'There was a problem with the upstream request.' + (errorMessage ? " " : "") + errorMessage.trim();

      // set the response to be json,
      // in case the response was already changed to suit the attachment
      res.set('Content-Type', 'application/json');
      _.unset(res, 'Content-Disposition');

      sails.log.error('customErrorMessageHandlingOnUpstreamResult', errorMessage);
      return res.status(error.statusCode || 500).json({message: errorMessage});
    }

     if (apiVersion === ApiVersion.VERSION_2_0) {
            return res.status(403).json(this.buildResponseError([{title: TranslationService.t("error-403-heading")}], {oid: record.redboxOid}));
          } else {
            return res.json({status: "Access Denied"});
          }


if (apiVersion === ApiVersion.VERSION_2_0) {
              return this.ajaxFail(req, res, null, this.buildResponseError([{detail: msg}], null));
            } else {
              return this.ajaxFail(req, res, null, {message: msg});
            }


            if (apiVersion === ApiVersion.VERSION_2_0) {
            this.ajaxOk(req, res, null, await this.buildResponseSuccessRecord(createResponse.oid, {...createResponse}));
          } else {
            this.ajaxOk(req, res, null, createResponse);
          }

          private getErrorMessage(err: Error, defaultMessage: string) {
      // TODO: use RBValidationError.clName;
      const validationName = 'RBValidationError';
      return validationName == err.name ? err.message : defaultMessage;
    }
     */

    // /**
    //  * Build a success response with the provided data and meta items.
    //  * @param data The primary data for the response.
    //  * @param meta The metadata for the response.
    //  * @protected
    //  */
    // private buildResponseSuccess(data: unknown, meta: Record<string, unknown>): DataResponseV2 {
    //   // TODO: build a consistent response structure - 'data' is primary payload, 'meta' is addition detail
    //   return {
    //     data: data,
    //     meta: {...Object.entries(meta ?? {})},
    //   }
    // }
    //
    // /**
    //  * Build an error response with the provided data and meta items.
    //  * @param errors The error details for the response.
    //  * @param meta The metadata for the response.
    //  * @protected
    //  */
    // private buildResponseError(errors: ErrorResponseItemV2[], meta: Record<string, unknown>): ErrorResponseV2 {
    //   // TODO: build a consistent response structure - 'errors' is primary payload, 'meta' is addition detail
    //   return {
    //     errors: errors,
    //     meta: {...Object.entries(meta ?? {})},
    //   }
    // }
  }
}
