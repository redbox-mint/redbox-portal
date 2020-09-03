/**
 * The "Existing Locations" form definition
 */
module.exports = {
  name: "existing-locations-1.0-draft",
  type: "workspace",
  skipValidationOnSave: false, // perform client-side validation
  editCssClasses: 'row col-md-12',
  viewCssClasses: 'row col-md-offset-1 col-md-10',
  messages: {
    "saving": ["@dmpt-form-saving"],
    "validationFail": ["@dmpt-form-validation-fail-prefix", "@dmpt-form-validation-fail-suffix"],
    "saveSuccess": ["@dmpt-form-save-success"],
    "saveError": ["@dmpt-form-save-error"]
  },
  fields: [
      // TODO: Add form fields for this workspace
  ]
};
