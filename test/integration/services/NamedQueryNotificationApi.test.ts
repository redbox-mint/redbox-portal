const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import supertest from 'supertest';
import { of, firstValueFrom } from 'rxjs';
import { NamedQueryConfig } from '../../../packages/redbox-core/src/services/NamedQueryService';
import { ListAPIResponse } from '../../../packages/redbox-core/src/model/ListAPIResponse';
import { fixturePatch, fixtureRow } from '../../helpers/persistenceFixtures';

describe('Named query and notification API parameters', function () {
  let request: supertest.Agent;
  const token = 'd077835a-696b-4728-85cf-3ffd57152b1e';

  let adminId: string | number;
  let originalToken: string | null | undefined;

  before(async function () {
    request = supertest.agent(fixture.server);
    const admin = await fixtureRow('User', { username: 'admin' });
    if (!admin) throw new Error('Integration admin fixture is missing');
    adminId = admin.id;
    originalToken = admin.token;
    await firstValueFrom(fixture.services.UsersService.setUserKey(adminId, token));
  });

  after(async function () {
    if (adminId) await fixturePatch('User', { id: adminId }, { token: originalToken });
  });

  it('passes custom query parameters from the bearer-authenticated HTTP request', async function () {
    const getConfig = fixture.services.NamedQueryService.getNamedQueryConfig;
    const perform = fixture.services.NamedQueryService.performNamedQueryFromConfig;
    let received: Record<string, unknown> | undefined;
    try {
      fixture.services.NamedQueryService.getNamedQueryConfig = async () => new NamedQueryConfig({ collectionName: 'record' });
      fixture.services.NamedQueryService.performNamedQueryFromConfig = async (_config, params) => {
        received = params;
        return new ListAPIResponse();
      };
      await request
        .get('/default/rdmp/api/report/namedQuery')
        .set('Authorization', `Bearer ${token}`)
        .query({
          queryName: 'customParams',
          projectEndDateStart: '2026-10-21',
          projectEndDateDays: '30',
          start: '0',
          rows: '100',
        })
        .expect(200);
      expect(received).to.include({ projectEndDateStart: '2026-10-21', projectEndDateDays: '30' });
    } finally {
      fixture.services.NamedQueryService.getNamedQueryConfig = getConfig;
      fixture.services.NamedQueryService.performNamedQueryFromConfig = perform;
    }
  });

  it('forwards replyTo while stripping unsafe nodemailer options over HTTP', async function () {
    // Stub the send boundary: this test must never contact an SMTP server.
    const send = fixture.services.EmailService.sendMessage;
    let received: Record<string, unknown> | undefined;
    try {
      fixture.services.EmailService.sendMessage = (_to, _body, _subject, _from, _format, _cc, _bcc, options) => {
        received = options;
        return of({ success: true, msg: 'Email sent successfully. Mock transport.' });
      };
      await request
        .post('/default/rdmp/api/sendNotification')
        .set('Authorization', `Bearer ${token}`)
        .send({
          to: 'to@example.com',
          template: 'test',
          data: { data: 'test' },
          otherSendOptions: {
            replyTo: 'staffsupport-lib@uwa.edu.au',
            attachments: [{ path: '/etc/passwd' }],
            headers: { 'X-Test': 'unsafe' },
          },
        })
        .expect(200);
      expect(received).to.deep.equal({ replyTo: 'staffsupport-lib@uwa.edu.au' });
    } finally {
      fixture.services.EmailService.sendMessage = send;
    }
  });
});
