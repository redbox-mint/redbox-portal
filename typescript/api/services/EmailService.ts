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
  Observable,from,of,throwError,flatMap
} from 'rxjs';
import { Services as services } from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import 'rxjs/add/operator/toPromise';
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import * as nodemailer from 'nodemailer';
import {isObservable} from "rxjs";

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
      'sendRecordNotification',
      'evaluateProperties',
      'runTemplate',
    ];

    /**
     * Simple API service to POST a message queue to Redbox.
     * Base email sending method.
     *
     * The email address properties are a nodemailer address object.
     * In practice this is a single string, so only the 'plain', 'formatted name',
     * and 'comma separated list' within a string should be used.
     * See: https://nodemailer.com/message/addresses/
     *
     * @param msgTo Email address(es) of recipients for 'to' field.
     * @param msgBody The message content in the format set by 'msgFormat'.
     * @param msgSubject The email subject.
     * @param msgFrom Email address of the sender.
     * @param msgFormat The body format, either 'html' or 'text'.
     * @param cc Email address(es) of recipients for 'cc' field.
     * @param bcc Email address(es) of recipients for 'bcc' field.
     * @param otherSendOptions Additional sending options.
     * @return A promise that evaluates to the result of sending the email.
     */
    public sendMessage(
      msgTo,
      msgBody: string,
      msgSubject: string = sails.config.emailnotification.defaults.subject,
      msgFrom: string = sails.config.emailnotification.defaults.from,
      msgFormat: string = sails.config.emailnotification.defaults.format,
      cc: string = _.get(sails.config.emailnotification.defaults, 'cc', ''),
      bcc: string = _.get(sails.config.emailnotification.defaults, 'bcc', ''),
      otherSendOptions: { [dict_key: string]: any } = _.get(sails.config.emailnotification.defaults, 'otherSendOptions', {}),
    ): Observable<{ success: boolean, msg: string }> {

      return Observable.fromPromise(this.sendMessageAsync(msgTo, msgBody, msgSubject, msgFrom, msgFormat, cc, bcc, otherSendOptions));

    }

    /**
     * Send an email asynchronously.
     *
     * The email address properties are a nodemailer address object.
     * In practice this is a single string, so only the 'plain', 'formatted name',
     * and 'comma separated list' within a string should be used.
     * See: https://nodemailer.com/message/addresses/
     *
     * @param msgTo Email address(es) of recipients for 'to' field.
     * @param msgBody The message content in the format set by 'msgFormat'.
     * @param msgSubject The email subject.
     * @param msgFrom Email address of the sender.
     * @param msgFormat The body format, either 'html' or 'text'.
     * @param cc Email address(es) of recipients for 'cc' field.
     * @param bcc Email address(es) of recipients for 'bcc' field.
     * @param otherSendOptions Additional sending options.
     * @return The result of sending the email.
     * @private
     */
    private async sendMessageAsync(
      msgTo,
      msgBody: string,
      msgSubject: string,
      msgFrom: string,
      msgFormat: string,
      cc: string,
      bcc: string,
      otherSendOptions: { [dict_key: string]: any } = {},
    ): Promise<{ success: boolean, msg: string }> {
      if (!sails.config.emailnotification.settings.enabled) {
        sails.log.debug("Received email notification request, but is disabled. Ignoring.");
        return {
          'success': true,
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
          'success': false,
          'msg': 'Failed to establish mail transport connection.'
        };
      }

      const message = _.merge(otherSendOptions, {
        "to": msgTo,
        "subject": msgSubject,
        "from": msgFrom,
        "cc": cc,
        "bcc": bcc,
      });

      message[msgFormat] = msgBody;
      let response = {
        success: false,
        msg: "",
      };
      sails.log.debug(`Email message to send will be ${JSON.stringify(message)}`)
      try {
        let sendResult = await transport.sendMail(message);
        response.msg = `Email sent successfully. Message Id: ${sendResult.messageId}`;
        response.success = true;
        sails.log.info(response.msg);
      } catch (err) {
        response.msg = 'Email unable to be submitted';
        response.success = false;
        sails.log.error("Email sending failed")
        sails.log.error(err)
      }

      return response;
    }

    /**
     * Build Email Body from an EJS Template.
     * Templates are defined in sails config.
     *
     * @param template The file name without extension.
     * @param data The variables to use when rendering the template.
     * @param res The response object. Will contain 'status', 'body', might contain 'ex'.
     * @return The response object with 'status', 'body', and maybe 'ex' set.
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
        sails.log.error(`Unable to render template ${template} with data: ${JSON.stringify(data)}`);
        res['status'] = 500;
        res['body'] = 'Templating error.';
        res['ex'] = err;
        sails.log.error(err)
        return res;
      }
    }

    /**
     * Build Email Body from Template.
     * Templates are defined in sails config.
     *
     * @param template The file name without extension.
     * @param data The variables to use when rendering the template.
     * @return A promise that evaluates to the response object with 'status', 'body', and maybe 'ex' set.
     */
    public buildFromTemplate(template: string, data: any = {}): Observable<any> {
      return Observable.fromPromise(this.buildFromTemplateAsync(template, data));
    }

    /**
     * Send Email from Template.
     * Templates are defined in sails config.
     *
     * No return. The email is sent after the built template promise is evaluated.
     *
     * @param to Email address(es) of recipients for 'to' field.
     * @param subject The email subject.
     * @param template The file name without extension.
     * @param data The variables to use when rendering the template.
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

    /**
     * Render a lodash template from a string.
     * @param template The template string.
     * @param variables The variables to use when rendering the template.
     * @return The rendered template string.
     * @protected
     */
    public runTemplate(template: string, variables) {
      if (template && template.indexOf('<%') != -1) {
        return _.template(template, variables)();
      }
      return template;
    }

    /**
     * Send an email build from the given record data.
     *
     * @param oid The record identifier.
     * @param record The record data.
     * @param options The email options.
     * @param user The optional user.
     * @param response The optional response to return.
     * @return The response if provided or the record data.
     */
    public async sendRecordNotification(oid, record, options, user, response) {
      const msgPartial = `for oid '${oid}' template '${options.template}'`;
      const isSailsEmailConfigDisabled = (_.get(sails.config, 'services.email.disabled', false) == "true");
      let triggerConditionResult;
      if (isSailsEmailConfigDisabled) {
        sails.log.verbose(`Not sending record notification ${msgPartial}, config: services.email.disabled is ${isSailsEmailConfigDisabled}`);
        return record;
      } else if ((triggerConditionResult = this.metTriggerCondition(oid, record, options, user)) == "true") {
        const variables = {
          imports: {
            record: record,
            oid: oid,
          },
          record: record,
          oid: oid,
        };
        sails.log.debug(`Sending record notification ${msgPartial}`);
        sails.log.verbose(options);
        // send record notification
        const optionsEvaluated = this.evaluateProperties(options, {}, variables);

        if (!optionsEvaluated.toRendered) {
          sails.log.error(`Error sending record notification ${msgPartial}, ` +
            `invalid 'To' address: ${optionsEvaluated.toRendered}. ` +
            `Please check your configuration 'to' option: ${_.get(options, 'to')}`);
          throw new Error('Invalid email address.');
        }

        const buildResult = await optionsEvaluated.templateRendered.toPromise();

        if (buildResult['status'] != 200) {
          sails.log.error(`Failed to build email body ${msgPartial}, result: ${JSON.stringify(buildResult)}`);
          throw new Error('Invalid email body.');
        }
        const sendResult = await this.sendMessage(
          optionsEvaluated.toRendered,
          buildResult['body'],
          optionsEvaluated.subjectRendered,
          optionsEvaluated.fromRendered,
          optionsEvaluated.formatRendered,
          optionsEvaluated.ccRendered,
          optionsEvaluated.bccRendered,
          _.get(options, 'otherSendOptions', {}),
        ).toPromise();

        if (sendResult.success) {
          sails.log.verbose(`Record send notification succeeded ${msgPartial}`);
          const postSendHooks = _.get(options, "onNotifySuccess", null);
          if (postSendHooks) {
            sails.log.verbose(`Processing onNotifySuccess hooks`);
            _.each(postSendHooks, (postSendHook) => {
              const postSendHookFnName = _.get(postSendHook, 'function', null);
              if (postSendHookFnName) {
                sails.log.verbose(`Pre notification onNotifySuccess hook: ${postSendHookFnName}`);
                const postSendHookFn = eval(postSendHookFnName);
                const postSendHookOpts = _.get(postSendHook, 'options', null);
                let postSendHookResult = postSendHookFn(oid, record, postSendHookOpts, user, response);

                if (isObservable(postSendHookResult)) {
                  postSendHookResult = postSendHookResult.toPromise();
                } else {
                  postSendHookResult = Promise.resolve(postSendHookResult);
                }

                postSendHookResult.then(result => {
                  sails.log.verbose(`Post notification ${msgPartial} sending hook '${postSendHookFnName}' completed with result: ${JSON.stringify(result)}`);
                }).catch(error => {
                  sails.log.verbose(`Post notification ${msgPartial} sending hook '${postSendHookFnName}' failed with error: ${JSON.stringify(error)}`);
                });
              }
            });
          }
        }
        if (!_.isEmpty(response)) {
          options.returnType = 'response';
          return response;
        } else {
          return record;
        }

      } else {
        sails.log.verbose(`Not sending notification ${msgPartial}, trigger condition not met ${_.get(options, "triggerCondition", "")} with result ${triggerConditionResult} for record ${JSON.stringify(record)}`)
      }
      if (!_.isEmpty(response)) {
        options.returnType = 'response';
        return response;
      } else {
        return record;
      }
    }

    /**
     *
     * @param options
     * @param config
     * @param templateData
     */
    public evaluateProperties(options: object, config: object = {}, templateData: object = {}): {
      format: string, formatRendered: string,
      from: string, fromRendered: string,
      to: string, toRendered: string,
      cc: string, ccRendered: string,
      bcc: string, bccRendered: string,
      subject: string, subjectRendered: string,
      template: any, templateRendered: any,
    } {
      let result = {
        format: "", formatRendered: "",
        from: "", fromRendered: "",
        to: "", toRendered: "",
        cc: "", ccRendered: "",
        bcc: "", bccRendered: "",
        subject: "", subjectRendered: "",
        template: null, templateRendered: null,
      };

      if (_.isNil(options)) {
        sails.log.verbose("EmailService::EvaluateProperties: No options provided.");
        return result;
      }

      const mergedConfig = _.merge({
        format: {
          names: ["msgFormat", "format",],
          defaultKey: "format",
        },
        from: {
          names: ["msgFrom", "from"],
          defaultKey: "from",
          templateFunc: this.runTemplate,
        },
        to: {
          names: ["msgTo", "to"],
          templateFunc: this.runTemplate,
        },
        cc: {
          names: ["cc"],
          defaultKey: "cc",
          templateFunc: this.runTemplate,
        },
        bcc: {
          names: ["bcc"],
          defaultKey: "bcc",
          templateFunc: this.runTemplate,
        },
        subject: {
          names: ["subject"],
          defaultKey: "subject",
          templatesKey: "subject",
          templateFunc: this.runTemplate,
        },
        template: {
          names: ["template"],
          templateFunc: this.buildFromTemplate,
        }
      }, config);

      // Add the sails config to the template data.
      templateData['sailsConfig'] = sails.config;

      // Get the template name first, so it is available for the other properties.
      let templateName = null;
      templateName = this.evaluatePropertyOptions(options, templateName, mergedConfig.template);
      templateName = this.evaluatePropertyDefault(templateName, mergedConfig.template);

      // Evaluate each property.
      for (const prop in mergedConfig) {
        const propConfig = mergedConfig[prop];
        sails.log.verbose(`EmailService::EvaluateProperties: Evaluating ${prop} using ${JSON.stringify(propConfig)}.`);

        result = _.merge(
          result,
          this.evaluateProperty(options, prop, propConfig, templateData, templateName)
        );
      }

      return result;
    }

    /**
     * Evaluate a property.
     *
     * @param options Object containing one of the keys in the property configuration.
     * @param prop The property name.
     * @param propConfig The property configuration.
     * @param templateData The template variables to render.
     * @param templateName The name of the template.
     * @return An object with the un-rendered property value with the property name as the key,
     *         and the rendered value with the property name + 'Rendered' as the key.
     * @private
     */
    private evaluateProperty(options: object, prop: string, propConfig: object, templateData: object, templateName: string | null) {
      const result = {};
      let propValue = null;

      propValue = this.evaluatePropertyOptions(options, propValue, propConfig);
      propValue = this.evaluatePropertyTemplateConfig(prop, propValue, propConfig, templateName);
      propValue = this.evaluatePropertyDefault(propValue, propConfig);
      sails.log.verbose(`EmailService::EvaluateProperty: Prop ${prop} value: ${JSON.stringify(propValue)}.`);
      result[prop] = propValue;

      const propRendered = this.evaluatePropertyTemplate(propValue, propConfig, templateData);
      result[`${prop}Rendered`] = _.isNil(propRendered) ? propValue : propRendered;

      return result;
    }

    /**
     * Get the property value from the provided options.
     *
     * @param options Object containing one of the keys in the property configuration.
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @return The property value if it is in options, otherwise null.
     * @private
     */
    private evaluatePropertyOptions(options: object, propValue: string | null, propConfig: object) {
      //
      const propNames = _.get(propConfig, "names", []);
      if (!_.isNil(propNames)) {
        for (const propName of propNames) {
          propValue = _.get(options, propName, null);
          if (!_.isNil(propValue)) {
            sails.log.verbose(`EmailService::EvaluatePropertyOptions: Got value for '${propName}': ${JSON.stringify(propValue)}.`);
            break;
          }
        }
      }

      return propValue;
    }

    /**
     * Get a property default value from the emailnotification defaults configuration.
     *
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @return The default value from the defaults configuration, or the property value.
     * @private
     */
    private evaluatePropertyDefault(propValue: string | null, propConfig: object) {
      const propDefaultKey = _.get(propConfig, "defaultKey", null);
      if (_.isNil(propValue) && !_.isNil(propDefaultKey)) {
        propValue = _.get(sails.config.emailnotification.defaults, propDefaultKey, null);
        sails.log.verbose(`EmailService::EvaluatePropertyDefault: Got value for '${propDefaultKey}': ${JSON.stringify(propValue)}.`);
      }
      return propValue;
    }

    /**
     * Get a property default value from the emailnotification templates configuration.
     *
     * @param prop The property name.
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @param templateName The name of the template.
     * @return The default value from the templates configuration, or the property value.
     * @private
     */
    private evaluatePropertyTemplateConfig(prop: string, propValue: string | null, propConfig: object, templateName: string | null) {
      const propTemplateConfigKey = _.get(propConfig, "templatesKey", null);
      if (!_.isNil(propValue) || _.isNil(propTemplateConfigKey) || _.isNil(templateName)) {
        return propValue;
      }

      const templatesConfigItem = _.get(sails.config.emailnotification.templates, templateName);
      if (!_.isNil(templatesConfigItem)) {
        propValue = _.get(templatesConfigItem, prop, null);
        sails.log.verbose(`EmailService::EvaluatePropertyTemplateConfig: Got value for '${templatesConfigItem}': ${JSON.stringify(propValue)}.`);
      }

      return propValue;
    }

    /**
     * Render the property using the template function.
     *
     * @param propValue The value of the property obtained from the provided options or defaults.
     * @param propConfig The property configuration.
     * @param templateData The template variables to render.
     * @return The result of rendering the template function with the data, or the property value if there is no template function.
     * @private
     */
    private evaluatePropertyTemplate(propValue: string | null, propConfig: object, templateData: object) {
      const templateFunc = _.get(propConfig, 'templateFunc', null);
      if (!_.isNil(propValue) && !_.isNil(templateFunc)) {
        sails.log.verbose(`EmailService::EvaluatePropertyTemplate: Rendering using template function. Data: ${JSON.stringify(propValue)} `);

        if (!_.has(templateData, 'imports')) {
          // the lodash template function expects the data to be in under 'imports'
          templateData['imports'] = _.cloneDeep(templateData);
        }
        const func = templateFunc.bind(this);
        return func(propValue, templateData);
      }
      return propValue;
    }
  }



}

module.exports = new Services.Email().exports();
