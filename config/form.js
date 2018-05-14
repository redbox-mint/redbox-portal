/**
 * Form related configuration
 */
 var dataRecordForm = require('../form-config/dataRecord-1.0-draft.js');
 var rdmpForm = require('../form-config/default-1.0-draft.js');
 var dataPublicationForm = require('../form-config/dataPublication-1.0-draft.js');
module.exports.form = {
  defaultForm: "default-1.0-draft",
  forms: {
    "default-1.0-draft": rdmpForm,
    "dataRecord-1.0-draft": dataRecordForm,
    "dataPublication-1.0-draft": dataPublicationForm
  }
};
