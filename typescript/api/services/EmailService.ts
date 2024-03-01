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

import {
  Observable
} from 'rxjs/Rx';
import { Services as services } from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import 'rxjs/add/operator/toPromise';
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import * as nodemailer from 'nodemailer';

declare var sails: Sails;
declare var _;

export module Services {
  /**
   *
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   *
   */
  export class Email extends services.Core.Service {

    protected _exportedMethods: any = [
      'sendMessage',
      'buildFromTemplate',
      'sendTemplate',
      'sendRecordNotification'
    ];

    /**
     * Simple API service to POST a message queue to Redbox.
     *
     * Base email sending method.
     * Return: code, msg
     */
    public sendMessage(msgTo, msgBody: string,
      msgSubject: string = sails.config.emailnotification.defaults.subject,
      msgFrom: string = sails.config.emailnotification.defaults.from,
      msgFormat: string = sails.config.emailnotification.defaults.format,
      cc: string = _.get(sails.config.emailnotification.defaults, 'cc', ''),
      bcc: string = ''): Observable<any> {

      return Observable.fromPromise(this.sendMessageAsync(msgTo, msgBody, msgSubject, msgFrom, msgFormat, cc, bcc));

    }


    private async sendMessageAsync(msgTo, msgBody: string, msgSubject: string, msgFrom: string, msgFormat: string, cc: string, bcc: string): Promise<any> {
      if (!sails.config.emailnotification.settings.enabled) {
        sails.log.debug("Received email notification request, but is disabled. Ignoring.");
        return {
          'code': '200',
          'msg': 'Email services disabled.'
        };
      }
      sails.log.info('Received email notification request. Processing.');

      let transport;
      try {
        transport = nodemailer.createTransport(sails.config.emailnotification.settings.serverOptions);
      } catch (err) {
        sails.log.error(err);
        return {
          'code': '500',
          'msg': 'Failed to establish mail transport connection.'
        };
      }

      var message = {
        "to": msgTo,
        "subject": msgSubject,
        "from": msgFrom,
        "cc": cc,
        "bcc": bcc
      };

      message[msgFormat] = msgBody;
      let response = {
        success: false
      };
      sails.log.debug(`Email message to send will be ${JSON.stringify(message)}`)
      try {
        let sendResult = await transport.sendMail(message);
        sails.log.info(`Email sent successfully. Message Id: ${sendResult.messageId}`);
        response['msg'] = `Email sent successfully. Message Id: ${sendResult.messageId}`;
        response.success = true;
      } catch (err) {
        response['msg'] = 'Email unable to be submitted';
        sails.log.error("Email sending failed")
        sails.log.error(err)
      }



      return response;

    }

    /**
     * Build Email Body from Template
     *
     * Templates are defined in sails config
     *
     * Return: status, body, exc
     */

    public async buildFromTemplateAsync(template: string, data: any = {}, res: any = {}) {
      try {
        let readTemplate = fs.readFileSync(sails.config.emailnotification.settings.templateDir + template + '.ejs', 'utf-8')
       
        
        var renderedTemplate = ejs.render((readTemplate || "").toString(), data, {
          cache: true,
          filename: template
        });

        res['status'] = 200;
        res['body'] = renderedTemplate;
        return res;
      } catch (err) {
        sails.log.error(`Unable to render template ${template} with data: ${data}`);
        res['status'] = 500;
        res['body'] = 'Templating error.';
        res['ex'] = err;
        sails.log.error(err)
        return res;
      }
    }

    public buildFromTemplate(template: string, data: any = {}): Observable<any> {
      return Observable.fromPromise(this.buildFromTemplateAsync(template, data));      
    }

    /**
     * Send Email from Template
     *
     * Templates are defined in sails config
     *
     * Return: status, body, exc
     */
    public sendTemplate(to, subject, template, data) {
      sails.log.verbose("Inside Send Template");
      var buildResponse = this.buildFromTemplate(template, data);
      sails.log.verbose("buildResponse");
      buildResponse.subscribe(buildResult => {
        if (buildResult['status'] != 200) {
          return buildResult;
        } else {
          var sendResponse = this.sendMessage(to, buildResult['body'], subject);

          sendResponse.subscribe(sendResult => {
            return sendResult;
          });
        }
      });
    }

    protected runTemplate(template: string, variables) {
      if (template && template.indexOf('<%') != -1) {
        return _.template(template, variables)();
      }
      return template;
    }

    public sendRecordNotification(oid, record, options, user, response) {
      const isSailsEmailConfigDisabled = (_.get(sails.config, 'services.email.disabled', false) == "true");
      if (isSailsEmailConfigDisabled) {
        sails.log.verbose(`Not sending notification log for: ${oid}, config: services.email.disabled is ${isSailsEmailConfigDisabled}`);
        return Observable.of(null);
      } else if (this.metTriggerCondition(oid, record, options) == "true") {
        const variables = {
          imports: {
            record: record,
            oid: oid
          }
        };
        sails.log.debug(`Sending record notification for oid: ${oid}`);
        sails.log.verbose(options);
        // send record notification
        const to = this.runTemplate(_.get(options, "to", null), variables);
        if (!to) {
          sails.log.error(`Error sending notification for oid: ${oid}, invalid 'To' address: ${to}. Please check your configuration 'to' option: ${_.get(options, 'to')}`);
          return Observable.of(null);
        }
        const subject = this.runTemplate(_.get(options, "subject", null), variables);
        const templateName = _.get(options, "template", "");
        const from = this.runTemplate(_.get(options, "from", sails.config.emailnotification.defaults.from), variables);
        const msgFormat = _.get(options, "msgFormat", sails.config.emailnotification.defaults.format);
        const cc = this.runTemplate(_.get(options, "cc", sails.config.emailnotification.defaults.cc), variables);

        const data = {};
        data['record'] = record;
        data['oid'] = oid;
        data['sailsConfig'] = sails.config;
        return this.buildFromTemplate(templateName, data)
          .flatMap(buildResult => {
            if (buildResult['status'] != 200) {
              sails.log.error(`Failed to build email result:`);
              sails.log.error(buildResult);
              return Observable.throw(new Error('Failed to build email body.'));
            }
            return this.sendMessage(to, buildResult['body'], subject, from, msgFormat, cc);
          })
          .flatMap(sendResult => {
            if (sendResult['code'] == '200') {
              // perform additional processing on success...
              const postSendHooks = _.get(options, "onNotifySuccess", null);
              if (postSendHooks) {
                _.each(postSendHooks, (postSendHook) => {
                  const postSendHookFnName = _.get(postSendHook, 'function', null);
                  if (postSendHookFnName) {
                    const postSendHookFn = eval(postSendHookFnName);
                    const postSendHookOpts = _.get(postSendHook, 'options', null);
                    postSendHookFn(oid, record, postSendHookOpts).subscribe(postSendRes => {
                      sails.log.verbose(`Post notification sending hook completed: ${postSendHookFnName}`);
                    });
                  }
                });
              }
            }
            if (!_.isEmpty(response)) {
              return Observable.of(response);
            } else {
              return Observable.of(record);
            }
          });
      } else {
        sails.log.verbose(`Not sending notification log for: ${oid}, condition not met: ${_.get(options, "triggerCondition", "")}`)
        sails.log.verbose(JSON.stringify(record));
      }
      if (!_.isEmpty(response)) {
        return Observable.of(response);
      } else {
        return Observable.of(record);
      }
    }
  }



}

module.exports = new Services.Email().exports();
