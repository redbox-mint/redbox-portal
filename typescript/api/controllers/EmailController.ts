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
declare var _;
import { Observable } from 'rxjs/Rx';
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';

export module Controllers {
  /**
   *  Redbox email message queue stuff
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   */
  export class Email extends controllers.Core.Controller {

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
            let cc = _.get(sails.config.emailnotification.defaults, 'cc', '')
            if(!_.isEmpty(req.body.cc)) {
                cc = req.body.cc;
            }
            let from = sails.config.emailnotification.defaults.from;
            if(!_.isEmpty(req.body.from)) {
                from = req.body.from    ;
            }

            let format = sails.config.emailnotification.defaults.format;
            if(!_.isEmpty(req.body.format)) {
                format = req.body.format    ;
            }

            let bcc = null
            if(!_.isEmpty(req.body.bcc)) {
                bcc = req.body.bcc;
            }
            var template = req.body.template;

            // use subject if provided, else use template default
            var subject;
            if (req.body.subject) { subject = req.body.subject; }
            else { subject = sails.config.emailnotification.templates[template].subject; }

            var data = {};
            if (req.body.data) { data = req.body.data; }
            data['sailsConfig'] = sails.config;

            var buildResponse = EmailService.buildFromTemplate(template, data);

            return buildResponse.subscribe(buildResult => {
                if (buildResult['status'] != 200) {
                    return this.apiFail(req, res, 500);
                }
                else {
                    var sendResponse = EmailService.sendMessage(to, buildResult['body'], subject,from, format, cc, bcc);

                    sendResponse.subscribe(sendResult => {
                        if (!sendResult['success']) {
                            return this.apiFail(req, res, 500);
                        }
                        else {
                            return this.apiRespond(req, res, {message: sendResult['msg']}, 200);
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
