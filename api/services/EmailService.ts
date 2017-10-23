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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import { Sails, Model } from "sails";
import * as request from "request-promise";
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';

declare var sails: Sails;

export module Services {
    /**
     * Use services...
     *
     *
     * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
     *
     */
    export class Email extends services.Services.Core.Service {
  
        protected _exportedMethods: any = [
            'sendNotification',
            'buildTemplate',
        ];

      /**
        * Simple API service to POST a message queue to Redbox.
        *
        **/
        public sendNotification(msgTo: string, msgBody: string, 
            msgSubject: string = sails.config.emailnotification.defaults.subject, 
            msgFrom: string = sails.config.emailnotification.defaults.from, 
            msgFormat: string = sails.config.emailnotification.defaults.format) {
            if (!sails.config.emailnotification.settings.enabled) {
                sails.log.verbose("Received email notification request, but is disabled. Ignoring.");
                return;
            }
            sails.log.verbose("Received email notification request. Processing.");

            var url = `${sails.config.emailnotification.api.send.url}`;
            var body = {
                "to": [msgTo],
                "subject": msgSubject,
                "body": msgBody,
                "from": msgFrom,
                "format": msgFormat
            };
            var options = { url: url, json: true, body: body, headers: { 'Authorization': `Bearer ${sails.config.redbox.apiKey}`, 'Content-Type': 'application/json; charset=utf-8' } };
            
            var response = Observable.fromPromise(request[sails.config.emailnotification.api.send.method](options)).catch(error => Observable.of(`Error: ${error}`));
    
            response.subscribe(result => {
                if (result["response"] != null) {
                    sails.log.verbose(result);
                } else {
                    sails.log.error(result);
                }
            });
        }

        /**
       * Build Email From Template
       *
       * @param template
       * @param data
       * 
       * TODO
       *    • better exception handling
       */

      public buildTemplate(template: string, data: any = {}) {
        fs.readFile(sails.config.emailnotification.settings.templateDir + template + '.ejs', 'utf8', (err, source) => {
            if (err) throw err;
      
            try {
              var renderedTemplate = ejs.render((source || "").toString(), data, {cache: true, filename: template});
              return renderedTemplate;
    
            } catch (e) {
              throw e;
            }
          });
        }
    }

}
  
module.exports = new Services.Email().exports();