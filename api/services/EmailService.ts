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
import 'rxjs/add/operator/toPromise';
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
            'sendMessage',
            'buildFromTemplate',
        ];

      /**
        * Simple API service to POST a message queue to Redbox.
        *
        * Base email sending method.
        * Return: code, msg
        */
        public sendMessage(msgTo: string, msgBody: string, 
            msgSubject: string = sails.config.emailnotification.defaults.subject, 
            msgFrom: string = sails.config.emailnotification.defaults.from, 
            msgFormat: string = sails.config.emailnotification.defaults.format): Observable<any> {
            if (!sails.config.emailnotification.settings.enabled) {
                sails.log.verbose("Received email notification request, but is disabled. Ignoring.");
                return {'code': '200', 'msg': 'Email services disabled.'};
            }
            sails.log.verbose('Received email notification request. Processing.');

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
            
            return response.map(result => {
                if (result['code'] != '200') {
                    sails.log.error(`Unable to post message to message queue: ${result}`);
                    result['msg'] = 'Email unable to be submitted';
                } else {
                    sails.log.verbose('Message submitted to message queue successfully');
                    result['msg'] = 'Email sent!';
                }
                return result;
            });
        }

        /**
       * Build Email Body from Template
       * 
       * Templates are defined in sails config
       * 
       * Return: status, body, exc
       */

      public buildFromTemplate(template: string, data: any = {}): Observable<any> {

        let readFileAsObservable = Observable.bindNodeCallback((
            path: string,
            encoding: string,
            callback: (error: Error, buffer: Buffer) => void
        ) => fs.readFile(path, encoding, callback));
        
        let res = {};
        let readTemplate = readFileAsObservable(sails.config.emailnotification.settings.templateDir + template + '.ejs', 'utf8');

        return readTemplate.map(
        buffer => {
            try {
                var renderedTemplate = ejs.render((buffer || "").toString(), data, {cache: true, filename: template});
            } catch (e) {
                sails.log.error(`Unable to render template ${template} with data: ${data}`);
                res['status'] = 500;
                res['body'] = 'Templating error.';
                res['ex'] = e;
                return res;
                //throw e;
            }

            res['status'] = 200;
            res['body'] = renderedTemplate;
            return res;
        },
        error => {
            sails.log.error(`Unable to read template file for ${template}`);
            res['status'] = 500;
            res['body'] = 'Template read error.';
            res['ex'] = error;
            return res;
            //throw error;
        }
        );
      }
    }

}
  
module.exports = new Services.Email().exports();