module.exports = {
  emailnotification: {
    from: 'fuzzing@redbox.test',
    replyTo: 'noreply@redbox.test',
    smtp: {
      host: 'email-fuzz',
      port: 1025,
      secure: false,
      auth: false
    },
    disabled: false
  }
};
