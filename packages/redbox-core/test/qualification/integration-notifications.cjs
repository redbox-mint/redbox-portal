const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:net');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Notifications } = require('../../dist/integrations/IntegrationNotifications');
const { integrationNotificationState } = require('../../dist/integrations/IntegrationNotificationState');
const { Services: Email } = require('../../dist/integrations/Email');
const { emailnotification } = require('../../dist/config/emailnotification.config');
const runtime = require('../../dist/persistence/runtime');
const { initializeCachePersistence, getCacheEntryRepository } = require('../../dist/persistence/cache/runtime');
const { ensureCachePersistenceIndex } = require('../../dist/persistence/cache/preflight');

test(
  'notifications await SMTP and durable throttle state, survive reconstruction and clear on recovery',
  { timeout: 30000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    assert.equal(global.sails, undefined);
    const url = process.env.SR_NOTIFICATIONS_MONGO_URL;
    assert(url, 'SR_NOTIFICATIONS_MONGO_URL is required; qualification cannot skip');
    assert.equal(new URL(url).pathname, '/sr_p7_notifications');
    const native = await new MongoClient(url).connect();
    const owner = { config: { datastores: { mongodb: { url } } }, log };
    const messages = [];
    const received = Promise.withResolvers();
    const release = Promise.withResolvers();
    const sockets = new Set();
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.write('220 qualifier ESMTP\r\n');
      let pending = '',
        data = false,
        message = '';
      socket.on('data', chunk => {
        pending += chunk.toString();
        let index;
        while ((index = pending.indexOf('\r\n')) >= 0) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 2);
          if (data) {
            if (line === '.') {
              data = false;
              messages.push(message);
              message = '';
              received.resolve();
              void release.promise.then(() => socket.write('250 accepted\r\n'));
            } else message += line + '\r\n';
          } else if (/^EHLO|^HELO/.test(line)) socket.write('250 qualifier\r\n');
          else if (/^DATA/.test(line)) {
            data = true;
            socket.write('354 send message\r\n');
          } else if (/^QUIT/.test(line)) socket.end('221 goodbye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0);
      await runtime.initializePersistence(owner);
      await ensureCachePersistenceIndex(owner);
      await initializeCachePersistence(owner);
      const repository = getCacheEntryRepository(owner);
      const email = new Email.Email({
        config: {
          ...emailnotification,
          settings: {
            ...emailnotification.settings,
            templateDir: path.resolve(__dirname, '../../../../views/emailTemplates') + '/',
            serverOptions: { host: '127.0.0.1', port: server.address().port, secure: false },
          },
        },
        log,
        templateContext: {},
        resolveHook: () => {
          throw new Error('Unexpected email hook');
        },
        retainFollowup: () => {
          throw new Error('Unexpected detached email');
        },
      });
      const makeNotifications = () =>
        new Notifications.IntegrationNotificationService({
          log,
          email,
          configuration: async () => ({
            enabled: true,
            recipients: ['operator@example.invalid'],
            channels: [{ type: 'email' }],
            throttle: { enabled: true, windowSeconds: 300 },
            recoveryAlerts: true,
          }),
          state: integrationNotificationState(repository, 31536000),
        });
      const entry = {
        redboxOid: 'qualified-record',
        brandId: 'qualified-brand',
        integrationName: 'DOI',
        integrationAction: 'publish',
        status: 'failed',
      };
      const pending = makeNotifications().dispatch({ attrs: { data: entry } });
      let complete = false;
      void pending.then(() => {
        complete = true;
      });
      await received.promise;
      assert.equal(complete, false, 'dispatch must await accepted SMTP I/O');
      const key = 'intnotif:qualified-brand:qualified-record:doi';
      assert.equal(await repository.findByName(key), null);
      release.resolve();
      await pending;
      const persisted = await repository.findByName(key);
      assert(persisted?.data?.failedAt);
      assert(Date.parse(persisted.data.expiresAt) > Date.now());
      await makeNotifications().dispatch({ attrs: { data: entry } });
      assert.equal(messages.length, 1, 'a new instance must suppress the persisted active failure');
      await makeNotifications().dispatch({ attrs: { data: { ...entry, status: 'success' } } });
      assert.equal(messages.length, 2);
      assert.equal((await repository.findByName(key)).data, null);
      await makeNotifications().dispatch({ attrs: { data: { ...entry, status: 'success' } } });
      assert.equal(messages.length, 2, 'cleared failure must not send duplicate recovery');
      assert(messages[0].includes('Integration Failure'));
      assert(messages[1].includes('Integration Recovery'));
      await repository.updateByName(key, { name: key, data: persisted.data, ts_added: 0 });
      assert.equal(await integrationNotificationState(repository, 31536000).get(key), null);
      assert.equal(global.sails, undefined);
      assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
      console.log(
        JSON.stringify({ smtpDeliveries: messages.length, reconstructedSuppression: true, recoveryCleared: true })
      );
    } finally {
      release.resolve();
      await runtime.cleanupPersistence(owner);
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
      await native.db().dropDatabase();
      await native.close();
    }
  }
);
