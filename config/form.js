/**
 * Form related configuration
 */
var _ = require('lodash');
var dataRecordForm = require('../form-config/dataRecord-1.0-draft.js');
var rdmpForm = require('../form-config/default-1.0-draft.js');
var dataPublicationForm = _.cloneDeep(require('../form-config/dataPublication-1.0-draft.js'));
var dataPublicationEmbargoedForm = _.cloneDeep(require('../form-config/dataPublication-1.0-embargoed.js'));
var dataPublicationPublishedForm = _.cloneDeep(require('../form-config/dataPublication-1.0-published.js'));
var dataPublicationPublishingForm = _.cloneDeep(require('../form-config/dataPublication-1.0-publishing.js'));
var dataPublicationQueuedForm = _.cloneDeep(require('../form-config/dataPublication-1.0-queued.js'));
var dataPublicationRetiredForm = _.cloneDeep(require('../form-config/dataPublication-1.0-retired.js'));
var dataPublicationReviewingForm = _.cloneDeep(require('../form-config/dataPublication-1.0-reviewing.js'));
module.exports.form = {
  defaultForm: "default-1.0-draft",
  forms: {
    "default-1.0-draft": rdmpForm,
    "dataRecord-1.0-draft": dataRecordForm,
    "dataPublication-1.0-draft": dataPublicationForm,
    "dataPublication-1.0-embargoed": dataPublicationEmbargoedForm,
    "dataPublication-1.0-published": dataPublicationPublishedForm,
    "dataPublication-1.0-publishing": dataPublicationPublishingForm,
    "dataPublication-1.0-queued": dataPublicationQueuedForm,
    "dataPublication-1.0-retired": dataPublicationRetiredForm,
    "dataPublication-1.0-reviewing": dataPublicationReviewingForm
  }
};
