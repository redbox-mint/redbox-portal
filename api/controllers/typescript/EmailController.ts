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
import { Observable } from 'rxjs/Rx';
import controller = require('../../../typescript/controllers/CoreController.js');

export module Controllers {
  /**
   *  Redbox email message queue stuff
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
       * USAGE (ng2):
            var data = {};
            data['data'] = 'test';
            this.emailService.sendNotification('user@example.com', 'template', data, subject?, from?)
            .then(function (res) {console.log(`Email result: ${JSON.stringify(res)}`)});
       * 
       * TODO 
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
            var template = req.body.template;
            
            // use subject if provided, else use template default
            var subject;
            if (req.body.subject) { subject = req.body.subject; }
            else { subject = sails.config.emailnotification.templates[template].subject; }

            var data = {};
            if (req.body.data) { data = req.body.data; }

            var buildResponse = EmailService.buildFromTemplate(template, data);

            buildResponse.subscribe(buildResult => {
                if (buildResult['status'] != 200) {
                    this.ajaxFail(req, res, buildResult['msg']);
                }
                else {
                    var sendResponse = EmailService.sendMessage(to, buildResult['body'], subject);

                    sendResponse.subscribe(sendResult => {
                        if (sendResult['code'] != 200) {
                            this.ajaxFail(req, res, sendResult['msg']);
                        }
                        else {
                            this.ajaxOk(req, res, sendResult['msg']);
                        }
                    });
                }
            });

       }

       /**
       **************************************************************************************************
       **************************************** Override magic methods **********************************
       **************************************************************************************************
       */
  }
}

module.exports = new Controllers.Email().exports();