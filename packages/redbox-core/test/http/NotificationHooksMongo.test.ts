import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { of } from 'rxjs';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { Services as Email } from '../../src/integrations/Email';
import { emailnotification } from '../../src/config/emailnotification.config';
import { migrateRecordHooks } from '../../src/recordTypes';
import { getBrandingRepository } from '../../src/persistence/branding/runtime';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { recordWriteFixture } from './recordWriteFixture';

describe('released-v5 notification hook upgrade on Mongo', function () {
  this.timeout(45000);
  it('migrates publication callbacks, sends the follow-up and persists notification state', async () => {
    const f = await recordWriteFixture();
    const pending: Promise<unknown>[] = [];
    try {
      const fixture = JSON.parse(
        await readFile(
          path.resolve('../../support/specs/sails-retirement/evidence/released-v5-upgrade-fixture.json'),
          'utf8'
        )
      );
      const publication = fixture.collections
        .find((item: { collection: string }) => item.collection === 'recordtype')
        .documents.find((item: { name: string }) => item.name === 'dataPublication');
      assert(publication?.hooks?.onUpdate?.post);
      const types = getReferenceRepositories(f.owner).recordTypes;
      await types.createDefinition({
        name: 'releasedPublication',
        branding: f.brand.id,
        packageType: 'releasedPublication',
        hooks: publication.hooks,
      });
      assert.equal((await migrateRecordHooks({ brands: getBrandingRepository(f.owner), types })).changed, 1);
      assert.equal((await migrateRecordHooks({ brands: getBrandingRepository(f.owner), types })).changed, 0);
      const migrated = await types.findByName(f.brand.id, 'releasedPublication');
      const hook = (migrated!.hooks as typeof publication.hooks).onUpdate.post.find(
        (item: { options?: { template?: string } }) => item.options?.template === 'publicationStaged'
      );
      assert(hook);
      const created = await fetch(f.url + '/default/rdmp/api/records/metadata/dataRecord', {
        method: 'POST',
        headers: { ...f.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Notification repair' }),
      });
      assert.equal(created.status, 201);
      const saved = await created.json();
      const oid = saved.oid;
      assert(oid);
      const email: Email.Email = new Email.Email({
        config: emailnotification,
        log: nothingLogger,
        templateContext: {},
        resolveHook: name => {
          if (name === 'email.sendRecordNotification')
            return (id, record, options, user, response) =>
              email.sendRecordNotification(id, record, options as Record<string, unknown>, user, response);
          if (name === 'record.updateNotificationLog')
            return (id, record, options) =>
              f.writer.updateNotificationLog(id, record, options as Record<string, unknown>);
          throw new Error('Unregistered notification operation');
        },
        retainFollowup: work => {
          pending.push(work);
        },
      });
      // Keep provider transport and template fixtures deterministic; execute the real success pipeline and record writer.
      const messages = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      sinon.stub(email, 'evaluateProperties').callsFake(options => ({
        format: 'html',
        formatRendered: 'html',
        from: '',
        to: '',
        cc: '',
        ccRendered: '',
        bcc: '',
        bccRendered: '',
        subject: '',
        template: null,
        toRendered: String(options.to),
        subjectRendered: String(options.subject),
        fromRendered: 'fixture@example.invalid',
        templateRendered: of({ status: 200, body: 'Rendered publication template' }),
      }));
      const record = await f.storage.getMeta(oid);
      record.notification = { state: 'draft' };
      record.workflow = { ...record.workflow, stage: 'queued' };
      await email.sendRecordNotification(oid, record, hook.options, {}, {});
      while (pending.length) await Promise.all(pending.splice(0));
      assert.equal(messages.callCount, 2);
      assert.equal(messages.secondCall.args[2], 'Data publication ready for review');
      const notified = await f.storage.getMeta(oid);
      const notification = notified.notification as { state: string; log: { reviewing: unknown[] } };
      assert.equal(notification.state, 'emailed-reviewing');
      assert.equal(notification.log.reviewing.length, 1);
    } finally {
      await Promise.allSettled(pending);
      sinon.restore();
      await f.close();
    }
  });
});
