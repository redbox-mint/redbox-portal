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
import {Controllers as controllers} from '@researchdatabox/redbox-core-types';

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
                this.apiFail(req, res, 400);
                return;
            }
            if (!req.body.template){
                sails.log.error("No template specified in email notification request!");
                this.apiFail(req, res, 400);
                return;
            }

            const options = {
                format: req.body.format,
                from: req.body.from,
                to: req.body.to,
                cc: req.body.cc,
                bcc: req.body.bcc,
                subject: req.body.subject,
                template: req.body.template,
            };
            const config = {};
            const templateDate = req.body.data;

            const emailProperties = EmailService.evaluateProperties(options, config, templateDate);
            // const format = emailProperties.format;
            const formatRendered = emailProperties.formatRendered;
            // const from = emailProperties.from;
            const fromRendered = emailProperties.fromRendered;
            // const to = emailProperties.to;
            const toRendered = emailProperties.toRendered;
            // const cc = emailProperties.cc;
            const ccRendered = emailProperties.ccRendered;
            // const bcc = emailProperties.bcc;
            const bccRendered = emailProperties.bccRendered;
            // const subject = emailProperties.subject;
            const subjectRendered = emailProperties.subjectRendered;
            // const template = emailProperties.template;
            const templateRendered = emailProperties.templateRendered;

            return templateRendered.subscribe(buildResult => {
                if (buildResult['status'] != 200) {
                    return this.apiFail(req, res, 500);
                } else {
                    const sendResponse = EmailService.sendMessage(
                        toRendered,
                        buildResult['body'],
                        subjectRendered,
                        fromRendered,
                        formatRendered,
                        ccRendered,
                        bccRendered,
                    );

                    sendResponse.subscribe(sendResult => {
                        if (!sendResult['success']) {
                            return this.apiFail(req, res, 500);
                        } else {
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
