/**
 * 
 * Sets the language code, currently implemented as a session attribute
 * 
 */
module.exports = function(req, res, next) {
  TranslationService.handle(req, res, next);
};