db.getSiblingDB('redbox_cache_p6').cacheentry.createIndex(
  { name: 1 },
  { unique: true, name: 'cacheentry_name_unique' }
);
