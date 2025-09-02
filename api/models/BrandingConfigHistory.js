/**
 * BrandingConfigHistory.js
 *
 * Stores published versions of BrandingConfig for rollback.
 */
module.exports = {
  attributes: {
    branding: { model: 'brandingconfig', required: true },
    version: { type: 'number', required: true },
    hash: { type: 'string', required: true },
    css: { type: 'string' }, // stored CSS content at publish time
    variables: { type: 'json' },
    // autoCreatedAt provides timestamp for when publish occurred
    dateCreated: { type: 'string', autoCreatedAt: true }
  },
  datastore: 'redboxStorage'
};
