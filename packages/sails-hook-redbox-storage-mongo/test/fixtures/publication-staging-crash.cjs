const { MongoClient } = require('mongodb');
const { PublicationStagingFence } = require('@researchdatabox/redbox-core');
(async () => {
  const [uri, database, encoded, mode] = process.argv.slice(2);
  const client = await MongoClient.connect(uri);
  const fence = new PublicationStagingFence(client.db(database));
  if (mode === 'admission') {
    await fence.acquire(JSON.parse(encoded));
    process.exit(23);
  }
  // Exit after the durable deletion decision, before any object-store request.
  await fence.deleteIfUnreferenced(
    JSON.parse(encoded),
    async () => false,
    async () => process.exit(23)
  );
  process.exit(24);
})().catch(error => {
  console.error(error);
  process.exit(25);
});
