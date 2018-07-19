declare var _;
declare var sails;

import pathExists = require('path-exists');
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
            console.error('The method "' + methods[i] + '" is not public and cannot be exported. ' + this);
          }
        } else {
          console.error('The method "' + methods[i] + '" does not exist on the controller ' + this);
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
      if (pathExists.sync(viewToTest)) {
        resolvedView = branding + "/" + portal + "/" + view;
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedView == null) {
        viewToTest = sails.config.appPath + "/views/default/" + portal + "/" + view + ".ejs";
        if (pathExists.sync(viewToTest)) {
          resolvedView = "default/" + portal + "/" + view;
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedView == null) {
        viewToTest = sails.config.appPath + "/views/default/default/" + view + ".ejs";
        if (pathExists.sync(viewToTest)) {
          resolvedView = "default/default/" + view;
        }
      }

      return resolvedView;
    }

    public _getResolvedLayout(branding: string, portal: string): string {
      var resolvedLayout: string = null;

      //Check if view exists for branding and portal
      var layoutToTest: string = sails.config.appPath + "/views/" + branding + "/" + portal + "/layout/layout.ejs";
      if (pathExists.sync(layoutToTest)) {
        resolvedLayout = branding + "/" + portal + "/layout";
      }
      // If view doesn't exist, next try for portal with default branding
      if (resolvedLayout == null) {
        layoutToTest = sails.config.appPath + "/views/default/" + portal + "/layout.ejs";
        if (pathExists.sync(layoutToTest)) {
          resolvedLayout = "/default/" + portal + "/layout";
        }
      }

      // If view still doesn't exist, next try for default portal with default branding
      if (resolvedLayout == null) {
        layoutToTest = sails.config.appPath + "/views/default/default/" + "layout.ejs";
        if (pathExists.sync(layoutToTest)) {
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
      sails.log.debug("resolvedView");
      sails.log.debug(resolvedView);
      sails.log.debug("mergedLocal");
      sails.log.debug(mergedLocal);
      res.view(resolvedView, mergedLocal);
    }

    public respond(req, res, ajaxCb, normalCb, forceAjax) {
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

    protected ajaxRespond(req, res, jsonObj=null, forceAjax) {
      var notAjaxMsg = "Got non-ajax request, don't know what do...";
      this.respond(req, res, (req, res) => {
        return res.json(jsonObj);
      }, (req, res)=> {
        sails.log.verbose(notAjaxMsg);
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

  }
}
