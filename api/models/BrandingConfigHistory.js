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
  // Composite unique index to prevent duplicate versions for the same branding
  indexes: [
    {
      attributes: {
        branding: 1,
        version: 1
      },
      options: {
        unique: true
      }
    }
  ],
  datastore: 'redboxStorage'
};
