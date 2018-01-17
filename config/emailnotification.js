module.exports.emailnotification = {
    api: {
      send: {method: 'post', url: "/redbox/api/v1/messaging/emailnotification"}
    },
    settings: {
      enabled: true,
      from: "noreply@redbox",
      templateDir: "views/emailTemplates/"
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
