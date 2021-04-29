module.exports.emailnotification = {
    api: {
      send: {method: 'post', url: "/api/v1/messaging/emailnotification"}
    },
    settings: {
      enabled: true,
      from: "noreply@redbox",
      templateDir: "views/emailTemplates/",
      //node mailer transport options.  See https://nodemailer.com/smtp/ for SMTP and other transport options
      serverOptions: {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'xxxxxxx',
            pass: 'xxxxxxx'
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
