import { existsSync } from 'fs';
import type { Response } from 'express';
import * as _ from 'lodash';
import { ILogger } from './Logger';
import {
  BuildResponseType,
  APIErrorResponse,
  ApiVersion,
  ApiVersionStrings,
  RBValidationError,
  ErrorResponseItemV2,
} from "./model";
import {RequestChronicleHelper} from "./utilities/RequestChronicle";





export namespace Controllers.Core {

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
    protected _config: Record<string, unknown> = {};

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
    private _logger: ILogger | null = null;

    private getFallbackLogger(): ILogger {
      const log = (...args: unknown[]): void => console.log(...args);
      const noop = (): void => undefined;
      return {
        silly: log,
        verbose: log,
        trace: (...args: unknown[]): void => console.trace(...args),
        debug: (...args: unknown[]): void => console.debug(...args),
        log: (...args: unknown[]): void => console.log(...args),
        info: (...args: unknown[]): void => console.info(...args),
        warn: (...args: unknown[]): void => console.warn(...args),
        error: (...args: unknown[]): void => console.error(...args),
        crit: (...args: unknown[]): void => console.error(...args),
        fatal: (...args: unknown[]): void => console.error(...args),
        silent: noop,
        blank: (): void => console.log(''),
      };
    }

    /**
     * Get a namespaced logger for this controller class.
     * Uses the class constructor name as the namespace.
     * Falls back to sails.log if pino namespaced logging is not available.
     */
    protected get logger(): ILogger {
      if (typeof sails === 'undefined') {
        return this.getFallbackLogger();
      }
      if (this._logger === null && sails?.config?.log?.createNamespaceLogger && sails?.config?.log?.customLogger) {
        const controllerName = this.constructor.name + 'Controller';
        this._logger = sails.config.log.createNamespaceLogger(controllerName, sails.config.log.customLogger);
      }
      if (this._logger !== null) {
        return this._logger;
      }
      const sailsLogger = sails?.log as Partial<ILogger> | undefined;
      if (sailsLogger && typeof sailsLogger.verbose === 'function') {
        return sailsLogger as ILogger;
      }
      // Prefer _logger, then sails.log; cast sails.log to ILogger since it implements all required methods
      return this.getFallbackLogger();
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
    public exports(): Record<string, unknown> {
      // Merge default array and custom array from child.
      const methods = this._defaultExportedMethods.concat(this._exportedMethods);
      const exportedMethods: Record<string, unknown> = {};
      const controller = this as Record<string, unknown>;

      for (let i = 0; i < methods.length; i++) {
        const methodName = methods[i];
        const member = controller[methodName];
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
            this.logger.error(`The controller method "${methodName}" is not public and cannot be exported from ${this.constructor?.name}`);
          }
        } else {
          this.logger.error(`The controller method "${methodName}" does not exist on ${this.constructor?.name}`);
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
    protected _handleRequest(req: Sails.Req, res: Sails.Res, callback: (req: Sails.Req, res: Sails.Res, options: Record<string, unknown>) => void, options: Record<string, unknown> = {}): void {
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
    public index(req: Sails.Req, res: Sails.Res, callback: unknown, _options: Record<string, unknown> = {}): void {
      res.notFound();
    }


    public _getResolvedView(branding: string, portal: string, view: string): string | null {
      let resolvedView: string | null = null;

      //Check if view exists for branding and portal
      const viewToTest: string = sails.config.appPath + "/views/" + branding + "/" + portal + "/" + view + ".ejs";
      if (existsSync(viewToTest)) {
        resolvedView = branding + "/" + portal + "/" + view;
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedView === null) {
        const viewToTest2 = sails.config.appPath + "/views/default/" + portal + "/" + view + ".ejs";
        if (existsSync(viewToTest2)) {
          resolvedView = "default/" + portal + "/" + view;
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedView === null) {
        const viewToTest3 = sails.config.appPath + "/views/default/default/" + view + ".ejs";
        if (existsSync(viewToTest3)) {
          resolvedView = "default/default/" + view;
        }
      }

      return resolvedView;
    }

    public _getResolvedLayout(branding: string, portal: string): string | null {
      let resolvedLayout: string | null = null;

      //Check if view exists for branding and portal
      let layoutToTest: string = sails.config.appPath + "/views/" + branding + "/" + portal + "/layout/layout.ejs";
      if (existsSync(layoutToTest)) {
        resolvedLayout = branding + "/" + portal + "/layout";
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedLayout === null) {
        layoutToTest = sails.config.appPath + "/views/default/" + portal + "/layout.ejs";
        if (existsSync(layoutToTest)) {
          resolvedLayout = "/default/" + portal + "/layout";
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedLayout === null) {
        layoutToTest = sails.config.appPath + "/views/default/default/" + "layout.ejs";
        if (existsSync(layoutToTest)) {
          resolvedLayout = "default/default/layout";
        }
      }

      return resolvedLayout;
    }

    public sendView(req: Sails.Req, res: Sails.Res, view: string, locals: Record<string, unknown> = {}): void {

      if (!req.options) {
        req.options = {};
      }
      if (req.options.locals == null) {
        req.options.locals = {};
      }
      const mergedLocal: Record<string, unknown> = Object.assign({}, req.options.locals as Record<string, unknown>, locals);

      const branding = mergedLocal['branding'] as string;
      const portal = mergedLocal['portal'] as string;

      const resolvedView: string | null = this._getResolvedView(branding, portal, view);
      const resolvedLayout: string | null = this._getResolvedLayout(branding, portal);

      // If we can resolve a layout set it.
      if (resolvedLayout !== null && mergedLocal["layout"] !== false) {
        res.locals.layout = resolvedLayout;
      }

      // View still doesn't exist so return a 404
      if (resolvedView === null) {
        res.notFound(mergedLocal, "404");
        return;
      }

      // Add some properties blueprints usually adds
      // TODO: Doesn't seem to be binding properly. Investigate
      mergedLocal.view = {};
      (mergedLocal.view as Record<string, string>).pathFromApp = resolvedView;
      (mergedLocal.view as Record<string, string>).ext = 'ejs';
      // merge with ng2 app...
      _.merge(mergedLocal, this.getNg2Apps(view));
      const fullViewPath = sails.config.appPath + "/views/" + resolvedView;
      mergedLocal['templateDirectoryLocation'] = fullViewPath.substring(0, fullViewPath.lastIndexOf('/') + 1);

      this.updateChronicle(req, {viewResolvedDetail: resolvedView, viewMergedLocalDetail: mergedLocal});

      res.view(resolvedView, mergedLocal);
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    public respond(req: Sails.Req, res: Sails.Res, ajaxCb: (req: Sails.Req, res: Sails.Res) => unknown, normalCb: (req: Sails.Req, res: Sails.Res) => unknown, _forceAjax = false): unknown {
      if (this.isAjax(req) || _forceAjax === true) {
        return ajaxCb(req, res);
      } else {
        return normalCb(req, res);
      }
    }

    protected isAjax(req: Sails.Req): boolean {
      return req.headers['x-source'] === 'jsclient';
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected ajaxOk(req: Sails.Req, res: Sails.Res, msg = '', data: unknown = null, _forceAjax = false): Response {
      const payload = data ?? { status: true, message: msg };
      return this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected ajaxFail(req: Sails.Req, res: Sails.Res, msg = '', data: unknown = null, _forceAjax = false): Response {
      const payload = data ?? { status: false, message: msg };
      return this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected apiFail(req: Sails.Req, res: Sails.Res, statusCode = 500, errorResponse?: APIErrorResponse): Response {
      const displayErrors = [{
        title: errorResponse?.message ?? 'An error has occurred',
        detail: errorResponse?.details
      }];
      return this.sendResp(req, res, { status: statusCode, displayErrors, headers: this.getNoCacheHeaders() });
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected apiSuccess(req: Sails.Req, res: Sails.Res, jsonObj: unknown = null, statusCode = 200): Response {
      return this.sendResp(req, res, { data: jsonObj, status: statusCode, headers: this.getNoCacheHeaders() });
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected apiRespond(req: Sails.Req, res: Sails.Res, jsonObj: unknown = null, statusCode = 200): Response {
      return this.sendResp(req, res, { data: jsonObj, status: statusCode, headers: this.getNoCacheHeaders() });
    }

    /**
     * @deprecated Use `sendResp` instead.
     */
    protected ajaxRespond(req: Sails.Req, res: Sails.Res, jsonObj: unknown = null, _forceAjax?: boolean): Response {
      return this.sendResp(req, res, { data: jsonObj, headers: this.getNoCacheHeaders() });
    }

    protected getNg2Apps(viewPath: string): { ng2_apps: unknown[] } {
      if (sails.config.ng2.use_bundled && sails.config.ng2.apps[viewPath]) {
        const ng2Apps = sails.config.ng2.apps[viewPath];
        return { ng2_apps: Array.isArray(ng2Apps) ? ng2Apps : [] };
      } else {
        return { ng2_apps: [] };
      }
    }

    /**
     * Get the API version from the request.
     * Defaults to v1.
     * @param req The sails request.
     * @return The API version string.
     * @private
     */
    private getApiVersion(req: Sails.Req): ApiVersionStrings {
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

      const available: string[] = Object.values(ApiVersion);
      if (!available.includes(version)) {
        sails.log.error(`The provided API version (${version}) must be one of the known API versions: ${available.join(', ')}. ` +
          `Using default API version (${defaultVersion}).`);
        return defaultVersion;
      }

      sails.log.verbose(`Using API version '${version}' for url '${req.url}'.`);
      return version as ApiVersionStrings;
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
    protected sendResp(req: Sails.Req, res: Sails.Res, buildResponse?: BuildResponseType): Response {
      const apiVersion = this.getApiVersion(req);
      // Destructure build response properties and set defaults.
      const {
        format = "json",
        data = {},
        headers = {},
        errors = [],
        displayErrors = [],
        meta = {},
        v1 = null,
        chronicle = {},
      } = buildResponse ?? {};
      // Response status defaults to 200.
      let { status = 200 } = buildResponse ?? {};

      // Collect and process the errors recursively
      const { collectedErrors, collectedDisplayErrors } = this.collectAndLogErrors(errors, displayErrors);
      status = this.resolveResponseStatus(status, collectedDisplayErrors);

      this.applyResponseHeaders(res, headers);
      this.applyResponseStatus(res, status);

      this.updateChronicle(req, chronicle, collectedErrors);

      // Delegate full version-specific responses (success + errors) to wrapper handlers.
      if (apiVersion === ApiVersion.VERSION_1_0) {
        return this.handleV1Response(res, format, status, collectedErrors, collectedDisplayErrors, v1, data, meta);
      }

      if (apiVersion === ApiVersion.VERSION_2_0) {
        return this.handleV2Response(res, format, status, collectedErrors, collectedDisplayErrors, data, meta);
      }

      const unknownSituation = {
        apiVersion,
        request: {
          method: req?.method,
          path: req?.path ?? req?.originalUrl,
        },
        response: {
          format,
          status,
          headers,
          meta,
          v1,
        },
        errors: {
          collectedErrors,
          collectedDisplayErrors,
        },
      };
      sails.log.error("Unknown API version in sendResp", unknownSituation);
      return res.status(500).json({ errors: [{ detail: "Check server logs." }], meta: {} });
    }

    protected updateChronicle(req: Sails.Req, info?: Record<string, unknown>, errors?: (Error | unknown)[]): void {
      const rc = RequestChronicleHelper.fromReq(req);
      rc?.addInfo(info ?? {});
      (errors ?? []).forEach(error => rc?.addError(error));
    }

    private collectAndLogErrors(errors: (Error | unknown)[], displayErrors: ErrorResponseItemV2[]) {
      const {
        errors: collectedErrors,
        displayErrors: collectedDisplayErrors
      } = RBValidationError.collectErrors(errors, displayErrors);

      for (const error of collectedErrors) {
        sails.log.error(`Collected error in sendResp:`, error);
      }

      const errorsMsg = `${collectedErrors.length} ${collectedErrors.length === 1 ? 'error' : 'errors'}`;
      const displayErrorsMsg = `display ${collectedDisplayErrors.length} ${collectedDisplayErrors.length === 1 ? 'error' : 'errors'}`;
      sails.log.verbose(`Collected ${errorsMsg} and ${displayErrorsMsg} in sendResp.`);
      return { collectedErrors, collectedDisplayErrors };
    }

    private ensureDisplayErrors(collectedErrors: Error[], collectedDisplayErrors: ErrorResponseItemV2[]) {
      if (collectedErrors.length > 0 && collectedDisplayErrors.length === 0) {
        // If there are any errors, there must be at least one display error to show the user.
        collectedDisplayErrors.push({ code: 'server-error', status: "500" });
      }

      const errorsMsg = `${collectedErrors.length} ${collectedErrors.length === 1 ? 'error' : 'errors'}`;
      const displayErrorsMsg = `display ${collectedDisplayErrors.length} ${collectedDisplayErrors.length === 1 ? 'error' : 'errors'}`;
      sails.log.verbose(`Collected ${errorsMsg} and ${displayErrorsMsg} in sendResp.`);
    }

    private resolveResponseStatus(status: number, collectedDisplayErrors: ErrorResponseItemV2[]): number {
      let resolvedStatus: number | null = status;
      if (collectedDisplayErrors.length > 0) {
        try {
          const statuses: number[] = [];
          if (status !== undefined && status !== null) {
            statuses.push(status)
          }
          statuses.push(...collectedDisplayErrors
            .map(i => i?.status ? parseInt(i?.status?.toString()) : 0)
            .filter(i => Number.isFinite(i))
          )
          if (statuses.length > 0) {
            // Note that Math.max has a maximum number of parameters, which a very long array (10,000+) could exceed.
            // We don't expect that many statuses. If this becomes an issue, use Array.reduce instead.
            resolvedStatus = Math.max(...statuses);
            if (!Number.isFinite(resolvedStatus)) {
              resolvedStatus = null;
            }
          }
        } catch (error) {
          sails.log.error(`Error in sendResp resolving status ${resolvedStatus}:`, error);
          resolvedStatus = 500;
        }

        // If there are any errors, the status code must be 4xx or 5xx.
        if (resolvedStatus === null || resolvedStatus === undefined || resolvedStatus < 400) {
          resolvedStatus = 500;
        }
      }
      sails.log.verbose(`sendResp status ${resolvedStatus}`);
      return resolvedStatus;
    }

    private applyResponseHeaders(res: Response, headers: Record<string, string>) {
      if (headers) {
        res.set(headers);
      }
    }

    private applyResponseStatus(res: Response, status: number) {
      if (status !== null && status !== undefined && !isNaN(status)) {
        res.status(status);
      } else {
        res.status(500);
      }
    }

    private shouldSendSuccessJson(
      format: string,
      collectedErrors: Error[],
      collectedDisplayErrors: ErrorResponseItemV2[],
      status: number,
      data: unknown,
      v1: unknown,
      apiVersion: ApiVersionStrings
    ): boolean {
      if (format !== 'json') {
        return false;
      }
      if (collectedErrors.length > 0 || collectedDisplayErrors.length > 0) {
        return false;
      }
      if (status?.toString().startsWith('5') || status?.toString().startsWith('4')) {
        return false;
      }

      return (
        (data !== null && data !== undefined) ||
        (
          ((v1 !== null && v1 !== undefined) || (data !== null && data !== undefined)) &&
          apiVersion === ApiVersion.VERSION_1_0
        )
      );
    }

    private sendSuccessJson(
      res: Response,
      apiVersion: ApiVersionStrings,
      status: number,
      data: unknown,
      meta: Record<string, unknown>,
      v1: unknown
    ) {
      switch (apiVersion) {
        case ApiVersion.VERSION_2_0:
          sails.log.verbose(`Send response status ${status} api version 2 format json.`);
          return res.json({ data: data, meta: meta });

        case ApiVersion.VERSION_1_0:
        default:
          sails.log.verbose(`Send response status ${status} api version 1 format json.`);
          return res.json(v1 ?? data);
      }
    }

    private buildV1ErrorResponse(collectedDisplayErrors: ErrorResponseItemV2[]): APIErrorResponse {
      const errorResponse = new APIErrorResponse();
      if (collectedDisplayErrors.length === 1) {
        const displayError = collectedDisplayErrors[0] ?? {};
        const title = displayError.title?.toString()?.trim() || displayError.code?.toString()?.trim() || "";
        const detail = displayError.detail?.toString()?.trim() || "";
        if (title || detail) {
          errorResponse.message = title || detail || "An error occurred";
          if (title && detail) {
            errorResponse.details = detail;
          }
        } else {
          errorResponse.message = RBValidationError.displayMessage({
            t: TranslationService,
            displayErrors: collectedDisplayErrors
          });
        }
      } else {
        errorResponse.message = RBValidationError.displayMessage({
          t: TranslationService,
          displayErrors: collectedDisplayErrors
        });
      }
      return errorResponse;
    }

    private formatV2DisplayErrors(collectedDisplayErrors: ErrorResponseItemV2[]): ErrorResponseItemV2[] {
      const t = TranslationService.t;
      return collectedDisplayErrors.map(displayError => {
        const code = displayError.code?.toString()?.trim() || "";
        let title = displayError.title?.toString()?.trim() || "";
        const detail = displayError.detail?.toString()?.trim() || "";

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
    }

    private handleV1Response(
      res: Response,
      format: string,
      status: number,
      collectedErrors: Error[],
      collectedDisplayErrors: ErrorResponseItemV2[],
      v1: unknown,
      data: unknown,
      meta: Record<string, unknown>
    ) {
      // Success path for v1
      if (this.shouldSendSuccessJson(format, collectedErrors, collectedDisplayErrors, status, data, v1, ApiVersion.VERSION_1_0)) {
        return this.sendSuccessJson(res, ApiVersion.VERSION_1_0, status, data, meta, v1);
      }

      // Error path for v1
      if (collectedDisplayErrors.length > 0) {
        const errorResponse = this.buildV1ErrorResponse(collectedDisplayErrors);
        sails.log.verbose(`Send response status ${status} api version 1 errors in format json.`);
        return res.json(errorResponse);
      }

      // If v1 body is provided, return it
      if (v1 !== null && v1 !== undefined) {
        sails.log.verbose(`Send response status ${status} api version 1 format json.`);
        return res.json(v1);
      }

      const unknownSituation = {
        response: {
          format,
          status,
          data,
          meta,
          v1,
        },
        errors: {
          collectedErrors,
          collectedDisplayErrors,
        },
      };
      sails.log.error("Unknown v1 situation in sendResp", unknownSituation);
      return res.status(500).json({ errors: [{ detail: "Check server logs." }], meta: meta || {} });
    }

    private handleV2Response(
      res: Response,
      format: string,
      status: number,
      collectedErrors: Error[],
      collectedDisplayErrors: ErrorResponseItemV2[],
      data: unknown,
      meta: Record<string, unknown>
    ) {
      // Success path for v2
      if (this.shouldSendSuccessJson(format, collectedErrors, collectedDisplayErrors, status, data, null, ApiVersion.VERSION_2_0)) {
        return this.sendSuccessJson(res, ApiVersion.VERSION_2_0, status, data, meta, null);
      }

      // Error path for v2
      if (collectedDisplayErrors.length > 0) {
        sails.log.verbose(`Send response status ${status} api version 2 format json.`);
        const formattedErrors = this.formatV2DisplayErrors(collectedDisplayErrors);
        sails.log.verbose(`Send response status ${status} api version 2 errors in format json.`);
        return res.json({ errors: formattedErrors, meta: meta });
      }

      const unknownSituation = {
        response: {
          format,
          status,
          data,
          meta
        },
        errors: {
          collectedErrors,
          collectedDisplayErrors,
        },
      };
      sails.log.error(`Unknown v2 situation in sendResp`, unknownSituation);
      return res.status(500).json({ errors: [{ detail: "Check server logs." }], meta: meta || {} });
    }

    protected getNoCacheHeaders(): Record<string, string> {
      return {
        'Cache-control': 'no-cache, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
    }

    private setNoCacheHeaders(_req: Sails.Req, res: Sails.Res): void {
      res.set(this.getNoCacheHeaders());
    }
  }
}
