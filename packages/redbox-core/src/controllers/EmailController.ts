import { Controllers as controllers } from '../CoreController';
import { Services } from '../services/EmailService';
import {setReqCustomOption, setReqError} from "../utilities/RequestUtils";


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
                setReqCustomOption(req, 'email.error.noRecipient', true);
                setReqError(req);
                this.sendResp(req, res, {
                    status: 400,
                    displayErrors: [{ title: "An error has occurred", detail: "No email recipient in email notification request!" }],
                    headers: this.getNoCacheHeaders()
                });
                return;
            }
            if (!req.body.template){
                setReqCustomOption(req, 'email.error.noTemplate', true);
                setReqError(req);
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
            setReqCustomOption(req, 'email.options', options);
            const config = {};
            const templateDate = req.body.data;

            let emailProperties;
            try {
                emailProperties = this.emailService.evaluateProperties(options, config, templateDate);
            } catch (error) {
                setReqCustomOption(req, 'email.error.templateEvalFailed', true);
                setReqError(req, error, 500);
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
                setReqCustomOption(req, 'email.error.templateRenderFailed', true);
                setReqError(req, null, 500);
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders()
                });
            }

            return templateRendered.subscribe((buildResult: globalThis.Record<string, unknown>) => {
                if (buildResult['status'] != 200) {
                  setReqCustomOption(req, 'email.error.templateBuildFailed', buildResult);
                  setReqError(req, null, 500);
                    return this.sendResp(req, res, {
                        status: 500,
                        displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                        headers: this.getNoCacheHeaders()
                    });
                } else {
                    setReqCustomOption(req, 'email.send.data', {
                      toRendered, subjectRendered, fromRendered, formatRendered, ccRendered, bccRendered
                    });
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
                            setReqCustomOption(req, 'email.error.sendFailure', sendResult);
                            setReqError(req, null, 500);
                            return this.sendResp(req, res, {
                                status: 500,
                                displayErrors: [{ title: "An error has occurred", detail: "Failed to send email notification." }],
                                headers: this.getNoCacheHeaders()
                            });
                        } else {
                            setReqCustomOption(req, 'email.send.result', sendResult);
                            return this.apiRespond(req, res, {message: sendResult['msg']}, 200);
                        }
                    });
                }
            }, (error: unknown) => {
                setReqCustomOption(req, 'email.error.templateRenderFailed', true);
                setReqError(req, error, 500);
                return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ title: "An error has occurred", detail: "Failed to render email template." }],
                    headers: this.getNoCacheHeaders()
                });
            });

       }
  }
}
