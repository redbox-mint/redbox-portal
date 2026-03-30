module.exports.storage = {
  // when loaded, this plugin will set itself as the default
  serviceName: "mongostorageservice",
  mongodb: {
    indices: [
      {
        key: {
          'harvestId': 1
        }
      },
      {
        key: {
          'dateCreated': 1
        }
      },
      {
        key: {
          'dateCreated': -1
        }
      },
      {
        key: {
          'lastSaveDate': 1
        }
      },
      {
        key: {
          'lastSaveDate': -1
        }
      },
      {
        key: {
          'metaMetadata.brandId': 1
        }
      },
      {
        key: {
          'metaMetadata.type': 1
        }
      },
      {
        key: {
          'metaMetadata.createdOn': 1
        }
      },
      {
        key: {
          'metaMetadata.createdOn': -1
        }
      },
      {
        key: {
          'metaMetadata.lastSaveDate': 1
        }
      },
      {
        key: {
          'metaMetadata.lastSaveDate': -1
        }
      },
      {
        key: {
          'redboxOid': 1
        }
      },
      {
        key: {
          'redboxOid': -1
        }
      }
    ]
  }
};
