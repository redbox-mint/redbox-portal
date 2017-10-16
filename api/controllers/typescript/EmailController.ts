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
declare var EmailService;
import controller = require('../../../typescript/controllers/CoreController.js');

export module Controllers {
  /**
   *  User-related features...
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   */
  export class Email extends controller.Controllers.Core.Controller {

      /**
       * Exported methods, accessible from internet.
       */
      protected _exportedMethods: any = [
          'sendNotification'
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
       * Send Email Notification
       *
       * @param req
       * @param res
       * 
       * TODO 
       *    • proper responses back to ang2
       *    • proper email address validation
       *    • support for multiple email addresses (trivial: make array)
       */

        public sendNotification(req, res) {
            if (!req.body.to){
                sails.log.error("No email recipient in email notification request!");
                return; 
            }
            if (!req.body.template){
                sails.log.error("No template specified in email notification request!");
                return; 
            }
            var to = req.body.to;
            var subject = req.body.subject;
            var template = req.body.template;
            var data = {};
            if (req.body.data) { data = req.body.data; }

            var body = EmailService.buildTemplate(template, data);

            var resp = EmailService.sendNotification(to, body, subject);

        
       }

       /**
       **************************************************************************************************
       **************************************** Override magic methods **********************************
       **************************************************************************************************
       */
  }
}

module.exports = new Controllers.Email().exports();