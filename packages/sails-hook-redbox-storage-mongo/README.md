# ReDBox MongoDB Storage Plugin

This project enables storage of ReDBox data (DMPs, Data Records, etc.) in MongoDB.

## Configuration

### MongoDB 

- The plugin will use the DB specified by the ['datastore'](https://sailsjs.com/documentation/concepts/models-and-orm/model-settings#?datastore) configured within the [API model definition](https://github.com/redbox-mint/sails-hook-redbox-storage-mongo/blob/master/api/models/Record.js). By default, this is ['redboxStorage'](https://github.com/redbox-mint/redbox-portal/blob/backend-refactor/config/datastores.js#L17).
- Datastores are configured at the SailsJS level, see [Waterline reference](https://sailsjs.com/documentation/reference/waterline-orm/datastores) and [SailsJS datastores configuration](https://sailsjs.com/documentation/reference/configuration/sails-config-datastores). Specifically, the datastore uses the [sails-mongo adapter](https://github.com/balderdashy/sails-mongo#compatibility), which allows for advanced connection options, including [specifying SSL files, etc.](https://mongodb.github.io/node-mongodb-native/3.5/api/MongoClient.html#.connect)
