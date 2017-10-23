module.exports.emailnotification = {
    api: {
      send: {method: 'post', url: "http://redbox:9000/redbox/api/v1/messaging/emailnotification"}
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
    }
  };
  