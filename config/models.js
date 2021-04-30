/**
 * Default model configuration
 * (sails.config.models)
 *
 * Unless you override them, the following properties will be included
 * in each of your models.
 *
 * For more info on Sails models, see:
 * http://sailsjs.org/#!/documentation/concepts/ORM
 */

module.exports.models = {

  /***************************************************************************
  *                                                                          *
  * Your app's default connection. i.e. the name of one of your app's        *
  * connections (see `config/connections.js`)                                *
  *                                                                          *
  ***************************************************************************/
  // connection: 'localDiskDb',

  connection: 'mongodb',


  /***************************************************************************
  *                                                                          *
  * How and whether Sails will attempt to automatically rebuild the          *
  * tables/collections/etc. in your schema.                                  *
  *                                                                          *
  * See http://sailsjs.org/#!/documentation/concepts/ORM/model-settings.html  *
  *                                                                          *
  ***************************************************************************/
   migrate: 'safe',
   fetchRecordsOnUpdate: true,
   fetchRecordsOnCreate: true,
   fetchRecordsOnCreateEach: true,

   // Fetching records on destroy was experimental, but if you were using it,
   // uncomment the next line.
   // fetchRecordsOnDestroy: true,

   // The former `connection` model setting is now `datastore`.  This sets the datastore
   // that models will use, unless overridden directly in the model file in `api/models`.
   // It defaults to a datastore called `default`, which (unless otherwise configured in
   // the `config/datastores.js` file) uses the built-in `sails-disk` adapter.
   datastore: 'mongodb',

   // Because you can't have the old `connection` setting at the same time as the new
   // `datastore` setting, we'll set it to `null` here.  When you merge this file into your
   // existing `config/models.js` file, just remove any reference to `connection`.
   connection: null,

   // These attributes will be added to all of your models.  When you create a new Sails 1.0
   // app with "sails new", a similar configuration will be generated for you.
   attributes: {
     // In Sails 1.0, the `autoCreatedAt` and `autoUpdatedAt` model settings
     // have been removed.  Instead, you choose which attributes (if any) to use as
     // timestamps.  By default, "sails new" will generate these two attributes as numbers,
     // giving you the most flexibility.  But for compatibility with your existing project,
     // we'll define them as strings.
     createdAt: { type: 'string', autoCreatedAt: true, },
     updatedAt: { type: 'string', autoUpdatedAt: true, },
     // In Sails 1.0, the primary key field is no longer created for you, and `autoPK` is
     // not a valid model option.  Instead, you define it yourself and tell Sails which
     // attribute to use as the primary key by setting the `primaryKey` setting on the model.
     // That setting defaults to `id`.
     id: { type: 'string', columnName: '_id' }
   }

};
