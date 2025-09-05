/**
 * 
 * Sets the language code, currently implemented as a session attribute
 * 
 */
module.exports = async function(req, res, next) {
  await TranslationService.handle(req, res, next);
};