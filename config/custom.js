module.exports.custom = {
  cacheControl: {
    noCache: [
      'csrfToken',
      'dynamic/apiClientConfig',
      'login',
      'begin_oidc',
      'login_oidc',
      'logout'
    ]
  },
};