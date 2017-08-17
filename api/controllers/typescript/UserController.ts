// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
declare var BrandingService;
import controller = require('../../../typescript/controllers/CoreController.js');

export module Controllers {
  /**
   *  User-related features...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   */
  export class User extends controller.Controllers.Core.Controller {

      /**
       * Exported methods, accessible from internet.
       */
      protected _exportedMethods: any = [
          'login',
          'logout',
          'info',
          'aafLogin',
          'localLogin',
          'redirLogin',
          'redirPostLogin',
          'getPostLoginUrl',
          'respond'
      ];

      /**
       **************************************************************************************************
       **************************************** Override default methods ********************************
       **************************************************************************************************
       */


      /**
       **************************************************************************************************
       **************************************** Add custom methods **************************************
       **************************************************************************************************
       */

      /**
       * Login Handler
       *
       * @param req
       * @param res
       */
      public login(req, res) {
        this.sendView(req,res, sails.config.auth.loginPath);
      }

      public redirLogin(req, res) {
        if (req.path.indexOf(sails.config.auth.loginPath) == -1) {
          req.session.redirUrl = req.path;
        }
        return res.redirect(`${BrandingService.getBrandAndPortalPath(req)}/${sails.config.auth.loginPath}`);
      }

      public redirPostLogin(req, res) {
        res.redirect(this.getPostLoginUrl(req, res));
      }

      protected getPostLoginUrl(req, res) {
        if (req.session.redirUrl) {
          return req.session.redirUrl;
        } else {
          return `${BrandingService.getBrandAndPortalPath(req)}/${sails.config.auth[req.session.branding].local.postLoginRedir}`;
        }
      }

      public logout(req, res) {
        req.logout();
        req.session.destroy(err => {
          res.redirect(sails.config.auth.postLogoutRedir);
        });
      }

      public info(req, res) {
        return res.json ({ user:req.user });
      }

      public localLogin(req, res) {
        sails.config.passport.authenticate('local', function(err, user, info) {
          if ((err) || (!user)) {
              return res.send({
                  message: info.message,
                  user: user
              });
          }
          req.logIn(user, function(err) {
              if (err) res.send(err);
              // login success
              // redir if api header call is not found
              return sails.controllers['typescript/user'].respond(req, res, (req, res) => {
                return res.json ({ user:user, message: 'Login OK', url: sails.controllers['typescript/user'].getPostLoginUrl(req, res)});
              }, (req, res) => {
                return sails.controllers['typescript/user'].redirPostLogin(req, res);
              });
          });
        })(req, res);
      }

      public aafLogin(req, res) {
        sails.config.passport.authenticate('aaf-jwt', function(err, user, info) {
          sails.log.verbose("At AAF Controller, verify...");
          sails.log.verbose("Error:");
          sails.log.verbose(err);
          sails.log.verbose("Info:");
          sails.log.verbose(info);
          sails.log.verbose("User:");
          sails.log.verbose(user);
          if ((err) || (!user)) {
              return res.send({
                  message: info.message,
                  user: user
              });
          }
          req.logIn(user, function(err) {
            if (err) res.send(err);
            sails.log.debug("AAF Login OK, redirecting...");
            return sails.controllers['typescript/user'].redirPostLogin(req, res);
          });
        })(req, res);
      }
      /**
       **************************************************************************************************
       **************************************** Override magic methods **********************************
       **************************************************************************************************
       */
  }
}

module.exports = new Controllers.User().exports();
