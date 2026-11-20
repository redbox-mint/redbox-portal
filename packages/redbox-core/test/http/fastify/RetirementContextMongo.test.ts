import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sinon from 'sinon';
import type { ConfiguredActionContext } from '../../../src/http/actions/configuredActions';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { normalizeMutation, session, wire, type Wire } from './mutationDifferentialSupport';
import { assertGolden, golden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

describe('Named configured actions through production HTTP', function () {
  this.timeout(120000);
  for (const asynchronous of [false, true])
    it(
      asynchronous
        ? 'awaits asynchronous operation data before responding and auditing'
        : 'invokes the selected operation once with explicit actor and request facts',
      async () => {
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const trace: string[] = [];
        const contexts: ConfiguredActionContext[] = [];
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: mutationDeclarations,
          actions: {
            testAction: {
              authorize: async context => {
                trace.push('authorize');
                contexts.push(context);
                return true;
              },
              execute: async context => {
                trace.push('execute');
                contexts.push(context);
                entered.resolve();
                if (asynchronous) await release.promise;
                trace.push('operation-finished');
                return asynchronous ? { data: 'test' } : { ok: true };
              },
            },
          },
        });
        const sandbox = sinon.createSandbox();
        try {
          const login = await session(f);
          const users = f.data.users.get();
          const audit = users.addUserAuditEvent.bind(users);
          sandbox.stub(users, 'addUserAuditEvent').callsFake((...args) => {
            assert.equal(trace.at(-1), 'operation-finished');
            trace.push('audit');
            return audit(...args);
          });
          const pending = wire(
            f.url + '/default/rdmp/action/testAction' + (asynchronous ? '' : '?oid=123'),
            'POST',
            {
              ...login,
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
            },
            JSON.stringify(asynchronous ? {} : { value: 1 })
          ).then(value => {
            trace.push('response');
            return value;
          });
          if (asynchronous) {
            await Promise.race([
              entered.promise,
              pending.then(value => assert.fail(`Response ${value.status} before execution`)),
            ]);
            await new Promise<void>(resolve => setImmediate(resolve));
            assert.deepEqual(trace, ['authorize', 'execute']);
            release.resolve();
          }
          const response = await pending;
          assert.equal(response.status, 200, response.text);
          assert.deepEqual(JSON.parse(response.text), asynchronous ? { data: 'test' } : { ok: true });
          assert.deepEqual(trace, ['authorize', 'execute', 'operation-finished', 'audit', 'response']);
          assert.equal(contexts.length, 2);
          assert.deepEqual(contexts[0], contexts[1]);
          const context = contexts[1];
          assert.deepEqual(Object.keys(context).sort(), ['actor', 'body', 'brand', 'portal', 'query']);
          assert.deepEqual(context.actor, { id: '000000000000000000000015', username: 'pilot-admin' });
          assert.deepEqual({ id: context.brand.id, name: context.brand.name }, { id: f.brand.id, name: f.brand.name });
          assert.equal(context.portal, 'rdmp');
          assert.deepEqual(context.query, asynchronous ? {} : { oid: '123' });
          assert.deepEqual(context.body, asynchronous ? {} : { value: 1 });
          const { wire: envelope, state } = await normalizeMutation(f, response);
          const audits = state.useraudit as { action: string }[];
          assert.equal(audits.filter(a => a.action === 'action:testAction').length, 1);
          assertGolden('retirementContext', `configured-action/${asynchronous}`, {
            wire: envelope,
            state,
            trace,
            contexts: contexts.map(c => ({ ...c, brand: { id: c.brand.id, name: c.brand.name } })),
          });
        } finally {
          release.resolve();
          sandbox.restore();
          await f.close();
        }
      }
    );

  for (const version of ['1.0', '2.0'])
    it(`rejects unregistered and inherited action names before dispatch or audit in API ${version}`, async () => {
      const authorize = sinon.stub().resolves(true);
      const execute = sinon.stub().resolves({ ok: true });
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: mutationDeclarations,
        actions: { owned: { authorize, execute } },
      });
      const sandbox = sinon.createSandbox();
      try {
        const login = await session(f);
        const users = f.data.users.get();
        const audit = sandbox.spy(users, 'addUserAuditEvent');
        const audits = f.client.db().collection('useraudit');
        const readAudits = () => audits.find().sort({ _id: 1 }).toArray();
        const before = await readAudits();
        const expected = golden(
          'mutation',
          `default post /:branding/:portal/action/:action ${version} typed-missing`
        ) as { wire: Wire };
        const submit = (name: string) =>
          wire(
            f.url + '/default/rdmp/action/' + name + '?apiVersion=' + version,
            'POST',
            { ...login, Origin: referenceOrigin, 'Content-Type': 'application/json' },
            '{}'
          );
        for (const name of ['missing', 'toString', 'constructor', '__proto__']) {
          const response = await withoutSideEffects(f, () => submit(name), {
            ignorePorts: ['audit:addUserAuditEvent'],
          });
          assert.equal(response.status, 404, name);
          // The retired FM-026 differential recorded these exact headers and body.
          const headers = { ...response.headers };
          for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
          assert.deepEqual({ ...response, headers }, expected.wire, name);
          sinon.assert.notCalled(authorize);
          sinon.assert.notCalled(execute);
          sinon.assert.notCalled(audit);
          assert.deepEqual(await readAudits(), before, name);
        }
        const allowed = await submit('owned');
        assert.equal(allowed.status, 200);
        assert.deepEqual(JSON.parse(allowed.text), version === '1.0' ? { ok: true } : { data: { ok: true }, meta: {} });
        sinon.assert.calledOnce(authorize);
        sinon.assert.calledOnce(execute);
        sinon.assert.calledOnce(audit);
        assert.equal(await audits.countDocuments({ action: 'action:owned' }), 1);
      } finally {
        sandbox.restore();
        await f.close();
      }
    });
});

