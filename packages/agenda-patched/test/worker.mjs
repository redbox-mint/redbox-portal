// Real Agenda jobs, with real MongoDB or the real SQS repository and an in-memory SQS transport.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setImmediate as immediate, setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { createHook } from 'node:async_hooks';
const requireCore = createRequire(new URL('../../redbox-core/package.json', import.meta.url));
const { Agenda } = await import(process.env.AGENDA_TEST_AGENDA ?? requireCore.resolve('agenda'));
const [backendName, mode] = process.argv.slice(2);
const active = mode.startsWith('active');
const watchdogTimers = [];
const hook = createHook({
  init(_id, type, _trigger, resource) {
    if (type === 'Timeout' && resource._idleTimeout === (mode === 'touch' ? 100 : 300000)) {
      if (new Error().stack.includes('JobProcessor.js')) watchdogTimers.push(resource);
    }
  },
}).enable();
let backend;
let client;
let collection;
const commands = [];
if (backendName === 'mongo') {
  const { MongoClient } = await import(requireCore.resolve('mongodb'));
  const { MongoBackend } = await import(requireCore.resolve('@agendajs/mongo-backend'));
  client = await MongoClient.connect(process.env.AGENDA_TEST_MONGO_URL);
  collection = client.db().collection(`watchdog_${process.pid}`);
  backend = new MongoBackend({ mongo: client.db(), collection: collection.collectionName });
} else {
  const { SqsBackend } = await import(new URL('../../agenda-sqs-backend/dist/index.js', import.meta.url));
  const messages = [];
  backend = new SqsBackend({
    queueUrl: 'https://example.com/test',
    waitTimeSeconds: 0,
    sqsClient: {
      async send(command) {
        commands.push(command.constructor.name);
        if (command.constructor.name === 'SendMessageCommand')
          messages.push({
            Body: command.input.MessageBody,
            ReceiptHandle: 'receipt',
            MessageId: 'message',
            Attributes: { ApproximateReceiveCount: '1' },
          });
        if (command.constructor.name === 'ReceiveMessageCommand') return { Messages: messages.splice(0) };
        return {};
      },
    },
  });
}
const disconnect = backend.disconnect.bind(backend);
let disconnectFailed = false;
backend.disconnect = async () => {
  if (mode === 'active-cleanup-error' && !disconnectFailed) {
    disconnectFailed = true;
    throw new Error('expected disconnect failure');
  }
  await disconnect();
};
const agenda = new Agenda({ backend, processEvery: 20 });
const errors = [];
agenda.on('error', error => errors.push(error.message));
let release;
const held = new Promise(resolve => {
  release = resolve;
});
let ran = false;
const originalSave = backend.repository.saveJobState.bind(backend.repository);
let persistenceFailures = 0;
backend.repository.saveJobState = async (attrs, options) => {
  if (
    (mode === 'initial-save-error' || (mode === 'completion-save-error' && !attrs.lockedAt)) &&
    persistenceFailures++ === 0
  ) {
    throw new Error('expected persistence failure');
  }
  return originalSave(attrs, options);
};
let failures = 0;
agenda.on('fail', () => failures++);
agenda.define(
  'watchdog',
  async job => {
    ran = true;
    if (active) await held;
    if (mode === 'touch') {
      // Span several lock lifetimes while renewing through the real repository.
      for (let i = 0; i < 8; i++) {
        await delay(50);
        await job.touch();
      }
    }
    if (mode === 'failure') throw new Error('expected job failure');
  },
  { lockLifetime: mode === 'touch' ? 200 : 600000 }
);
try {
  await agenda.ready;
  await agenda.now('watchdog');
  const completed = once(agenda, mode === 'initial-save-error' ? 'error' : 'complete');
  const started = active ? once(agenda, 'start') : undefined;
  await agenda.start();
  if (active) {
    await started;
    await immediate();
    if (mode === 'active-cleanup-error') await assert.rejects(agenda.stop(true), /expected disconnect failure/);
    else await agenda.stop(false);
    await immediate();
    assert(
      watchdogTimers.every(timer => timer._destroyed),
      'stop left a watchdog sleep'
    );
    if (mode === 'active') assert.equal(agenda.jobProcessor, undefined);
    else assert.equal(agenda.jobProcessor.runningJobs.length, 1);
    release();
  }
  await completed;
  await immediate();
  if (mode === 'drain') await agenda.drain();
  else await agenda.stop();
  await immediate();
  assert.equal(ran, mode !== 'initial-save-error');
  assert(watchdogTimers.length > 0, 'no watchdog was exercised');
  console.log(`pending watchdogs: ${watchdogTimers.filter(timer => !timer._destroyed).length}`);
  assert.equal(failures, mode === 'failure' ? 1 : 0);
  assert.deepEqual(errors, mode === 'initial-save-error' ? ['expected persistence failure'] : []);
  if (backendName === 'sqs' && !mode.endsWith('save-error')) {
    assert(commands.includes('ChangeMessageVisibilityCommand'));
    assert(commands.includes(mode === 'failure' ? 'ChangeMessageVisibilityCommand' : 'DeleteMessageCommand'));
  }
  console.log('job completed; clean stop');
} finally {
  release();
  await agenda.stop();
  await backend.disconnect();
  if (collection) await collection.drop();
  if (client) await client.close();
  hook.disable();
}
// Deliberately no process.exit(), timer unref(), or child-side shutdown deadline.
