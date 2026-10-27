import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountFormVocabularyRoutes } from '../../src/http/express/formVocabulary';
import { mountConfigurationWriteRoutes } from '../../src/http/express/configurationWrites';
import { mountMetadataReadRoutes } from '../../src/http/express/metadata';
import { mountIdentityAdministrationRoutes } from '../../src/http/express/identityAdministration';
import { mountVocabularyIntegrationRoutes } from '../../src/http/express/vocabularyIntegrations';
import { httpRecordPagesFixture } from '../helpers/httpRecordPagesFixture';

describe('Legacy HTTP input acceptance', () => {
  it('retains a bodyless browser vocabulary sync for the latest version', async () => {
    const syncRvaVocabulary = sinon.stub().resolves({ updated: 1 });
    const f = await httpRouteFixture((router, input) =>
      mountVocabularyIntegrationRoutes(router, {
        ...input,
        vocabulary: { getById: async () => ({ branding: 'brand-1' }) },
        rva: { syncRvaVocabulary },
        audit: async () => {},
      } as any)
    );
    try {
      assert.equal((await f.request('/default/portal/admin/vocabulary/vocab-1/sync', { method: 'POST' })).status, 200);
      assert.deepEqual(syncRvaVocabulary.firstCall.args, ['vocab-1', undefined]);
      assert.equal(
        (await f.request('/default/portal/api/vocabulary/vocab-1/sync', { method: 'POST' })).status,
        400,
        'The existing REST contract still requires a body'
      );
    } finally {
      await f.close();
    }
  });

  for (const suffix of ['/record/rdmp/edit?oid=oid-1', '/record/edit/oid-1?oid=other-record']) {
    it(`retains existing-record editing and route identifier precedence ${suffix}`, async () => {
      const f = await httpRecordPagesFixture();
      try {
        const response = await f.request('/default/portal' + suffix);
        assert.equal(response.status, 200);
        assert.equal(f.loadRecord.callCount, 1);
        assert.equal(f.loadRecord.firstCall.args[0], 'oid-1');
        assert.match(response.text, /Saved title/);
        assert.match(response.text, /oid-1/);
      } finally {
        await f.close();
      }
    });
  }
  for (const suffix of ['/record/form/rdmp?oid=oid-1', '/record/form/rdmp/oid-1?oid=other-record']) {
    it(`retains existing-record form delivery and route identifier precedence ${suffix}`, async () => {
      const f = await httpRecordPagesFixture();
      try {
        const response = await f.request('/default/portal' + suffix + '&edit=true&apiVersion=2.0');
        assert.equal(response.status, 200);
        assert.equal(f.loadRecord.callCount, 1);
        assert.equal(f.loadRecord.firstCall.args[0], 'oid-1');
        assert.equal(response.body.meta.oid, 'oid-1');
        assert.equal(response.body.meta.revision, 3);
      } finally {
        await f.close();
      }
    });
  }
  for (const [query, expectedLocale, expectedNamespace] of [
    ['', undefined, 'translation'],
    ['?locale=en', 'en', 'translation'],
    ['?locale=en&namespace=', 'en', 'translation'],
    ['?locale=&namespace=custom', '', 'custom'],
  ] as const) {
    it(`retains optional translation listing filters ${query}`, async () => {
      const listEntries = sinon.stub().resolves([]);
      const f = await httpRouteFixture((router, input) =>
        mountMetadataReadRoutes(router, { ...input, translations: { listEntries } } as any)
      );
      try {
        const response = await f.request('/default/portal/app/i18n/entries' + query);
        assert.equal(response.status, 200);
        assert.equal(listEntries.firstCall.args[1], expectedLocale);
        assert.equal(listEntries.firstCall.args[2], expectedNamespace);
      } finally {
        await f.close();
      }
    });
  }

  for (const action of ['genKey', 'revokeKey', 'update', 'roles']) {
    it(`retains body.userid over unrelated query.id for browser admin ${action}`, async () => {
      const userid = '111111111111111111111111',
        otherId = '222222222222222222222222';
      const accounts = new Map(
        [userid, otherId].map(id => [
          id,
          { id, username: id, name: 'Original', token: 'original-token', roles: [] as string[] },
        ])
      );
      const otherBefore = structuredClone(accounts.get(otherId));
      const requireUserInBrand = sinon.stub().callsFake(async id => accounts.get(id));
      const setUserKey = sinon.stub().callsFake((id, token) => {
        accounts.get(id)!.token = token;
        return of(accounts.get(id));
      });
      const updateUserDetails = sinon.stub().callsFake((id, name) => {
        accounts.get(id)!.name = name;
        return of([accounts.get(id)]);
      });
      const updateUserRoles = sinon.stub().callsFake((id, roles) => {
        accounts.get(id)!.roles = roles;
        return of(accounts.get(id));
      });
      const f = await httpRouteFixture((router, input) =>
        mountIdentityAdministrationRoutes(router, {
          ...input,
          roles: { getRolesWithBrand: () => of([{ id: 'new-role', name: 'Researcher' }]) },
          users: {
            requireUserInBrand,
            setUserKey,
            updateUserDetails,
            updateUserRoles,
            addUserAuditEvent: async () => {},
          },
        } as any)
      );
      try {
        const path = action === 'roles' ? '/admin/roles/user' : '/admin/users/' + action;
        const response = await f.request('/default/portal' + path + '?id=' + otherId, {
          method: 'POST',
          body: { userid, details: { name: 'Updated Name' }, roles: ['Researcher'] },
        });
        assert.equal(response.status, 200);
        assert.equal(requireUserInBrand.firstCall.args[0], userid);
        const operation = action === 'update' ? updateUserDetails : action === 'roles' ? updateUserRoles : setUserKey;
        assert.equal(operation.firstCall.args[0], userid);
        assert.deepEqual(accounts.get(otherId), otherBefore, 'The other account must remain unchanged');
        assert.notDeepEqual(accounts.get(userid), { ...otherBefore, id: userid, username: userid });
      } finally {
        await f.close();
      }
    });
  }

  for (const action of ['genKey', 'revokeKey', 'update', 'roles']) {
    for (const source of ['query.id', 'body.id', 'both']) {
      it(`does not select ${source} when browser admin ${action} omits userid`, async () => {
        const id = '222222222222222222222222';
        const requireUserInBrand = sinon.stub(),
          setUserKey = sinon.stub(),
          updateUserDetails = sinon.stub(),
          updateUserRoles = sinon.stub();
        const f = await httpRouteFixture((router, input) =>
          mountIdentityAdministrationRoutes(router, {
            ...input,
            roles: { getRolesWithBrand: () => of([]) },
            users: { requireUserInBrand, setUserKey, updateUserDetails, updateUserRoles },
          } as any)
        );
        try {
          const path = action === 'roles' ? '/admin/roles/user' : '/admin/users/' + action;
          const query = source === 'body.id' ? '' : '?id=' + id;
          const body = { ...(source === 'query.id' ? {} : { id }), details: { name: 'Updated' }, roles: [] };
          assert.equal((await f.request('/default/portal' + path + query, { method: 'POST', body })).status, 400);
          assert.equal(
            requireUserInBrand.callCount +
              setUserKey.callCount +
              updateUserDetails.callCount +
              updateUserRoles.callCount,
            0
          );
        } finally {
          await f.close();
        }
      });
    }
  }

  for (const query of ['?locale[bad]=en', '?namespace[bad]=translation', '?keyPrefix[bad]=a']) {
    it(`rejects structured translation filters ${query}`, async () => {
      const listEntries = sinon.stub();
      const f = await httpRouteFixture((router, input) =>
        mountMetadataReadRoutes(router, { ...input, translations: { listEntries } } as any)
      );
      try {
        assert.equal((await f.request('/default/portal/app/i18n/entries' + query)).status, 400);
        assert.equal(listEntries.callCount, 0);
      } finally {
        await f.close();
      }
    });
  }

  // R12 deliberately permits a missing body only for this legacy query toggle.
  for (const [query, body, expected] of [
    ['true', undefined, true],
    ['false', undefined, false],
    ['false', { enabled: true }, true],
    ['true', { enabled: false }, true],
    ['', { enabled: 'false' }, false],
  ] as const) {
    it(`retains translation toggle query=${query} body=${JSON.stringify(body)}`, async () => {
      const updateBundleEnabled = sinon.stub().resolves({ enabled: expected });
      const f = await httpRouteFixture((router, input) =>
        mountConfigurationWriteRoutes(router, {
          ...input,
          translations: { updateBundleEnabled },
          reloadTranslations: async () => {},
        } as any)
      );
      try {
        const response = await f.request(
          '/default/portal/app/i18n/bundles/en/translation/enabled' + (query ? '?enabled=' + query : ''),
          { method: 'POST', body }
        );
        assert.equal(response.status, 200);
        assert.equal(updateBundleEnabled.firstCall.args[3], expected);
      } finally {
        await f.close();
      }
    });
  }
  for (const [suffix, body] of [
    ['/enabled?enabled=true', []],
    ['', undefined],
    ['/enabled?enabled[bad]=true', undefined],
    ['/enabled', { enabled: {} }],
  ] as const) {
    it(`retains translation write validation ${suffix} ${JSON.stringify(body)}`, async () => {
      const updateBundleEnabled = sinon.stub(),
        setBundle = sinon.stub();
      const f = await httpRouteFixture((router, input) =>
        mountConfigurationWriteRoutes(router, {
          ...input,
          translations: { updateBundleEnabled, setBundle },
          reloadTranslations: async () => {},
        } as any)
      );
      try {
        const response = await f.request('/default/portal/app/i18n/bundles/en/translation' + suffix, {
          method: 'POST',
          body,
        });
        assert.equal(response.status, 400);
        assert.equal(updateBundleEnabled.callCount + setBundle.callCount, 0);
      } finally {
        await f.close();
      }
    });
  }
  // FormVocabularyController at a49366803 used toBoolean, including these spellings.
  for (const [raw, expected] of [
    ['true', true],
    ['TRUE', true],
    [' t ', true],
    ['1', true],
    ['yes', true],
    ['y', true],
    ['on', true],
    ['enable', true],
    ['enabled', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['', false],
  ] as const) {
    it(`retains includeHistoricalValues=${JSON.stringify(raw)}`, async () => {
      const getEntries = sinon.stub().resolves({ entries: [], meta: {} });
      const f = await httpRouteFixture((router, input) =>
        mountFormVocabularyRoutes(router, { ...input, vocabulary: { getEntries } } as any)
      );
      try {
        const response = await f.request(
          '/default/portal/vocab/subjects/entries?includeHistoricalValues=' + encodeURIComponent(raw)
        );
        assert.equal(response.status, 200);
        assert.equal(getEntries.firstCall.args[2].includeHistoricalValues, expected);
      } finally {
        await f.close();
      }
    });
  }

  for (const [values, expected] of [
    [
      ['a,b', 'c'],
      ['a', 'b', 'c'],
    ],
    [
      [' a,b ', 'b,c', '', 'a'],
      ['a', 'b', 'c'],
    ],
    [[Array.from({ length: 101 }, () => 'a').join(',')], ['a']],
    [['a,b,c'], ['a', 'b', 'c']],
  ] as const) {
    it(`splits and deduplicates ${values.length} notation parameters before the unique-value limit`, async () => {
      const expandPaths = sinon.stub().resolves({ paths: [], meta: {} });
      const f = await httpRouteFixture((router, input) =>
        mountFormVocabularyRoutes(router, { ...input, vocabulary: { expandPaths } } as any)
      );
      try {
        const query = new URLSearchParams();
        values.forEach(value => query.append('notation', value));
        const response = await f.request('/default/portal/vocab/subjects/expandPath?' + query);
        assert.equal(response.status, 200);
        assert.deepEqual(expandPaths.firstCall.args[2], expected);
      } finally {
        await f.close();
      }
    });
  }

  for (const query of [
    'notation[bad]=value',
    'notation=a&notation[bad]=value',
    'notation=',
    'notation=' + Array.from({ length: 101 }, (_, i) => 'n' + i).join(','),
    'includeHistoricalValues[bad]=true',
  ]) {
    it(`rejects malformed or over-limit vocabulary input: ${query.slice(0, 60)}`, async () => {
      const getEntries = sinon.stub(),
        expandPaths = sinon.stub();
      const f = await httpRouteFixture((router, input) =>
        mountFormVocabularyRoutes(router, { ...input, vocabulary: { getEntries, expandPaths } } as any)
      );
      try {
        const action = query.startsWith('include') ? 'entries' : 'expandPath';
        const response = await f.request('/default/portal/vocab/subjects/' + action + '?' + query);
        assert.equal(response.status, 400);
        assert.equal(getEntries.callCount + expandPaths.callCount, 0);
      } finally {
        await f.close();
      }
    });
  }
});
