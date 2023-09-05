/**
 * 
 * Sets the language code, currently implemented as a session attribute
 * 
 */
module.exports = function(req, res, next) {
  let langCode = req.param('lang');
  let sessLangCode = req.session.lang;
  if (_.isEmpty(langCode) && _.isEmpty(sessLangCode)) {
    // use the default
    langCode = sails.config.i18n.next.init.lng;
  } else if (!_.isEmpty(sessLangCode) && _.isEmpty(langCode)) {
    // use the session code if not found as request param
    langCode = sessLangCode;
  }
  // validating language 
  if (_.indexOf(sails.config.i18n.next.init.supportedLngs, langCode) == -1) {
    // unsupported language, set to default
    sails.log.warn(`Unsupported language code: ${langCode}, setting to default.`);
    langCode = sails.config.i18n.next.init.lng;
  }
  // save the lang in the session
  req.session.lang = langCode;
  // set the locals lang code
  req.options.locals.lang = langCode;
  next();
};