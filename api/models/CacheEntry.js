/**
 * CacheEntry.js
 *
 * @description :: Cache Entry - seen as temporary, please look at more permanent solutions for caching
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string',
      unique: true,
      required: true
    },
    data: {
      type: 'json'
    },
    // When entry was added, in seconds since epoch
    ts_added: {
      type: 'integer',
      required: true
    }
  }
};
