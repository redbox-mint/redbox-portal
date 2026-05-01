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
      protected override _exportedMethods: string[] = [
          'init',
          'sendNotification'
      ];

      public init() {
          this.emailService = sails.services.emailservice as unknown as Services.Email;
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
                this.sendResp(req, res, {
                    status: 400,
                    displayErrors: [{ title: "An error has occurred", detail: "No email recipient in email notification request!" }],
                    headers: this.getNoCacheHeaders(),
                    chronicle: {emailPropMissing: 'recipient'},
                });
                return;
            }
            if (!req.body.template){
                this.sendResp(req, res, {
                    status: 400,
                    displayErrors: [{ title: "An error has occurred", detail: "No template specified in email notification request!" }],
                    headers: this.getNoCacheHeaders(),
                    chronicle: {emailPropMissing: 'template'},
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
            this.updateChronicle(req, {emailOptions: options});
            const config = {};
            const templateDate = req.body.data;

            let emailProperties;
            try {
                emailProperties = this.emailService.evaluateProperties(options, config, templateDate);
            } catch (error) {
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders(),
                    chronicle: {emailProcessStepFailed: 'evaluate properties'},
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
                    headers: this.getNoCacheHeaders(),
                    chronicle: {emailProcessStepFailed: 'evaluate template'},
                });
            }

            return templateRendered.subscribe((buildResult: globalThis.Record<string, unknown>) => {
                if (buildResult['status'] != 200) {
                    return this.sendResp(req, res, {
                        status: 500,
                        displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                        headers: this.getNoCacheHeaders(),
                        chronicle: {emailProcessStepFailed: 'build template', emailProcessStepResult: buildResult},
                    });
                } else {
                    this.updateChronicle(req, {emailSendOptions:{
                      toRendered, subjectRendered, fromRendered, formatRendered, ccRendered, bccRendered
                    }});
                    const sendResponse = this.emailService.sendMessage(
                        toRendered,
                        buildResult['body'] as string,
                        subjectRendered,
                        fromRendered,
                        formatRendered,
                        ccRendered,
                        bccRendered,
                    );

                    return sendResponse.subscribe((sendResult: globalThis.Record<string, unknown>) => {
                        if (!sendResult['success']) {
                            return this.sendResp(req, res, {
                                status: 500,
                                displayErrors: [{ title: "An error has occurred", detail: "Failed to send email notification." }],
                                headers: this.getNoCacheHeaders(),
                                chronicle: {emailProcessStepFailed: 'send', emailProcessStepResult: buildResult},
                            });
                        } else {
                            return this.sendResp(req, res, {
                              data: {message: sendResult['msg']},
                              status: 200,
                              headers: this.getNoCacheHeaders(),
                              chronicle: {emailSent: true, emailSendResult: sendResult},
                            });
                        }
                    });
                }
            }, (error: unknown) => {
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    errors: [error],
                    headers: this.getNoCacheHeaders(),
                    chronicle: {emailProcessStepFailed: 'render template'},
                });
            });

       }
  }
}
