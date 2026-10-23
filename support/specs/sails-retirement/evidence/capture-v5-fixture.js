// Run in mongosh against the disposable, stopped v5 comparison's MongoDB.
// docker exec -i sr-p0-mongo7 mongosh --quiet --file /dev/stdin < this-file > released-v5-upgrade-fixture.json
// This is a sanitized logical fixture, never an institution backup.
const selection = {
  'redbox-portal': ['brandingconfig', 'role', 'user', 'role_users__user_roles', 'recordtype', 'workflowstep', 'form', 'pathrule', 'dashboardtype', 'workspacetype'],
  'redbox-storage': ['record', 'recordaudit', 'integrationaudit'],
};
let redactedCredentials = 0;
let sanitizedEmails = 0;
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (/password|secret|token|apikey|cookie/i.test(key)) { redactedCredentials++; continue; }
      result[key] = sanitize(child);
    }
    return result;
  }
  if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    sanitizedEmails++;
    return 'synthetic@example.invalid';
  }
  return value;
}
const collections = [];
for (const [database, names] of Object.entries(selection)) {
  for (const collection of names) {
    const documents = db.getSiblingDB(database)[collection].find({}).sort({ _id: 1 }).toArray();
    // Convert BSON before recursive sanitization so ObjectId/Date representations survive.
    const exported = sanitize(JSON.parse(EJSON.stringify(documents)));
    collections.push({ database, collection, count: documents.length, documents: exported });
  }
}
print(JSON.stringify({
  sourceTag: 'v5.0.4',
  sourceCommit: 'c1dda53999f3b026347008731f33dba834e06c27',
  artifact: 'qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9',
  host: 'Sails 1.5.17 / Waterline, released image on Node 24.16.0',
  mongo: db.version(),
  fcv: db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 }).featureCompatibilityVersion,
  source: 'Only repository-shipped synthetic bootstrap data and the 12 recorded released Bruno requests; portal stopped before capture.',
  sanitization: { redactedCredentials, sanitizedEmails, omitted: 'Sessions, job/queue state, general vocabulary/search data and unrelated collections are excluded by allow-list.', limitation: 'Credential fields are removed. A fixture consumer must seed test-only credentials explicitly; this is not a restorable full backup or institution recovery proof.' },
  collections,
}, null, 2));
