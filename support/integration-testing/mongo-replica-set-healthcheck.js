const admin = db.getSiblingDB('admin');

let status;
try {
  status = admin.runCommand({ replSetGetStatus: 1 });
} catch (_error) {
  status = { ok: 0 };
}

if (status.ok !== 1) {
  const initiated = admin.runCommand({
    replSetInitiate: {
      _id: 'rs0',
      members: [{ _id: 0, host: 'mongodb:27017' }],
    },
  });
  if (initiated.ok !== 1 && initiated.codeName !== 'AlreadyInitialized') {
    quit(1);
  }
  quit(1);
}

if (status.myState !== 1) {
  quit(1);
}

const probeDatabase = db.getSiblingDB('redbox_transaction_probe');
const probeCollection = probeDatabase.getCollection('readiness');
probeCollection.updateOne({ _id: 'transaction' }, { $set: { value: 0 } }, { upsert: true });

const session = db.getMongo().startSession();
try {
  session.startTransaction();
  session
    .getDatabase('redbox_transaction_probe')
    .getCollection('readiness')
    .updateOne({ _id: 'transaction' }, { $set: { value: 1 } });
  session.abortTransaction();
} catch (_error) {
  try {
    session.abortTransaction();
  } catch (_abortError) {
    // The failed transaction is already inactive.
  }
  session.endSession();
  probeCollection.deleteOne({ _id: 'transaction' });
  quit(1);
}
session.endSession();

const probe = probeCollection.findOne({ _id: 'transaction' });
probeCollection.deleteOne({ _id: 'transaction' });
quit(probe?.value === 0 ? 0 : 1);
