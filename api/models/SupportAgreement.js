/**
 * SupportAgreement.js
 *
 * @description :: Support agreement model keyed by brand + year.
 *                 Stores agreed days, release notes, and timesheet summaries.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    /**
     * Reference to the BrandingConfig that owns this agreement.
     */
    branding: {
      model: 'brandingconfig',
      required: true
    },
    /**
     * The calendar year this agreement covers (e.g., 2024, 2025).
     */
    year: {
      type: 'number',
      required: true
    },
    /**
     * Total support days agreed for this year.
     */
    agreedSupportDays: {
      type: 'number',
      defaultsTo: 0
    },
    /**
     * Array of release notes for this year.
     * Each item: { title: string, date: string, url?: string, summary?: string }
     */
    releaseNotes: {
      type: 'json',
      defaultsTo: []
    },
    /**
     * Array of timesheet summary entries.
     * Each item: { summary: string, days: number }
     */
    timesheetSummary: {
      type: 'json',
      defaultsTo: []
    }
  },

  /**
   * Indexes to enforce one agreement per brand+year combination.
   */
  indexes: [
    {
      attributes: { branding: 1, year: 1 },
      options: { unique: true }
    }
  ]
};
