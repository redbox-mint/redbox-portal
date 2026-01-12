import {existsSync} from 'fs';
import {ILogger} from './Logger';
import {
  BuildResponseType,
  APIErrorResponse,
  ApiVersion,
  ApiVersionStrings,
  RBValidationError,
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
      let fullViewPath = sails.config.appPath + "/views/" + resolvedView;
      mergedLocal['templateDirectoryLocation'] = fullViewPath.substring(0, fullViewPath.lastIndexOf('/') + 1);

      this.logger.debug("resolvedView");
      this.logger.debug(resolvedView);
      // this.logger.debug("mergedLocal");
      // this.logger.debug(mergedLocal);


      res.view(resolvedView, mergedLocal);
    }

    public respond(req, res, ajaxCb, normalCb, forceAjax = false) {
      if (this.isAjax(req) || forceAjax == true) {
        return ajaxCb(req, res);
      } else {
        return normalCb(req, res);
      }
    }

    protected isAjax(req) {
      return req.headers['x-source'] == 'jsclient';
    }

    protected ajaxOk(req, res, msg = '', data = null, forceAjax = false) {
      if (!data) {
        data = {status: true, message: msg};
      }
      this.ajaxRespond(req, res, data, forceAjax);
    }

    protected ajaxFail(req, res, msg = '', data = null, forceAjax = false) {
      if (!data) {
        data = {status: false, message: msg};
      }
      this.ajaxRespond(req, res, data, forceAjax);
    }

    protected apiFail(req, res, statusCode = 500, errorResponse?: APIErrorResponse) {
      this.setNoCacheHeaders(req, res);
      res.status(statusCode);
      return res.json(errorResponse ?? new APIErrorResponse());
    }

    protected apiRespond(req, res, jsonObj = null, statusCode = 200) {
      const that = this;
      const ajaxMsg = "Got ajax request, don't know what do...";
      this.respond(req, res,
        (req, res) => {
          that.logger.verbose(ajaxMsg);
          that.setNoCacheHeaders(req, res);
          res.badRequest(ajaxMsg);
        },
        (req, res) => {
          that.setNoCacheHeaders(req, res);
          res.status(statusCode)
          return res.json(jsonObj);
        });
    }

    protected ajaxRespond(req, res, jsonObj = null, forceAjax) {
      const that = this;
      const notAjaxMsg = "Got non-ajax request, don't know what do...";
      this.respond(req, res,
        (req, res) => {
          that.setNoCacheHeaders(req, res);
          return res.json(jsonObj);
        },
        (req, res) => {
          that.logger.verbose(notAjaxMsg);
          that.setNoCacheHeaders(req, res);
          res.badRequest(notAjaxMsg);
        },
        forceAjax);
    }

    protected getNg2Apps(viewPath) {
      if (sails.config.ng2.use_bundled && sails.config.ng2.apps[viewPath]) {
        return {ng2_apps: sails.config.ng2.apps[viewPath]};
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

    /**
     * Send a response built from the properties.
     *
     * Defaults / Conventions:
     * - The default response format is 'json'.
     * - If only 'data' is provided, the 'status' will be 200.
     * - If there are any 'errors', the 'status' will default to 500.
     * - If there are no displayErrors, a generic one will be added.
     * - Errors are never used as display errors, to avoid revealing implementation details.
     * - If there are any displayErrors:
     *   - the top-level status will be 500 if any status starts with 5, or
     *   - the top-level status will be 400 if any status starts with 4 and no statuses start with a 5, or
     *   - the top-level status will be 500 if none of the display errors has a status, and the top-level status is not already 4xx or 5xx.
     * - The response will be in the format matching the request kind (e.g. API, ajax).
     * - If there is no displayError.title and no displayError.detail, and displayError.code is set,
     *   the displayError.code will be used as a translation message identifier for displayError.title.
     * - Both displayError.title and displayError.detail will be treated as translation message identifiers.
     * - API v1 will return 'v1' if it is set.
     * - API v1 will return 'data' as the body on 'status' 200, if no 'v1' is supplied.
     *
     * @param req The sails request.
     * @param res The sails response.
     * @param buildResponse Build the response from these properties.
     * @protected
     */
    protected sendResp(req: any, res: any, buildResponse?: BuildResponseType): Response {
      const apiVersion = this.getApiVersion(req);
      // TODO: The response will be in the format matching the request kind (e.g. API, ajax).
      //       What difference is there between the response formats?
      // const isJsonAjax = this.isAjax(req);

      // Destructure build response properties and set defaults.
      let {
        format = "json",
        data = {},
        // Response status defaults to 200.
        status = 200,
        headers = {},
        errors = [],
        displayErrors = [],
        meta = {},
        v1 = null,
      } = buildResponse ?? {};

      // Collect and process the errors recursively
      const {
        errors: collectedErrors,
        displayErrors: collectedDisplayErrors
      } = RBValidationError.collectErrors(errors, displayErrors);

      // Log each error.
      sails.log.verbose(`Collected ${collectedErrors.length} ${collectedErrors.length === 1 ? 'error' : 'errors'} in sendResp.`);
      for (const error of collectedErrors) {
        sails.log.error(`Collected error in sendResp:`, error);
      }

      // If there are errors, but no display errors, add a generic display error.
      if (collectedErrors.length > 0 && collectedDisplayErrors.length === 0) {
        collectedDisplayErrors.push({code: 'server-error'});
      }

      // If there are any displayErrors:
      // - the top-level status will be 500 if any status starts with 5, or
      // - the top-level status will be 400 if any status starts with 4 and no statuses start with a 5, or
      // - the top-level status will be 500 if none of the display errors has a status, and the top-level status is not already 4xx or 5xx.
      if (collectedDisplayErrors.length > 0) {
        const statusString = collectedDisplayErrors
          .map(i => i?.status?.toString() ?? "")
          .reduce((prev, curr) => {
            const currStr = curr?.toString() || "";
            const prevStr = prev?.toString() || "";
            if (!prevStr.startsWith('5') && !prevStr.startsWith('4') && currStr.startsWith('4')) {
              return "400";
            }
            if (!prevStr.startsWith('5') && currStr.startsWith('5')) {
              return "500";
            }
            return currStr || prevStr;
          }, status?.toString() || "");
        try {
          sails.log.verbose(`sendResp statusString ${statusString}`);
          status = parseInt(statusString || "500");
        } catch (error) {
          sails.log.error(`Error in sendResp reducing status ${status}:`, error);
        }
      }
      sails.log.verbose(`sendResp status ${status}`);

      // Set the response headers
      if (headers) {
        res.set(headers);
      }

      // Set the response status
      if (status !== null && status !== undefined && !isNaN(status)) {
        res.status(status);
      } else {
        // Set response status to 500 if status was not calculated correctly.
        res.status(500)
      }

      // if the response is a json format response with no errors, return the data in the expected API version.
      // If 'v1' is provided, it will be used for version 1 responses.
      if (
        format === 'json'
        && collectedErrors.length === 0
        && collectedDisplayErrors.length === 0
        && !status?.toString().startsWith('5')
        && !status?.toString().startsWith('4')
        && (
          (data !== null && data !== undefined) ||
          (
            ((v1 !== null && v1 !== undefined) || (data !== null && data !== undefined)) &&
            apiVersion === ApiVersion.VERSION_1_0
          )
        )
      ) {
        switch (apiVersion) {
          case ApiVersion.VERSION_2_0:
            sails.log.verbose(`Send response status ${status} api version 2 format json.`);
            return res.json({data: data, meta: meta});

          case ApiVersion.VERSION_1_0:
          default:
            sails.log.verbose(`Send response status ${status} api version 1 format json.`);
            return res.json(v1 ?? data);
        }
      }

      // If there are any display errors and API is version 1, send the conventional error response format.
      if (collectedDisplayErrors.length > 0 && apiVersion === ApiVersion.VERSION_1_0) {
        const errorResponse = new APIErrorResponse();
        errorResponse.message = RBValidationError.displayMessage({
          t: TranslationService,
          displayErrors: collectedDisplayErrors
        });
        sails.log.verbose(`Send response status ${status} api version 1 errors in format json.`);
        return res.json(errorResponse);
      }

      // If 'v1' is provided and the response is in version 1 format, respond with v1.
      if (v1 !== null && v1 !== undefined && apiVersion === ApiVersion.VERSION_1_0) {
        sails.log.verbose(`Send response status ${status} api version 1 format json.`);
        return res.json(v1);
      }

      // If version is 2 and there are any errors, respond with version 2 error format
      if (collectedDisplayErrors.length > 0 && apiVersion === ApiVersion.VERSION_2_0) {
        sails.log.verbose(`Send response status ${status} api version 2 format json.`);
        const t = TranslationService.t;
        const formattedErrors = collectedDisplayErrors.map(displayError => {
          const code = displayError.code?.toString()?.trim() || "";
          let title = displayError.title?.toString()?.trim() || "";
          let detail = displayError.detail?.toString()?.trim() || "";

          if (code && !title && !detail) {
            title = code;
          }

          if (title) {
            displayError.title = t(title);
          }
          if (detail) {
            displayError.detail = t(detail);
          }
          return displayError;
        });
        sails.log.verbose(`Send response status ${status} api version 2 errors in format json.`);
        return res.json({errors: formattedErrors, meta: meta});
      }

      // TODO: log unknown situations so they can be considered.
      sails.log.error(`Unknown situation in sendResp: ${JSON.stringify({
        format, data, status, headers, collectedErrors, collectedDisplayErrors, meta, v1,
      })}`);
      return res.status(500).json({errors: [{detail: "Check server logs."}], meta: {}});
    }

    private setNoCacheHeaders(req, res) {
      res.set('Cache-control', 'no-cache, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', 0);
    }
  }
}
