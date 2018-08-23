/**
 * Data Publication form - Publishing
 */

// import the common publication tabs
//
var _ = require('lodash');
var mainViewOnly = require('../form-config/publication/header-view-only-1.0.js');
var mainTab = require('../form-config/publication/tab-main-1.0.js');
// Non-draft specific footer
var footer = require('../form-config/publication/footer-non-draft-1.0.js');
// Start building the main tab and child tabs...
var startTab = require('../form-config/publication/tab-start-1.0.js');
var coverageTab = require('../form-config/publication/tab-coverage-1.0.js');
var dataTab = require('../form-config/publication/tab-data-1.0.js');
var supplementsTab = require('../form-config/publication/tab-supplements-1.0.js');
var licenseTab = require('../form-config/publication/tab-license-1.0.js');
var citationTab = require('../form-config/publication/tab-citation-1.0.js');
var submitTab = require('../form-config/publication/tab-submit-1.0.js');
var reviewerTab = require('../form-config/publication/tab-reviewer-1.0.js');
mainTab[0].definition.fields = _.concat(startTab, coverageTab, dataTab, supplementsTab, licenseTab, citationTab, submitTab, reviewerTab);
// now buid the main elements of the form....
var fields = _.concat(mainViewOnly, mainTab, footer);
module.exports = {
  name: 'dataPublication-1.0-publishing',
  type: 'dataPublication',
  skipValidationOnSave: false,
  editCssClasses: 'row col-md-12',
  viewCssClasses: 'row col-md-offset-1 col-md-10',
  messages: {
    "saving": ["@dmpt-form-saving"],
    "validationFail": ["@dmpt-form-validation-fail-prefix", "@dmpt-form-validation-fail-suffix"],
    "saveSuccess": ["@dmpt-form-save-success"],
    "saveError": ["@dmpt-form-save-error"]
  },
  fields: fields
};
