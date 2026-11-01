#!/usr/bin/env node
const { MongoClient } = require('mongodb');
const { preflightHarvestRunIndexes } = require('../dist/utilities/HarvestRunIndexes');

/**
 * Check the configured portal datastore without changing records or indexes.
 * Print conflicts and set exit status 1 when settings are missing or checks fail.
 * Always close the MongoDB connection before returning.
 */
async function main() {
  const uri = process.env.HARVEST_MONGO_URL;
  const database = process.env.HARVEST_MONGO_DATABASE;
  if (!uri || !database) {
    console.error('Set HARVEST_MONGO_URL and HARVEST_MONGO_DATABASE to the portal datastore.');
    process.exitCode = 1;
    return;
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const issues = await preflightHarvestRunIndexes(client.db(database));
    if (issues.length) {
      for (const issue of issues) console.error(issue);
      process.exitCode = 1;
    } else {
      console.log('Harvest index preflight passed. No duplicate keys or conflicting index options found.');
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  // Connection errors can include credentials or hosts. Do not echo them.
  console.error(
    `Harvest index preflight failed (${error.codeName || error.name}). Check connectivity, permissions, and required settings.`
  );
  process.exitCode = 1;
});
