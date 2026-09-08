import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { expect as playwrightExpect } from '@playwright/test';
import { describe, it } from 'mocha';
import ts from 'typescript';

const specPath = path.resolve(__dirname, '../../../../test/playwright/authorization-live-smoke.spec.ts');
const compiledSpec = ts.transpileModule(readFileSync(specPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadSpec = vm.compileFunction(compiledSpec, ['require', 'exports', 'process'], { filename: specPath });
const apiBase = '/default/rdmp/api/authorization';
const assignmentPath = `${apiBase}/assignments/smoke-role/users/playwright-live-smoke-user`;
const reason = 'playwright live authorization smoke (automated reversible check)';

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

interface Scenario {
  grant?: Record<string, unknown>;
  preExisting?: boolean;
  failListAfterGrant?: boolean;
  cleanupItems?: Array<{ status: string; version: number }>;
}

function createSmokeRun(scenario: Scenario = {}) {
  const calls: Array<{ method: string; url: string; options: RequestOptions }> = [];
  const heading = {};
  const skipped = new Error('smoke skipped');
  let granted = false;
  let revoked = false;
  let defaultHeaders: Record<string, string> = {};
  const response = (body: unknown, status = 200) => ({
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => body,
  });
  const record = (method: string, url: string, options: RequestOptions = {}) => {
    const effectiveOptions = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    calls.push({ method, url, options: effectiveOptions });
  };
  const fixtures = {
    page: { goto: async () => {}, locator: () => heading },
    request: {
      get: async (url: string, options?: RequestOptions) => {
        record('GET', url, options);
        if (url === `${apiBase}/me`) return response({ rolloutMode: 'legacy' });
        if (url === `${apiBase}/roles`) {
          return response({ items: [{ key: 'smoke-role', protectedKind: 'none', status: 'active' }] });
        }
        if (url === '/csrfToken') return response({ _csrf: 'request-session-token' });
        assert.equal(url, `${apiBase}/assignments`);
        if (revoked) return response({ items: scenario.cleanupItems ?? [{ status: 'revoked', version: 8 }] });
        if (granted && scenario.failListAfterGrant) return response({}, 503);
        return response({ items: scenario.preExisting || granted ? [{ status: 'active', version: 7 }] : [] });
      },
      put: async (url: string, options: RequestOptions) => {
        record('PUT', url, options);
        granted = true;
        return response(scenario.grant ?? { changed: true, version: 7, auditEventId: 'audit-grant' });
      },
      delete: async (url: string, options: RequestOptions) => {
        record('DELETE', url, options);
        revoked = true;
        return response({ changed: true, version: 8 });
      },
    },
  };
  let run: ((input: typeof fixtures) => Promise<void>) | undefined;
  const test = Object.assign(
    (_title: string, callback: NonNullable<typeof run>) => {
      assert.equal(run, undefined, 'the live smoke spec must register one workflow');
      run = callback;
    },
    {
      describe: (_title: string, callback: () => void) => callback(),
      skip: (condition: boolean) => {
        if (condition) throw skipped;
      },
      use: (options: { extraHTTPHeaders?: Record<string, string> }) => {
        defaultHeaders = options.extraHTTPHeaders ?? {};
      },
    }
  );
  // Execute the actual workflow, including its assertions and finally block.
  // Only registration, browser visibility, and the external API are replaced.
  const expect = Object.assign(
    (actual: unknown, message?: string) =>
      actual === heading ? { toBeVisible: async () => {} } : playwrightExpect(actual, message),
    playwrightExpect
  );
  loadSpec(
    (specifier: string) => {
      if (specifier === '@playwright/test') return { test, expect };
      if (specifier === './helpers') return { adminStorageStatePath: 'unused-admin-state.json' };
      throw new Error(`Unexpected smoke spec import: ${specifier}`);
    },
    {},
    { env: { PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE: '1' } }
  );
  assert.ok(run, 'the live smoke workflow must be registered');
  const workflow = run;
  return { calls, skipped, run: () => workflow(fixtures) };
}

function assertOwnedCleanup(smoke: ReturnType<typeof createSmokeRun>) {
  const mutations = smoke.calls.filter(call => call.method !== 'GET');
  assert.equal(mutations.length, 2, 'an owned grant must be revoked exactly once');
  assert.equal(mutations[0].method, 'PUT');
  assert.equal(mutations[1].method, 'DELETE');
  for (const mutation of mutations) {
    assert.equal(mutation.url, assignmentPath);
    assert.equal(mutation.options.headers?.['X-CSRF-Token'], 'request-session-token');
    assert.equal(mutation.options.data?.reason, reason);
  }
  assert.equal(mutations[1].options.data?.expectedVersion, 7, 'revoke must use the owned grant version');
  const verification = smoke.calls.at(-1);
  assert.equal(verification?.method, 'GET');
  assert.equal(verification?.url, `${apiBase}/assignments`);
  assert.equal(verification?.options.params?.userId, 'playwright-live-smoke-user');
  assert.equal(verification?.options.params?.roleKey, 'smoke-role');
}

describe('authorization live smoke cleanup', () => {
  for (const auditEventId of [undefined, 123]) {
    it(`revokes its owned version when the grant audit ID is ${String(auditEventId)}`, async () => {
      const smoke = createSmokeRun({ grant: { changed: true, version: 7, auditEventId } });
      await assert.rejects(smoke.run, /grant must return an audit event identity/);
      assertOwnedCleanup(smoke);
    });
  }

  it('revokes its owned version after later verification fails', async () => {
    const smoke = createSmokeRun({ failListAfterGrant: true });
    await assert.rejects(smoke.run, /live GET \/assignments failed with 503/);
    assertOwnedCleanup(smoke);
  });

  it('revokes and verifies a successful grant using API v1 throughout', async () => {
    const smoke = createSmokeRun();
    await smoke.run();
    assertOwnedCleanup(smoke);
    for (const call of smoke.calls) {
      assert.equal(call.options.headers?.['X-ReDBox-Api-Version'], '1.0');
    }
  });

  for (const changed of [false, undefined, 'true']) {
    it(`does not claim ownership for changed=${String(changed)} even when the audit ID is missing`, async () => {
      const smoke = createSmokeRun({ grant: { changed, version: 7 } });
      await assert.rejects(smoke.run, /grant must return an audit event identity/);
      assert.equal(smoke.calls.filter(call => call.method === 'PUT').length, 1);
      assert.equal(smoke.calls.filter(call => call.method === 'DELETE').length, 0);
    });
  }

  it('leaves a successful concurrent no-op untouched', async () => {
    const smoke = createSmokeRun({ grant: { changed: false, version: 7, auditEventId: 'other-writer-audit' } });
    await smoke.run();
    assert.equal(smoke.calls.filter(call => call.method === 'DELETE').length, 0);
  });

  it('never revokes with an unvalidated grant version', async () => {
    const smoke = createSmokeRun({ grant: { changed: true, version: '7', auditEventId: 'audit-grant' } });
    await assert.rejects(smoke.run, /grant must return a versioned mutation result/);
    assert.equal(smoke.calls.filter(call => call.method === 'DELETE').length, 0);
  });

  it('skips a pre-existing assignment without mutations', async () => {
    const smoke = createSmokeRun({ preExisting: true });
    await assert.rejects(smoke.run, error => error === smoke.skipped);
    assert.equal(smoke.calls.filter(call => call.method !== 'GET').length, 0);
  });

  for (const cleanupItems of [[{ status: 'active', version: 8 }], [{ status: 'revoked', version: 9 }], []]) {
    it(`rejects incomplete cleanup with retained rows ${JSON.stringify(cleanupItems)}`, async () => {
      const smoke = createSmokeRun({ cleanupItems });
      await assert.rejects(smoke.run, /must have no active row|must retain the assignment row/);
      assertOwnedCleanup(smoke);
    });
  }
});
