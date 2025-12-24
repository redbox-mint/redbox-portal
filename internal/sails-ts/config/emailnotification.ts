import type { SailsConfig } from "redbox-core-types";

const emailnotificationConfig: SailsConfig["emailnotification"] = {
    api: {
        send: {method: 'post', url: "/api/v1/messaging/emailnotification"}
    },
    settings: {
        enabled: true,
        from: "noreply@redbox",
        templateDir: "views/emailTemplates/",
        serverOptions: {
            host: 'integration-testing-email-1',
            port: 1025,
            secure: false,
            tls: {
                rejectUnauthorized: false
            }
        }
    },
    defaults: {
        from: "redbox@dev",
        subject: "ReDBox Notification",
        format: "html"
    },
    templates: {
        transferOwnerTo: {subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo'},
        test: {subject: 'Test Email Message', template: 'test'}
    }
};

module.exports.emailnotification = emailnotificationConfig;
