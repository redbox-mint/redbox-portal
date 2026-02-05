import { Controllers as controllers } from '../CoreController';
import { Services } from '../services/EmailService';


export namespace Controllers {
  /**
   *  Redbox email message queue stuff
   *
   * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
   */
  export class Email extends controllers.Core.Controller {

      protected emailService!: Services.Email;

      /**
       * Exported methods, accessible from internet.
       */
      protected override _exportedMethods: any = [
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

        public sendNotification(req: Sails.Req, res: Sails.Res) {
            if (!req.body.to){
                sails.log.error("No email recipient in email notification request!");
                this.sendResp(req, res, {
                    status: 400,
                    displayErrors: [{ title: "An error has occurred", detail: "No email recipient in email notification request!" }],
                    headers: this.getNoCacheHeaders()
                });
                return;
            }
            if (!req.body.template){
                sails.log.error("No template specified in email notification request!");
                this.sendResp(req, res, {
                    status: 400,
                    displayErrors: [{ title: "An error has occurred", detail: "No template specified in email notification request!" }],
                    headers: this.getNoCacheHeaders()
                });
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

            let emailProperties;
            try {
                emailProperties = this.emailService.evaluateProperties(options, config, templateDate);
            } catch (error) {
                sails.log.error("Failed to evaluate email template properties", error);
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders()
                });
            }
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
            if (!templateRendered) {
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders()
                });
            }

            return templateRendered.subscribe((buildResult: any) => {
                if (buildResult['status'] != 200) {
                    return this.sendResp(req, res, {
                        status: 500,
                        displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                        headers: this.getNoCacheHeaders()
                    });
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

                    return sendResponse.subscribe((sendResult: any) => {
                        if (!sendResult['success']) {
                            return this.sendResp(req, res, {
                                status: 500,
                                displayErrors: [{ title: "An error has occurred", detail: "Failed to send email notification." }],
                                headers: this.getNoCacheHeaders()
                            });
                        } else {
                            return this.apiRespond(req, res, {message: sendResult['msg']}, 200);
                        }
                    });
                }
            }, (error: unknown) => {
                sails.log.error("Failed to render email template", error);
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders()
                });
            });

       }
  }
}
