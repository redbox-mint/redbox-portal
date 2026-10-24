/* Run in the mounted Node 26 test container from the repository root. */
const assert = require('node:assert/strict');
const { of, Subject, firstValueFrom, config } = require('rxjs');
const { Services: { Users } } = require('../../../../../packages/redbox-core/dist/identity/Users');
const { Services: { Email } } = require('../../../../../packages/redbox-core/dist/integrations/Email');

async function membershipInterleaving(brandId) {
  const memberships = new Set(['admin']);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let removals = 0;
  const remove = async () => {
    memberships.clear();
    if (++removals === 1) { entered.resolve(); await release.promise; }
  };
  const add = async (_side, _id, roles) => { for (const role of roles) memberships.add(role); };
  const users = new Users({
    repository: {
      list: async () => [{ id: 'admin' }, { id: 'member' }],
      removeMemberships: remove,
      addMemberships: add,
      replaceMemberships: async (...args) => { await remove(); await add(...args); },
    },
    accounts: { getUserWithId: () => of({ id: 'user', roles: [...memberships] }) },
  });
  const older = firstValueFrom(users.updateUserRoles('user', ['admin'], brandId));
  await entered.promise;
  await firstValueFrom(users.updateUserRoles('user', ['member'], brandId));
  release.resolve();
  await older;
  assert.deepEqual([...memberships].sort(), ['admin', 'member']);
  console.log(`Inherited same-brand replacement race (${brandId ?? 'unscoped'}): both requested role sets survive`);
}

async function emailSubscription() {
  const send = new Subject();
  const reported = Promise.withResolvers();
  const original = config.onUnhandledError;
  config.onUnhandledError = reported.resolve;
  try {
    const returned = Email.prototype.sendTemplate.call({
      updateChronicle() {},
      buildFromTemplate: () => of({ status: 200, body: 'synthetic body' }),
      sendMessage: () => send,
    }, 'synthetic@example.invalid', 'subject', 'template', {});
    assert.equal(returned, undefined);
    assert.equal(send.observers.length, 1);
    const failure = new Error('synthetic delivery failure');
    send.error(failure);
    assert.equal(await reported.promise, failure);
    console.log('Inherited sendTemplate: no completion handle and RxJS unhandled error delivery');
  } finally { config.onUnhandledError = original; }
}

async function userFollowup() {
  const followup = Promise.withResolvers();
  const users = new Users({ accounts: { triggerPostSaveTriggers: () => followup.promise } });
  assert.equal(users.triggerPostSaveTriggers({}, {}), undefined);
  followup.resolve();
  console.log('Inherited Users triggerPostSaveTriggers wrapper: drops the completion handle');
}
(async () => {
  await membershipInterleaving('brand');
  await membershipInterleaving();
  await emailSubscription();
  await userFollowup();
})().catch(error => { console.error(error); process.exitCode = 1; });
