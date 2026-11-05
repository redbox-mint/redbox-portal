'use strict';

module.exports = {
  name: '20261106T130000-lookup-claims',
  up: async ({ context: sails }) => {
    const model = sails.models.cacheentry;
    // Production uses migrate:safe, which does not install model unique flags.
    // Limit this constraint to our namespaces; preserve all existing cache data.
    // Fail closed if claims already conflict, rather than discarding a live lock.
    await model.getDatastore().manager.collection(model.tableName).createIndex(
      { name: 1 },
      {
        name: 'lookup_claim_name_unique',
        unique: true,
        partialFilterExpression: {
          $or: [
            { name: { $gte: 'figshare-vocabulary-sync:', $lt: 'figshare-vocabulary-sync;' } },
            { name: { $gte: 'party-import:', $lt: 'party-import;' } },
          ],
        },
      }
    );
  },
};
