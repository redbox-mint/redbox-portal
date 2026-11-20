import assert from 'node:assert/strict';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { integrationProviderFixture } from './integrationProviderFixture';
import { normalizeIntegrations } from './integrationDifferentialSupport';
import { session, wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

const providedReply = 'request-reply@example.invalid';
const trustedReply = 'default-reply@example.invalid';
describe('Public notification options through production HTTP and SMTP', function () {
  this.timeout(120000);
  for (const [key, version, replyTo, defaults] of [
    ['forwards only public replyTo in API 1.0', '1.0', providedReply, false],
    ['forwards only public replyTo in API 2.0', '2.0', providedReply, false],
    ['layers public replyTo over trusted default send options', '1.0', providedReply, true],
    ['retains service defaults when public replyTo is omitted', '1.0', undefined, true],
  ] as const)
    it(key, async () => {
      const provider = await integrationProviderFixture();
      try {
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: integrationDeclarations,
          configuration: {
            ...provider.configuration,
            emailnotification: {
              ...provider.configuration.emailnotification,
              ...(defaults
                ? { defaults: { otherSendOptions: { replyTo: trustedReply, headers: { 'X-Trusted': 'retained' } } } }
                : {}),
            },
          },
        });
        try {
          const auth = await session(f);
          const response = await wire(
            f.url + '/default/rdmp/api/sendNotification?apiVersion=' + version,
            'POST',
            {
              ...auth,
              Authorization: 'Bearer pilot-api-token',
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
            },
            JSON.stringify({
              to: 'recipient@example.invalid',
              from: 'sender@example.invalid',
              format: 'text',
              subject: 'Notification',
              template: 'test',
              data: { name: 'Alpha' },
              otherSendOptions: {
                ...(replyTo ? { replyTo } : {}),
                attachments: [{ content: 'UNTRUSTED_ATTACHMENT' }],
                headers: { 'X-Untrusted': 'untrusted' },
                to: 'untrusted@example.invalid',
                subject: 'UNTRUSTED_SUBJECT',
              },
            })
          );
          assert.equal(response.status, 200, response.text);
          assert.equal(provider.deliveries.length, 1);
          const message = provider.deliveries[0];
          assert.match(
            message,
            new RegExp('^Reply-To: ' + (replyTo ?? trustedReply).replace(/\./g, '\\.') + '\\r?$', 'm')
          );
          assert.match(message, /^To: recipient@example\.invalid\r?$/m);
          assert.match(message, /^Subject: Notification\r?$/m);
          assert.equal(/^X-Trusted: retained\r?$/im.test(message), defaults);
          assert.doesNotMatch(message, /X-Untrusted|untrusted@example|UNTRUSTED_(?:ATTACHMENT|SUBJECT)/i);
          const { wire: envelope, state } = await normalizeIntegrations(f, response);
          assertGolden('notificationOptions', key, {
            wire: envelope,
            state,
            providers: {
              calls: provider.calls,
              deliveries: provider.deliveries.map(text => text.replace(/^(Message-ID|Date):.*$/gm, '$1: <generated>')),
            },
          });
        } finally {
          await f.close();
        }
      } finally {
        await provider.close();
      }
    });
});
goldenControls('notificationOptions');
