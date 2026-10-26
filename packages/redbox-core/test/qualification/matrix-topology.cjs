const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');

async function prepare() {
  const [set, ...ports] = process.argv.slice(2);
  assert(/^sr-(core|storage)$/.test(set));
  assert([1, 3].includes(ports.length));
  const clients = ports.map(
    port =>
      new MongoClient('mongodb://127.0.0.1:' + port, {
        directConnection: true,
        serverSelectionTimeoutMS: 1000,
      })
  );
  const client = clients[0];
  try {
    const deadline = Date.now() + 90000;
    // Initiation performs a quorum check. Starting the containers does not mean
    // every member is listening yet, so await each physical server first.
    for (const member of clients) {
      for (;;) {
        try {
          await member.connect();
          await member.db().command({ ping: 1 });
          break;
        } catch (error) {
          if (Date.now() >= deadline) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (ports.length === 1) return;
    await client.db('admin').command({
      replSetInitiate: {
        _id: set,
        members: ports.map((port, index) => ({ _id: index, host: '127.0.0.1:' + port })),
      },
    });
    for (;;) {
      const hello = await client.db().command({ hello: 1 });
      if (hello.primary) {
        console.log(JSON.stringify({ set, primary: hello.primary, hosts: hello.hosts }));
        return;
      }
      assert(Date.now() < deadline, 'Replica set must elect a primary');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    await Promise.all(clients.map(member => member.close()));
  }
}
prepare().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
