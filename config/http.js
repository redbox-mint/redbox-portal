/**
 * HTTP Server Settings
 * (sails.config.http)
 *
 * Configuration for the underlying HTTP server in Sails.
 * Only applies to HTTP requests (not WebSockets)
 *
 * For more information on configuration, check out:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.http.html
 */

module.exports.http = {

  /****************************************************************************
   *                                                                           *
   * Express middleware to use for every Sails request. To add custom          *
   * middleware to the mix, add a function to the middleware config object and *
   * add its key to the "order" array. The $custom key is reserved for         *
   * backwards-compatibility with Sails v0.9.x apps that use the               *
   * `customMiddleware` config option.                                         *
   *                                                                           *
   ****************************************************************************/

  middleware: {

    /***************************************************************************
     *                                                                    y      *
     * The order in which middleware should be run for HTTP request. (the Sails *
     * router is invoked by the "router" middleware below.)                     *
     *                                                                          *
     ***************************************************************************/
    passportInit: require('passport').initialize(),
    passportSession: require('passport').session(),
    brandingAndPortalAwareStaticRouter: function(req, res, next) {
      // Checks the branding and portal parameters if the resource isn't overidden for the required portal and branding,
      // it routes the request to the default location
      var url = req.url;
      var splitUrl = url.split('/');

      if (splitUrl.length > 3) {
        var branding = splitUrl[1];
        var portal = splitUrl[2];
        if (req.options.locals == null) {
          req.options.locals = {};
        }
        if (branding != null && req.options.locals.branding == null) {
          req.options.locals.branding = branding;
        }
        if (portal != null && req.options.locals.portal == null) {
          req.options.locals.portal = portal;
        }

        var resourceLocation = splitUrl.slice(3, splitUrl.length).join("/");
        if(resourceLocation.lastIndexOf('?') != -1) {
          resourceLocation = resourceLocation.substring(0, resourceLocation.lastIndexOf('?'));
        }
        var pathExists = require("path-exists");
        var resolvedPath = null;
        var locationToTest = sails.config.appPath + "/.tmp/public/" + branding + "/" + portal + "/" + resourceLocation;
        if (pathExists.sync(locationToTest)) {
          resolvedPath = "/" + branding + "/" + portal + "/" + resourceLocation;
        }

        if (resolvedPath == null) {
          locationToTest = sails.config.appPath + "/.tmp/public/default/" + portal + "/" + resourceLocation;
          if (pathExists.sync(locationToTest)) {
            resolvedPath = "/default/" + portal + "/" + resourceLocation;
          }
        }
        if (resolvedPath == null) {
          locationToTest = sails.config.appPath + "/.tmp/public/default/default/" + resourceLocation;
          if (pathExists.sync(locationToTest)) {
            resolvedPath = "/default/default/" + resourceLocation;
          }
        }

        //We found the resource in a location so let's set the url on the request to it so that the static server can serve it
        if (resolvedPath != null) {
          req.url = resolvedPath;
        }
      }
      next();
    },
    translate: function(req, res, next){
      next();
    },

    order: [
      'startRequestTimer',
      'cookieParser',
      'session',
      'passportInit',
      'passportSession',
      'myBodyParser',
      'handleBodyParserError',
      'compress',
      'methodOverride',
      'poweredBy',
      'router',
      'translate',
      'brandingAndPortalAwareStaticRouter',
      'www',
      'favicon',
      '404',
      '500'
    ],
    // order: [
    //   'startRequestTimer',
    //   'cookieParser',
    //   'session',
    //   'myRequestLogger',
    //   'bodyParser',
    //   'handleBodyParserError',
    //   'compress',
    //   'methodOverride',
    //   'poweredBy',
    //   '$custom',
    //   'router',
    //   'www',
    //   'favicon',
    //   '404',
    //   '500'
    // ],

    /****************************************************************************
     *                                                                           *
     * Example custom middleware; logs each request to the console.              *
     *                                                                           *
     ****************************************************************************/

    // myRequestLogger: function (req, res, next) {
    //     console.log("Requested :: ", req.method, req.url);
    //     return next();
    // }


    /***************************************************************************
     *                                                                          *
     * The body parser that will handle incoming multipart HTTP requests. By    *
     * default as of v0.10, Sails uses                                          *
     * [skipper](http://github.com/balderdashy/skipper). See                    *
     * http://www.senchalabs.org/connect/multipart.html for other options.      *
     *                                                                          *
     * Note that Sails uses an internal instance of Skipper by default; to      *
     * override it and specify more options, make sure to "npm install skipper" *
     * in your project first.  You can also specify a different body parser or  *
     * a custom function with req, res and next parameters (just like any other *
     * middleware function).                                                    *
     *                                                                          *
     ***************************************************************************/

    myBodyParser: function(req, res, next) {
      // ignore if there is '/attach/' on the url
      if (req.url.toLowerCase().includes('/attach')) {
        return next();
      }
      var skipper = require('skipper')({
        // strict: true,
        // ... more Skipper options here ...
      });
      return skipper(req, res, next);
    }

  },

  /***************************************************************************
   *                                                                          *
   * The number of seconds to cache flat files on disk being served by        *
   * Express static middleware (by default, these files are in `.tmp/public`) *
   *                                                                          *
   * The HTTP static cache is only active in a 'production' environment,      *
   * since that's the only time Express will cache flat-files.                *
   *                                                                          *
   ***************************************************************************/

   // cache: 31557600000
};
