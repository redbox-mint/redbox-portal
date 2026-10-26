// Fresh development volumes only, after the shared domain index script.
// Existing data uses reviewed app.express.cjs --maintenance=indexes:ensure.
// These database/collection names match application.cjs and the Compose inputs.
const agenda = db.getSiblingDB('redbox-agenda').getCollection('agendaJobs');
agenda.createIndex(
  { name: 1, nextRunAt: 1, priority: -1, lockedAt: 1, disabled: 1 },
  { name: 'findAndLockNextJobIndex' }
);
agenda.createIndex(
  { name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 },
  { name: 'name_1_disabled_1_lockedAt_1_nextRunAt_1' }
);
agenda.createIndex(
  { name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 },
  { name: 'name_-1_disabled_-1_lockedAt_-1_nextRunAt_-1' }
);
db.getSiblingDB('sessions-v6').getCollection('sessions').createIndex(
  { expires: 1 },
  { name: 'expires_1', expireAfterSeconds: 0 }
);
