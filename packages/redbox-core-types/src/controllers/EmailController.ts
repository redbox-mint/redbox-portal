import { Controllers as controllers } from '../CoreController';
import { Services } from '../services/EmailService';

declare var sails: any;
declare var _: any;

export module Controllers {
  /**
   *  Redbox email message queue stuff
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   */
  export class Email extends controllers.Core.Controller {

      protected emailService: Services.Email;

      /**
       * Exported methods, accessible from internet.
       */
      protected _exportedMethods: any = [
          'init',
          'sendNotification'
      ];

      public init() {
          this.emailService = sails.services.emailservice;
      }

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

            const emailProperties = this.emailService.evaluateProperties(options, config, templateDate);
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
                    const sendResponse = this.emailService.sendMessage(
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
  }
}