function pageEnvelope(value: Wire): Wire {
  const headers = { ...value.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers.expires && headers.expires !== '0') headers.expires = '<time>';
  for (const key of ['content-security-policy', 'content-security-policy-report-only'])
    if (typeof headers[key] === 'string') headers[key] = headers[key].replace(/nonce-[^' ;]+/g, 'nonce-<nonce>');
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(cookie =>
      cookie.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return {
    ...value,
    headers,
    text: value.text.replace(/(nonce|ngCspNonce)="[^"]+"/g, '$1="<nonce>"').replace(/[a-f0-9]{64}/g, '<csrf>'),
  };
}

describe('Browser language through production rendering and sessions', function () {
  this.timeout(120000);
  for (const [key, locale, query, reuse] of [
    ['should set language in session and locals', 'fr', '?lng=fr', false],
    ['should use session language when param not provided', 'fr', '?lng=fr', true],
    ['should fall back to default for unsupported language', 'en', '?lng=unsupported', false],
  ] as const)
    it(key, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: referenceReadDeclarations,
        pages: {},
        configuration: {
          i18n: { next: { init: { debug: false, supportedLngs: ['en', 'fr'], preload: ['en', 'fr'] } } },
        },
        artifacts: async directory => {
          const locale = path.join(directory, 'locales', 'fr');
          await mkdir(locale, { recursive: true });
          await writeFile(path.join(locale, 'translation.json'), JSON.stringify({ home: 'Accueil' }));
        },
      });
      try {
        const target = f.url + '/default/rdmp/home';
        const { Cookie } = await session(f);
        const requestHeaders = { Cookie, Accept: 'text/html' };
        const first = await wire(target + query, 'GET', requestHeaders);
        const wires = [first];
        if (reuse) wires.push(await wire(target, 'GET', requestHeaders));
        for (const result of wires) {
          assert.equal(result.status, 200, String(result.headers.location ?? result.text));
          assert.match(result.text, new RegExp(`<html lang="${locale}">`));
        }
        const persisted = await f.client.db().collection('referenceSessions').find().toArray();
        const sessions = persisted.map(row => {
          const { branding, portal, langCode } = JSON.parse(row.session);
          return { branding, portal, langCode };
        });
        assert.deepEqual(
          sessions.filter(s => s.langCode !== undefined),
          [{ branding: 'default', portal: 'rdmp', langCode: locale }]
        );
        assertGolden('retirementContext', 'language/' + locale + '/' + reuse, {
          wire: wires.map(pageEnvelope),
          sessions,
        });
      } finally {
        await f.close();
      }
    });
});
goldenControls('retirementContext');
